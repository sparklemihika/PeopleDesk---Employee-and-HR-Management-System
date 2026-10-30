import { Router } from "express";
import mongoose from "mongoose";
import {
  Attendance, Candidate, Employee, JobOpening, LeaveBalance, LeaveRequest, Payroll, PerformanceReview,
} from "../models/index.js";
import { calculateHours, calculateNetPay, calendarDaysWithinYear } from "../utils/hr.js";
import { notifyEmployee, notifyHr } from "../utils/notifications.js";

const router = Router();
const populateEmployee = { path: "employee", select: "name email department jobTitle" };
const defaultEntitlements = { Annual: 20, Sick: 10, Personal: 5, Parental: 90 };

function isObjectId(value) {
  return mongoose.isValidObjectId(value);
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
  return missing.length ? `Required fields: ${missing.join(", ")}.` : "";
}

function asDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error(`${field} must be a valid date.`), { status: 400 });
  return date;
}

function validEmployeeId(value) {
  if (!isObjectId(value)) throw Object.assign(new Error("A valid employee ID is required."), { status: 400 });
  return value;
}

async function ensureEmployeeExists(id) {
  const employeeId = validEmployeeId(id);
  if (!(await Employee.exists({ _id: employeeId }))) {
    throw Object.assign(new Error("The selected employee does not exist."), { status: 404 });
  }
  return employeeId;
}

async function listRecords(res, query, options = {}) {
  const data = await query.sort({ createdAt: -1 }).limit(200).populate(options.populate || []);
  return res.json({ data });
}

router.get("/employees", async (req, res) => listRecords(res, Employee.find()));
router.post("/employees", async (req, res) => {
  const error = requireFields(req.body, ["name", "email", "department", "jobTitle", "hireDate"]);
  if (error) return res.status(400).json({ message: error });
  const employee = await Employee.create({
    name: req.body.name, email: req.body.email, department: req.body.department, jobTitle: req.body.jobTitle,
    phone: req.body.phone, hireDate: asDate(req.body.hireDate, "Hire date"), employmentType: req.body.employmentType,
    salary: req.body.salary,
  });
  await notifyHr("Employee added", `${employee.name} was added to the employee directory.`, "/employees");
  return res.status(201).json({ data: employee });
});

router.get("/attendance", async (req, res) => listRecords(res, Attendance.find().populate(populateEmployee)));
router.post("/attendance", async (req, res) => {
  const error = requireFields(req.body, ["employeeId", "date"]);
  if (error) return res.status(400).json({ message: error });
  const status = req.body.status || "Present";
  if (!["Present", "Late", "Absent", "On leave"].includes(status)) {
    return res.status(400).json({ message: "Status must be Present, Late, Absent, or On leave." });
  }
  const checkIn = status === "Absent" ? "" : req.body.checkIn || "";
  if (status !== "Absent" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkIn)) {
    return res.status(400).json({ message: "Check-in time must use the HH:mm format unless marking an absence." });
  }
  const employee = await ensureEmployeeExists(req.body.employeeId);
  const attendance = await Attendance.create({
    employee, date: asDate(req.body.date, "Date"), checkIn, checkOut: status === "Absent" ? "" : req.body.checkOut,
    status, notes: req.body.notes,
    hoursWorked: status !== "Absent" && req.body.checkOut ? calculateHours(checkIn, req.body.checkOut) : 0,
  });
  await attendance.populate(populateEmployee);
  return res.status(201).json({ data: attendance });
});
router.patch("/attendance/:id/status", async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "A valid attendance record ID is required." });
  if (!["Present", "Absent"].includes(req.body.status)) {
    return res.status(400).json({ message: "Status must be Present or Absent." });
  }
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance) return res.status(404).json({ message: "Attendance record not found." });
  if (req.body.status === "Absent") {
    attendance.status = "Absent";
    attendance.checkIn = "";
    attendance.checkOut = "";
    attendance.hoursWorked = 0;
  } else {
    if (!attendance.checkIn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.checkIn || "")) {
      return res.status(400).json({ message: "A valid check-in time is required when marking an employee present." });
    }
    attendance.status = "Present";
    if (!attendance.checkIn) attendance.checkIn = req.body.checkIn;
  }
  await attendance.save();
  await attendance.populate(populateEmployee);
  return res.json({ data: attendance });
});
router.patch("/attendance/:id/checkout", async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "A valid attendance record ID is required." });
  if (typeof req.body.checkOut !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.checkOut)) {
    return res.status(400).json({ message: "Check-out time must use the HH:mm format." });
  }
  const attendance = await Attendance.findById(req.params.id);
  if (!attendance) return res.status(404).json({ message: "Attendance record not found." });
  if (attendance.checkOut) return res.status(409).json({ message: "This attendance record already has a check-out time." });
  attendance.checkOut = req.body.checkOut;
  attendance.hoursWorked = calculateHours(attendance.checkIn, attendance.checkOut);
  await attendance.save();
  await attendance.populate(populateEmployee);
  return res.json({ data: attendance });
});

