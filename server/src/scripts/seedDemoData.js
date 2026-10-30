
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  Attendance,
  Candidate,
  Employee,
  JobOpening,
  LeaveBalance,
  LeaveRequest,
  Notification,
  Payroll,
  PerformanceReview,
  User,
} from "../models/index.js";

const { MONGODB_URI } = process.env;
const demoPassword = process.env.DEMO_EMPLOYEE_PASSWORD || "Demo-Employee-123";
const hrEmail = (process.env.HR_EMAIL || "hr@peopledesk.local").trim().toLowerCase();
const hrPassword = process.env.HR_PASSWORD || "Demo-HR-123456";

if (!MONGODB_URI) throw new Error("Set MONGODB_URI before running demo seeding.");
if (demoPassword.length < 12) throw new Error("DEMO_EMPLOYEE_PASSWORD must be at least 12 characters.");
if (hrPassword.length < 12) throw new Error("HR_PASSWORD must be at least 12 characters.");

const employeesToSeed = [
  {
    name: "Dhanveer",
    email: "dhanveer@peopledesk.local",
    department: "Engineering",
    jobTitle: "Frontend Engineer",
    phone: "",
    hireDate: new Date("2025-08-11T00:00:00.000Z"),
    salary: 92000,
  },
  {
    name: "Shahjil islam",
    email: "shahjil.islam@peopledesk.local",
    department: "Operations",
    jobTitle: "Operations Coordinator",
    phone: "",
    hireDate: new Date("2025-10-06T00:00:00.000Z"),
    salary: 68000,
  },
  {
    name: "Teerath",
    email: "teerath@peopledesk.local",
    department: "Finance",
    jobTitle: "Finance Analyst",
    phone: "",
    hireDate: new Date("2026-01-19T00:00:00.000Z"),
    salary: 74000,
  },
  {
    name: "Udit panday",
    email: "udit.panday@peopledesk.local",
    department: "Marketing",
    jobTitle: "Marketing Associate",
    phone: "",
    hireDate: new Date("2026-03-02T00:00:00.000Z"),
    salary: 65000,
  },
];

async function upsertUser({ name, email, role, employee, password }) {
  const existing = await User.findOne({ email }).select("+passwordHash");
  const passwordHash = existing?.passwordHash || await bcrypt.hash(password, 12);
  return User.findOneAndUpdate(
    { email },
    {
      $set: { name, role, ...(employee ? { employee } : {}) },
      $setOnInsert: { email, passwordHash },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const hr = await upsertUser({
    name: "Mihika Sharma",
    email: hrEmail,
    role: "hr",
    password: hrPassword,
  });

  const seededEmployees = [];
  for (const employeeData of employeesToSeed) {
    const employee = await Employee.findOneAndUpdate(
      { email: employeeData.email },
      { $set: { ...employeeData, employmentType: "Full-time", status: "Active" } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await upsertUser({
      name: employee.name,
      email: employee.email,
      role: "employee",
      employee: employee._id,
      password: demoPassword,
    });
    seededEmployees.push(employee);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const attendanceDate = new Date(today);
  for (const [index, employee] of seededEmployees.entries()) {
    const present = index !== 1;
    await Attendance.findOneAndUpdate(
      { employee: employee._id, date: attendanceDate },
      {
        $set: {
          checkIn: present ? `0${8 + (index % 2)}:30` : "09:00",
          checkOut: present ? "17:00" : "",
          hoursWorked: present ? 8 : 0,
          status: present ? "Present" : "Absent",
          notes: "Competition demo attendance record",
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    if (index < 2) {
      const startDate = new Date(today);
      startDate.setUTCDate(startDate.getUTCDate() + 7 + index);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 2);
      await LeaveRequest.findOneAndUpdate(
        { employee: employee._id, reason: "Competition demo leave request" },
        {
          $set: {
            type: index === 0 ? "Annual" : "Personal",
            startDate,
            endDate,
            status: "Pending",
          },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
    }

    await Payroll.findOneAndUpdate(
      { employee: employee._id, period: `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}` },
      {
        $set: {
          baseSalary: employee.salary,
          bonus: 500,
          deductions: 250,
          netPay: employee.salary + 250,
          status: "Pending",
          processedAt: null,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    await LeaveBalance.findOneAndUpdate(
      { employee: employee._id, year: today.getUTCFullYear(), type: "Annual" },
      { $set: { entitlement: 20 } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );

    await PerformanceReview.findOneAndUpdate(
      { employee: employee._id, reviewer: "Mihika Sharma", period: "Q4 2026" },
      {
        $set: {
          rating: index === 1 ? null : [4, 3, 5, 4][index],
          feedback: index === 1 ? "Quarterly review in progress." : "Consistent contribution, collaboration, and ownership of team goals.",
          status: index === 1 ? "In progress" : "Completed",
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  const openings = [
    { title: "Senior Product Designer", department: "Design", location: "Remote", employmentType: "Full-time", description: "Shape accessible employee experiences and lead product design across PeopleDesk.", status: "Open" },
    { title: "Data Analyst", department: "Operations", location: "Hybrid", employmentType: "Full-time", description: "Turn people operations data into clear, actionable insights.", status: "Open" },
    { title: "Talent Acquisition Partner", department: "HR", location: "On-site", employmentType: "Full-time", description: "Build an inclusive hiring pipeline and a thoughtful candidate experience.", status: "Open" },
    { title: "QA Engineer", department: "Engineering", location: "Remote", employmentType: "Contract", description: "Improve product quality through reliable testing and release practices.", status: "Closed" },
  ];
  const seededOpenings = [];
  for (const opening of openings) {
    seededOpenings.push(await JobOpening.findOneAndUpdate(
      { title: opening.title, department: opening.department },
      { $set: opening },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ));
  }

  const candidates = [
    { name: "Emma Hart", email: "emma.hart@example.com", position: "Senior Product Designer", department: "Design", stage: "Interview", job: seededOpenings[0]._id, notes: "Strong portfolio and thoughtful product approach.", interviewAt: new Date(Date.now() + 86400000) },
    { name: "Noah Brooks", email: "noah.brooks@example.com", position: "Data Analyst", department: "Operations", stage: "Screening", job: seededOpenings[1]._id, notes: "Relevant analytics experience; schedule technical screen.", interviewAt: null },
    { name: "Sara Kim", email: "sara.kim@example.com", position: "Talent Acquisition Partner", department: "HR", stage: "Applied", job: seededOpenings[2]._id, notes: "Experienced in inclusive hiring practices.", interviewAt: null },
  ];
  for (const candidate of candidates) {
    await Candidate.findOneAndUpdate(
      { email: candidate.email },
      { $set: candidate },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  const notificationSamples = [
    { title: "Demo team loaded", message: "The PeopleDesk competition demo records are ready.", link: "/" },
    { title: "Leave requests awaiting review", message: "Review the sample leave requests in Leave management.", link: "/leave" },
  ];
  for (const item of notificationSamples) {
    await Notification.findOneAndUpdate(
      { user: hr._id, title: item.title },
      { $set: { ...item, user: hr._id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  console.log(`Demo data uploaded. HR: Mihika Sharma (${hr.email}); employees: ${seededEmployees.map(({ name }) => name).join(", ")}; ${openings.length} job openings and ${candidates.length} candidates.`);
  console.log(`Employee demo password for newly created accounts: ${demoPassword}`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
