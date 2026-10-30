import { Router } from "express";
import mongoose from "mongoose";
import {
  AuditLog, Attendance, Candidate, Employee, JobOpening, LeaveBalance, LeaveRequest,
  Notification, Payroll, ProfileChange, User,
} from "../models/index.js";
import { notifyUser } from "../utils/notifications.js";
import { requireRole } from "../middleware/auth.js";
import { calendarDaysWithinYear } from "../utils/hr.js";

const router = Router();
const defaultEntitlements = { Annual: 20, Sick: 10, Personal: 5, Parental: 90 };
const employeeFields = { path: "employee", select: "name email department jobTitle" };

function isValidDate(value) {
  return value && !Number.isNaN(new Date(value).getTime());
}

function dateFilter(query, field) {
  const filter = {};
  if (query.startDate && isValidDate(query.startDate)) filter.$gte = new Date(query.startDate);
  if (query.endDate && isValidDate(query.endDate)) {
    const end = new Date(query.endDate);
    end.setDate(end.getDate() + 1);
    filter.$lt = end;
  }
  return Object.keys(filter).length ? { [field]: filter } : {};
}

function csvCell(value) {
  const text = value == null ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

router.get("/notifications", async (req, res) => {
  const data = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  return res.json({ data, unread: data.filter((item) => !item.readAt).length });
});

router.patch("/notifications/:id/read", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid notification ID is required." });
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { readAt: new Date() },
    { new: true },
  );
  if (!notification) return res.status(404).json({ message: "Notification not found." });
  return res.json({ data: notification });
});

router.get("/audit-logs", requireRole("admin", "hr"), async (req, res) => {
  if ((req.query.startDate && !isValidDate(req.query.startDate)) || (req.query.endDate && !isValidDate(req.query.endDate))) {
    return res.status(400).json({ message: "Audit log dates must be valid calendar dates." });
  }
  if (req.query.startDate && req.query.endDate && new Date(req.query.endDate) < new Date(req.query.startDate)) {
    return res.status(400).json({ message: "The audit log end date must be on or after the start date." });
  }
  const filter = {};
  if (req.query.startDate || req.query.endDate) Object.assign(filter, dateFilter(req.query, "createdAt"));
  const data = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200);
  return res.json({ data });
});

router.get("/leave-calendar", requireRole("admin", "hr"), async (req, res) => {
  const filter = { status: "Approved" };
  if ((req.query.startDate && !isValidDate(req.query.startDate)) || (req.query.endDate && !isValidDate(req.query.endDate))) {
    return res.status(400).json({ message: "Calendar dates must be valid calendar dates." });
  }
  if (req.query.startDate && req.query.endDate && new Date(req.query.endDate) < new Date(req.query.startDate)) {
    return res.status(400).json({ message: "The calendar end date must be on or after the start date." });
  }
  if (req.query.startDate || req.query.endDate) {
    const start = req.query.startDate ? new Date(req.query.startDate) : null;
    const end = req.query.endDate ? new Date(req.query.endDate) : null;
    if (end) end.setDate(end.getDate() + 1);
    if (end) filter.startDate = { $lt: end };
    if (start) filter.endDate = { $gte: start };
  }
  if (req.query.department) {
    const employees = await Employee.find({ department: req.query.department }).distinct("_id");
    filter.employee = { $in: employees };
  }
  const data = await LeaveRequest.find(filter).populate(employeeFields).sort({ startDate: 1 }).limit(500);
  return res.json({ data });
});

router.get("/leave-balances", requireRole("admin", "hr"), async (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ message: "Enter a valid leave year." });
  const employeeFilter = req.query.department ? { department: req.query.department } : {};
  const employees = await Employee.find(employeeFilter).sort({ name: 1 }).select("name email department");
  const employeeIds = employees.map(({ _id }) => _id);
  const [balances, approvedLeaves] = await Promise.all([
    LeaveBalance.find({ employee: { $in: employeeIds }, year }),
    LeaveRequest.find({
      employee: { $in: employeeIds },
      status: "Approved",
      startDate: { $lt: new Date(year + 1, 0, 1) },
      endDate: { $gte: new Date(year, 0, 1) },
    }).select("employee type startDate endDate"),
  ]);
  const balanceMap = new Map(balances.map((item) => [`${item.employee}:${item.type}`, item.entitlement]));
  const data = employees.map((employee) => ({
    employee,
    balances: Object.entries(defaultEntitlements).map(([type, defaultValue]) => {
      const used = approvedLeaves.filter((leave) => String(leave.employee) === String(employee._id) && leave.type === type)
        .reduce((total, leave) => total + calendarDaysWithinYear(leave.startDate, leave.endDate, year), 0);
      const entitlement = balanceMap.get(`${employee._id}:${type}`) ?? defaultValue;
      return { type, entitlement, used, remaining: Math.max(0, entitlement - used) };
    }),
  }));
  return res.json({ year, data });
});