router.get("/leaves", async (req, res) => listRecords(res, LeaveRequest.find().populate(populateEmployee)));
router.post("/leaves", async (req, res) => {
  const error = requireFields(req.body, ["employeeId", "type", "startDate", "endDate"]);
  if (error) return res.status(400).json({ message: error });
  const employee = await ensureEmployeeExists(req.body.employeeId);
  const leave = await LeaveRequest.create({
    employee, type: req.body.type, startDate: asDate(req.body.startDate, "Start date"),
    endDate: asDate(req.body.endDate, "End date"), reason: req.body.reason,
  });
  await notifyEmployee(employee, "Leave request submitted", "Your leave request has been submitted to HR.");
  await leave.populate(populateEmployee);
  await notifyHr("New leave request", `${leave.employee.name} submitted a leave request.`, "/leave");
  return res.status(201).json({ data: leave });
});
router.patch("/leaves/:id/status", async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "A valid leave request ID is required." });
  if (!["Approved", "Declined"].includes(req.body.status)) {
    return res.status(400).json({ message: "Status must be Approved or Declined." });
  }
  const leave = await LeaveRequest.findOne({ _id: req.params.id, status: "Pending" });
  if (!leave) return res.status(404).json({ message: "Pending leave request not found." });
  if (req.body.status === "Approved" && defaultEntitlements[leave.type] !== undefined) {
    const firstYear = new Date(leave.startDate).getUTCFullYear();
    const lastYear = new Date(leave.endDate).getUTCFullYear();
    for (let year = firstYear; year <= lastYear; year += 1) {
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
      const [balance, approved] = await Promise.all([
        LeaveBalance.findOne({ employee: leave.employee, year, type: leave.type }),
        LeaveRequest.find({
          _id: { $ne: leave._id },
          employee: leave.employee,
          type: leave.type,
          status: "Approved",
          startDate: { $lt: yearEnd },
          endDate: { $gte: yearStart },
        }).select("startDate endDate"),
      ]);
      const used = approved.reduce((total, item) => total + calendarDaysWithinYear(item.startDate, item.endDate, year), 0);
      const allowance = balance?.entitlement ?? defaultEntitlements[leave.type];
      const requestedDays = calendarDaysWithinYear(leave.startDate, leave.endDate, year);
      if (used + requestedDays > allowance) {
        return res.status(409).json({ message: `Approving this request would exceed the ${allowance}-day ${leave.type.toLowerCase()} allowance for ${year}.` });
      }
    }
  }
  leave.status = req.body.status;
  leave.reviewedBy = req.user.id;
  await leave.save();
  await leave.populate(populateEmployee);
  await notifyEmployee(leave.employee._id, `Leave ${leave.status.toLowerCase()}`, `Your ${leave.type.toLowerCase()} leave request was ${leave.status.toLowerCase()}.`);
  return res.json({ data: leave });
});

