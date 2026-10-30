import { Router } from "express";
import mongoose from "mongoose";
import {
  Attendance, Employee, LeaveBalance, LeaveRequest, Payroll, PerformanceReview, ProfileChange,
} from "../models/index.js";
import { calculateHours, calendarDaysWithinYear } from "../utils/hr.js";
import { notifyHr } from "../utils/notifications.js";

const router = Router();
const defaultEntitlements = { Annual: 20, Sick: 10, Personal: 5, Parental: 90 };

function localDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

router.get("/", async (req, res) => {
  const employee = await Employee.findById(req.user.employee).select(
    "name email department jobTitle phone hireDate employmentType status",
  );
  if (!employee || employee.status === "Inactive") {
    return res.status(403).json({ message: "Your employee profile is inactive or unavailable. Contact HR." });
  }
  const { start, end } = localDayBounds();
  const [todayAttendance, attendance, leaves, payroll, reviews, leaveBalances, profileChanges] = await Promise.all([
    Attendance.findOne({ employee: employee.id, date: { $gte: start, $lt: end } }),
    Attendance.find({ employee: employee.id }).sort({ date: -1 }).limit(10),
    LeaveRequest.find({ employee: employee.id }).sort({ createdAt: -1 }).limit(10),
    Payroll.find({ employee: employee.id }).sort({ period: -1 }).limit(6).select("period baseSalary bonus deductions netPay status processedAt"),
    PerformanceReview.find({ employee: employee.id }).sort({ createdAt: -1 }).limit(6).select("reviewer period rating feedback status createdAt"),
    LeaveBalance.find({ employee: employee.id, year: new Date().getFullYear() }),
    ProfileChange.find({ employee: employee.id }).sort({ createdAt: -1 }).limit(5).select("changes status createdAt"),
  ]);
  const currentYearLeaves = await LeaveRequest.find({
    employee: employee.id,
    status: "Approved",
    startDate: { $lt: new Date(new Date().getFullYear() + 1, 0, 1) },
    endDate: { $gte: new Date(new Date().getFullYear(), 0, 1) },
  }).select("type startDate endDate");
  const balances = Object.entries(defaultEntitlements).map(([type, defaultValue]) => {
    const used = currentYearLeaves.filter((leave) => leave.type === type).reduce((total, leave) => {
      return total + calendarDaysWithinYear(leave.startDate, leave.endDate, new Date().getFullYear());
    }, 0);
    const entitlement = leaveBalances.find((balance) => balance.type === type)?.entitlement ?? defaultValue;
    return { type, entitlement, used, remaining: Math.max(0, entitlement - used) };
  });
  return res.json({ employee, todayAttendance, attendance, leaves, payroll, reviews, leaveBalances: balances, profileChanges });
});

router.post("/attendance/check-in", async (req, res) => {
  const employee = await Employee.findById(req.user.employee).select("status");
  if (!employee || employee.status === "Inactive") {
    return res.status(403).json({ message: "Your employee profile is inactive or unavailable. Contact HR." });
  }
  const { start, end } = localDayBounds();
  if (await Attendance.exists({ employee: employee.id, date: { $gte: start, $lt: end } })) {
    return res.status(409).json({ message: "You already have an attendance record for today." });
  }
  const attendance = await Attendance.create({
    employee: employee.id,
    date: start,
    checkIn: currentTime(),
    status: "Present",
  });
  return res.status(201).json({ data: attendance });
});

router.patch("/attendance/:id/checkout", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "A valid attendance record ID is required." });
  }
  const attendance = await Attendance.findOne({
    _id: req.params.id,
    employee: req.user.employee,
  });
  if (!attendance) return res.status(404).json({ message: "Your attendance record was not found." });
  if (attendance.checkOut) return res.status(409).json({ message: "You have already checked out for this record." });
  attendance.checkOut = currentTime();
  attendance.hoursWorked = calculateHours(attendance.checkIn, attendance.checkOut);
  await attendance.save();
  return res.json({ data: attendance });
});

router.post("/leaves", async (req, res) => {
  const { type, startDate, endDate, reason } = req.body;
  if (!type || !startDate || !endDate) {
    return res.status(400).json({ message: "Leave type, start date, and end date are required." });
  }
  const employee = await Employee.findById(req.user.employee).select("status");
  if (!employee || employee.status === "Inactive") {
    return res.status(403).json({ message: "Your employee profile is inactive or unavailable. Contact HR." });
  }
  const parsedStart = new Date(startDate);
  const parsedEnd = new Date(endDate);
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
    return res.status(400).json({ message: "Enter valid leave dates." });
  }
  const leave = await LeaveRequest.create({
    employee: employee.id,
    type,
    startDate: parsedStart,
    endDate: parsedEnd,
    reason,
  });
  await notifyHr("New leave request", `${employee.name} submitted a ${type.toLowerCase()} leave request.`, "/leave");
  return res.status(201).json({ data: leave });
});

router.post("/profile-changes", async (req, res) => {
  const changes = {};
  if (req.body.email !== undefined) {
    if (typeof req.body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim())) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    changes.email = req.body.email.trim().toLowerCase();
  }
  if (req.body.phone !== undefined) {
    if (typeof req.body.phone !== "string" || req.body.phone.length > 30) return res.status(400).json({ message: "Phone number must be 30 characters or fewer." });
    changes.phone = req.body.phone.trim();
  }
  if (!Object.keys(changes).length) return res.status(400).json({ message: "Provide an email address or phone number to update." });
  const employee = await Employee.findById(req.user.employee).select("email phone name");
  if (!employee) return res.status(404).json({ message: "Employee profile not found." });
  if (changes.email === employee.email) delete changes.email;
  if (changes.phone === employee.phone) delete changes.phone;
  if (!Object.keys(changes).length) return res.status(400).json({ message: "The requested details are already up to date." });
  const pendingRequest = await ProfileChange.exists({ employee: employee._id, status: "Pending" });
  if (pendingRequest) return res.status(409).json({ message: "You already have a profile update awaiting HR review." });
  const change = await ProfileChange.create({ employee: employee._id, requestedBy: req.user._id, changes });
  await notifyHr("Profile update needs review", `${employee.name} requested a profile update.`, "/employees");
  return res.status(201).json({ data: change });
});

export default router;