router.put("/leave-balances/:employeeId/:type", requireRole("admin", "hr"), async (req, res) => {
  const { employeeId, type } = req.params;
  const year = Number(req.body.year);
  const entitlement = Number(req.body.entitlement);
  if (!mongoose.isValidObjectId(employeeId)) return res.status(400).json({ message: "A valid employee ID is required." });
  if (!Object.hasOwn(defaultEntitlements, type)) return res.status(400).json({ message: "Choose an eligible leave type." });
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isFinite(entitlement) || entitlement < 0 || entitlement > 366) {
    return res.status(400).json({ message: "Enter a valid year and leave allowance from 0 to 366 days." });
  }
  if (!(await Employee.exists({ _id: employeeId }))) return res.status(404).json({ message: "Employee not found." });
  const data = await LeaveBalance.findOneAndUpdate(
    { employee: employeeId, year, type },
    { entitlement },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return res.json({ data });
});

router.get("/profile-changes", requireRole("admin", "hr"), async (_req, res) => {
  const data = await ProfileChange.find().sort({ createdAt: -1 }).limit(200)
    .populate({ path: "employee", select: "name email phone department" });
  return res.json({ data });
});

router.patch("/profile-changes/:id/status", requireRole("admin", "hr"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid profile request ID is required." });
  if (!["Approved", "Declined"].includes(req.body.status)) return res.status(400).json({ message: "Status must be Approved or Declined." });
  const change = await ProfileChange.findOne({ _id: req.params.id, status: "Pending" });
  if (!change) return res.status(404).json({ message: "Pending profile request not found." });
  if (req.body.status === "Approved") {
    const employee = await Employee.findById(change.employee);
    if (!employee) return res.status(404).json({ message: "Employee profile no longer exists." });
    if (change.changes.email && change.changes.email !== employee.email) {
      const conflict = await Employee.exists({ _id: { $ne: employee._id }, email: change.changes.email });
      if (conflict) return res.status(409).json({ message: "That email address is already used by another employee." });
      const account = await User.findOne({ employee: employee._id });
      if (account) {
        const accountConflict = await User.exists({ _id: { $ne: account._id }, email: change.changes.email });
        if (accountConflict) return res.status(409).json({ message: "That email address is already used by an account." });
        account.email = change.changes.email;
        await account.save();
      }
      employee.email = change.changes.email;
    }
    if (change.changes.phone !== undefined) employee.phone = change.changes.phone;
    await employee.save();
  }
  change.status = req.body.status;
  change.reviewedBy = req.user._id;
  await change.save();
  await notifyUser(change.requestedBy, "Profile request reviewed", `Your profile update request was ${change.status.toLowerCase()}.`, "/employee");
  return res.json({ data: change });
});