router.get("/payroll", async (req, res) => listRecords(res, Payroll.find().populate(populateEmployee)));
router.post("/payroll", async (req, res) => {
  const error = requireFields(req.body, ["employeeId", "period", "baseSalary"]);
  if (error) return res.status(400).json({ message: error });
  const employee = await ensureEmployeeExists(req.body.employeeId);
  const baseSalary = Number(req.body.baseSalary);
  const bonus = Number(req.body.bonus || 0);
  const deductions = Number(req.body.deductions || 0);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(req.body.period)) {
    return res.status(400).json({ message: "Pay period must use the YYYY-MM format." });
  }
  let netPay;
  try {
    netPay = calculateNetPay(baseSalary, bonus, deductions);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const payroll = await Payroll.create({
    employee, period: req.body.period, baseSalary, bonus, deductions, netPay,
  });
  await notifyEmployee(employee, "New payslip available", `Your payroll record for ${payroll.period} is available in your employee portal.`);
  await payroll.populate(populateEmployee);
  return res.status(201).json({ data: payroll });
});
router.patch("/payroll/:id/status", async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "A valid payroll record ID is required." });
  if (req.body.status !== "Processed") return res.status(400).json({ message: "Payroll status must be Processed." });
  const payroll = await Payroll.findOneAndUpdate(
    { _id: req.params.id, status: "Pending" },
    { status: "Processed", processedAt: new Date() },
    { new: true, runValidators: true },
  ).populate(populateEmployee);
  if (!payroll) return res.status(404).json({ message: "Pending payroll record not found." });
  await notifyEmployee(payroll.employee._id, "Payroll processed", `Your ${payroll.period} payroll was processed.`);
  return res.json({ data: payroll });
});

router.get("/candidates", async (req, res) => listRecords(res, Candidate.find().populate("job", "title department")));
router.post("/candidates", async (req, res) => {
  const error = requireFields(req.body, ["name", "email", "position", "department"]);
  if (error) return res.status(400).json({ message: error });
  if (req.body.job) {
    if (!isObjectId(req.body.job)) return res.status(400).json({ message: "Choose a valid job opening." });
    if (!(await JobOpening.exists({ _id: req.body.job, status: "Open" }))) return res.status(400).json({ message: "The selected job opening is not open." });
  }
  const candidate = await Candidate.create({
    name: req.body.name, email: req.body.email, position: req.body.position,
    department: req.body.department, stage: req.body.stage,
    job: req.body.job || null, notes: req.body.notes || "",
    interviewAt: req.body.interviewAt ? asDate(req.body.interviewAt, "Interview date") : null,
  });
  return res.status(201).json({ data: candidate });
});
router.patch("/candidates/:id/stage", async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: "A valid candidate ID is required." });
  const stages = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
  if (!stages.includes(req.body.stage)) return res.status(400).json({ message: `Stage must be one of: ${stages.join(", ")}.` });
  const candidate = await Candidate.findByIdAndUpdate(
    req.params.id, { stage: req.body.stage }, { new: true, runValidators: true },
  );
  if (!candidate) return res.status(404).json({ message: "Candidate not found." });
  return res.json({ data: candidate });
});

router.get("/performance", async (req, res) => listRecords(res, PerformanceReview.find().populate(populateEmployee)));
router.post("/performance", async (req, res) => {
  const error = requireFields(req.body, ["employeeId", "reviewer", "period"]);
  if (error) return res.status(400).json({ message: error });
  const employee = await ensureEmployeeExists(req.body.employeeId);
  const rating = req.body.rating === "" || req.body.rating === undefined ? null : Number(req.body.rating);
  if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
    return res.status(400).json({ message: "Rating must be a number from 1 to 5." });
  }
  const review = await PerformanceReview.create({
    employee, reviewer: req.body.reviewer, period: req.body.period, rating, feedback: req.body.feedback,
    status: rating === null ? "In progress" : "Completed",
  });
  await review.populate(populateEmployee);
  return res.status(201).json({ data: review });
});