async function getReportData(filters) {
  const { module: reportModule } = filters;
  if ((filters.startDate && !isValidDate(filters.startDate)) || (filters.endDate && !isValidDate(filters.endDate))) {
    throw Object.assign(new Error("Report dates must be valid calendar dates."), { status: 400 });
  }
  if (filters.startDate && filters.endDate && new Date(filters.endDate) < new Date(filters.startDate)) {
    throw Object.assign(new Error("The report end date must be on or after the start date."), { status: 400 });
  }
  const departmentFilter = {};
  if (filters.department) {
    const employeeIds = await Employee.find({ department: filters.department }).distinct("_id");
    departmentFilter.employee = { $in: employeeIds };
  }
  const dateField = reportModule === "employees" ? "hireDate" : reportModule === "payroll" ? "period" : "date";
  const range = reportModule === "payroll"
    ? {
      ...(filters.startDate ? { period: { $gte: String(filters.startDate).slice(0, 7) } } : {}),
      ...(filters.endDate ? { period: { ...(filters.startDate ? { $gte: String(filters.startDate).slice(0, 7) } : {}), $lte: String(filters.endDate).slice(0, 7) } } : {}),
    }
    : dateFilter(filters, dateField);
  let model;
  let filter = {};
  if (reportModule === "employees") {
    model = Employee;
    filter = { ...range, ...(filters.department ? { department: filters.department } : {}) };
  } else if (reportModule === "attendance") {
    model = Attendance;
    filter = { ...range, ...departmentFilter };
  } else if (reportModule === "leaves") {
    model = LeaveRequest;
    const rangeStart = filters.startDate ? new Date(filters.startDate) : null;
    const rangeEnd = filters.endDate ? new Date(filters.endDate) : null;
    if (rangeEnd) rangeEnd.setDate(rangeEnd.getDate() + 1);
    const overlap = {};
    if (rangeEnd) overlap.startDate = { $lt: rangeEnd };
    if (rangeStart) overlap.endDate = { $gte: rangeStart };
    filter = { ...overlap, ...departmentFilter };
  } else if (reportModule === "payroll") {
    model = Payroll;
    filter = { ...range, ...departmentFilter };
  } else throw Object.assign(new Error("Choose employees, attendance, leaves, or payroll for the report."), { status: 400 });
  const query = model.find(filter);
  if (reportModule !== "employees") query.populate(employeeFields);
  const data = await query.sort({ createdAt: -1 }).limit(1000);
  return { module: reportModule, data };
}

router.get("/reports", requireRole("admin", "hr"), async (req, res) => {
  return res.json(await getReportData(req.query));
});

router.get("/reports/export", requireRole("admin", "hr"), async (req, res) => {
  const { module: reportModule } = req.query;
  const { data: records } = await getReportData(req.query);
  const columns = reportModule === "employees"
    ? ["name", "email", "department", "jobTitle", "hireDate", "status", "salary"]
    : reportModule === "attendance"
      ? ["employee", "date", "checkIn", "checkOut", "hoursWorked", "status"]
      : reportModule === "leaves"
        ? ["employee", "type", "startDate", "endDate", "status"]
        : ["employee", "period", "baseSalary", "bonus", "deductions", "netPay", "status"];
  const lines = [columns.join(","), ...records.map((record) => columns.map((column) => {
    const value = column === "employee" ? record.employee?.name || "" : record[column];
    return csvCell(value);
  }).join(","))];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="peopledesk-${reportModule}-report.csv"`);
  return res.send(lines.join("\r\n"));
});

router.get("/jobs", requireRole("admin", "hr"), async (_req, res) => {
  const data = await JobOpening.find().sort({ createdAt: -1 }).limit(200);
  return res.json({ data });
});

router.post("/jobs", requireRole("admin", "hr"), async (req, res) => {
  if (!req.body.title || !req.body.department) return res.status(400).json({ message: "Job title and department are required." });
  const data = await JobOpening.create({
    title: req.body.title,
    department: req.body.department,
    location: req.body.location,
    employmentType: req.body.employmentType,
    description: req.body.description,
  });
  return res.status(201).json({ data });
});

router.patch("/jobs/:id/status", requireRole("admin", "hr"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid job ID is required." });
  if (!["Open", "Closed"].includes(req.body.status)) return res.status(400).json({ message: "Job status must be Open or Closed." });
  const data = await JobOpening.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
  if (!data) return res.status(404).json({ message: "Job opening not found." });
  return res.json({ data });
});

router.patch("/candidates/:id/interview", requireRole("admin", "hr"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid candidate ID is required." });
  const interviewAt = req.body.interviewAt ? new Date(req.body.interviewAt) : null;
  if (req.body.interviewAt && Number.isNaN(interviewAt.getTime())) return res.status(400).json({ message: "Enter a valid interview date and time." });
  const data = await Candidate.findByIdAndUpdate(req.params.id, { interviewAt }, { new: true, runValidators: true });
  if (!data) return res.status(404).json({ message: "Candidate not found." });
  return res.json({ data });
});

router.patch("/candidates/:id/notes", requireRole("admin", "hr"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid candidate ID is required." });
  if (typeof req.body.notes !== "string" || req.body.notes.length > 3000) return res.status(400).json({ message: "Candidate notes must be 3000 characters or fewer." });
  const data = await Candidate.findByIdAndUpdate(req.params.id, { notes: req.body.notes }, { new: true, runValidators: true });
  if (!data) return res.status(404).json({ message: "Candidate not found." });
  return res.json({ data });
});

export default router;