router.get("/dashboard", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const chartRange = new Date(today);
  chartRange.setDate(chartRange.getDate() - 29);
  const hireRange = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
  const [employees, presentToday, pendingLeave, openPositions, attendanceToday, reviews, recentEmployees, recentLeave, departments, hiresByMonth, attendanceRecords] = await Promise.all([
    Employee.countDocuments({ status: { $ne: "Inactive" } }),
    Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow }, status: { $in: ["Present", "Late"] } }),
    LeaveRequest.countDocuments({ status: "Pending" }),
    Candidate.countDocuments({ stage: { $nin: ["Hired", "Rejected"] } }),
    Attendance.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
    PerformanceReview.countDocuments(),
    Employee.find().sort({ createdAt: -1 }).limit(5).select("name department status"),
    LeaveRequest.find({ status: "Pending" }).sort({ createdAt: -1 }).limit(5).populate(populateEmployee),
    Employee.aggregate([
      { $match: { status: { $ne: "Inactive" } } },
      { $group: { _id: "$department", employees: { $sum: 1 } } },
      { $sort: { employees: -1, _id: 1 } },
      { $limit: 6 },
      { $project: { _id: 0, department: "$_id", employees: 1 } },
    ]),
    Employee.aggregate([
      { $match: { hireDate: { $gte: hireRange, $lt: tomorrow }, status: { $ne: "Inactive" } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$hireDate" } }, hires: { $sum: 1 } } },
    ]),
    Attendance.find({ date: { $gte: chartRange, $lt: tomorrow } })
      .sort({ date: -1 }).limit(1000).select("date checkIn hoursWorked status"),
  ]);
  const hiresMap = new Map(hiresByMonth.map((item) => [item._id, item.hires]));
  const hiringTrend = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5 + index, 1));
    const key = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month: month.toLocaleDateString("en", { month: "short", timeZone: "UTC" }), hires: hiresMap.get(key) || 0 };
  });
  const attendanceTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - 6 + index);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayRecords = attendanceRecords.filter((record) => record.date >= day && record.date < nextDay);
    return {
      day: day.toLocaleDateString("en", { weekday: "short" }),
      present: dayRecords.filter((record) => record.status === "Present" || record.status === "Late").length,
      absent: dayRecords.filter((record) => record.status === "Absent").length,
    };
  });
  const attendanceStatuses = ["Present", "Late", "Absent", "On leave"].map((status) => ({
    name: status,
    value: attendanceRecords.filter((record) => record.status === status).length,
  })).filter((item) => item.value > 0);
  const attendanceScatter = attendanceRecords.flatMap((record) => {
    if (!record.checkIn || !Number.isFinite(record.hoursWorked) || record.hoursWorked <= 0) return [];
    const [hours, minutes] = record.checkIn.split(":").map(Number);
    return [{ checkIn: hours + minutes / 60, hoursWorked: record.hoursWorked, status: record.status }];
  }).slice(0, 150);
  const attendanceRate = attendanceToday > 0 ? Math.round((presentToday / attendanceToday) * 100) : 0;
  const insights = [];
  if (pendingLeave > 0) {
    insights.push({
      title: "Leave approvals need attention",
      detail: `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} are waiting for review.`,
      tone: "warning",
    });
  }
  if (attendanceToday > 0) {
    insights.push({
      title: "Attendance health",
      detail: `Today’s attendance rate is ${attendanceRate}% with ${presentToday} checked-in employees.`,
      tone: attendanceRate >= 80 ? "success" : "warning",
    });
  }
  if (openPositions > 0) {
    insights.push({
      title: "Hiring pipeline is active",
      detail: `${openPositions} open positions are still in motion and need recruiter focus.`,
      tone: "info",
    });
  }
  if (reviews === 0) {
    insights.push({
      title: "Performance cadence",
      detail: "No performance reviews have been logged yet — start this month’s cycle to stay ahead.",
      tone: "info",
    });
  }
  if (!insights.length) {
    insights.push({
      title: "Operating rhythm is healthy",
      detail: "No urgent issues are currently flagged across the team.",
      tone: "success",
    });
  }
  return res.json({
    employees, presentToday, pendingLeave, openPositions, attendanceToday, reviews, recentEmployees, recentLeave,
    hiringTrend, attendanceTrend, departments, attendanceStatuses, attendanceScatter, insights,
  });
});

export default router;
