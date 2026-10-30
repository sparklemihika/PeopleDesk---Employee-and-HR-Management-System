import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  Attendance,
  Employee,
  LeaveBalance,
  LeaveRequest,
  Payroll,
  PerformanceReview,
  User,
} from "../models/index.js";

const { MONGODB_URI } = process.env;
const employeeNames = [
  "Aarav Mehta", "Aisha Kapoor", "Rohan Desai", "Priya Nair", "Kabir Shah",
  "Ananya Rao", "Arjun Malhotra", "Isha Verma", "Dev Patel", "Meera Iyer",
  "Vivaan Khanna", "Sana Qureshi", "Reyansh Joshi", "Diya Menon", "Aditya Bose",
  "Kiara Sethi", "Ishaan Reddy", "Mira Chawla", "Neil Fernandes", "Tara Kulkarni",
  "Yash Bhatia", "Naina George", "Kunal Arora", "Riya Mukherjee", "Samar Gill",
  "Avni Sood", "Dhruv Anand", "Zoya Mirza", "Rahul Shetty", "Pooja Das",
  "Omkar Pawar", "Leela Krishnan", "Harsh Vora", "Maya Thomas", "Nikhil Sinha",
  "Simran Kaur", "Varun Bansal", "Anika Dutta", "Parth Trivedi", "Ira Banerjee",
  "Siddharth Rao", "Navya Pillai", "Manav Saxena", "Tanya Roy", "Eshan Ghosh",
  "Rhea Kapoor", "Gautam Menon", "Amara Joseph", "Kartik Jain", "Sia Mehra",
];
const departments = [
  { name: "Engineering", title: "Software Engineer", salary: 96000 },
  { name: "Operations", title: "Operations Specialist", salary: 68000 },
  { name: "Finance", title: "Financial Analyst", salary: 76000 },
  { name: "Marketing", title: "Marketing Associate", salary: 64000 },
  { name: "Human Resources", title: "People Operations Associate", salary: 67000 },
  { name: "Design", title: "Product Designer", salary: 79000 },
  { name: "Sales", title: "Account Executive", salary: 72000 },
  { name: "Customer Success", title: "Customer Success Specialist", salary: 62000 },
  { name: "Product", title: "Product Analyst", salary: 84000 },
  { name: "IT", title: "IT Support Engineer", salary: 70000 },
];
const leaveEntitlements = { Annual: 20, Sick: 10, Personal: 5, Parental: 60 };
const leaveTypes = Object.keys(leaveEntitlements);
const leaveStatuses = ["Pending", "Approved", "Declined"];
const attendanceStatuses = ["Present", "Present", "Present", "Late", "Absent", "On leave"];
const periods = Array.from({ length: 6 }, (_, index) => {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - (5 - index));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
});

function credentialsFor(index) {
  const suffix = String(index + 1).padStart(2, "0");
  const email = process.env[`DEMO_EMPLOYEE_${suffix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`DEMO_EMPLOYEE_${suffix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Set DEMO_EMPLOYEE_${suffix}_EMAIL and DEMO_EMPLOYEE_${suffix}_PASSWORD in .env before seeding.`);
  }
  if (!email.includes("@")) throw new Error(`DEMO_EMPLOYEE_${suffix}_EMAIL must be a valid email address.`);
  if (password.length < 12) throw new Error(`DEMO_EMPLOYEE_${suffix}_PASSWORD must be at least 12 characters.`);
  return { email, password };
}

function formatMonth(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function insertIfMissing(Model, filter, document) {
  await Model.updateOne(filter, { $setOnInsert: document }, { upsert: true, runValidators: true });
}

async function seed() {
  if (!MONGODB_URI) throw new Error("Set MONGODB_URI before seeding employees.");
  const roster = employeeNames.map((name, index) => ({
    ...credentialsFor(index),
    name,
    department: departments[index % departments.length],
    employmentType: ["Full-time", "Full-time", "Part-time", "Contract", "Intern"][index % 5],
    annualSalary: departments[index % departments.length].salary + (index % 8) * 750,
  }));

  await mongoose.connect(MONGODB_URI);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let newEmployeeCount = 0;
  let newLoginCount = 0;

  for (const [index, item] of roster.entries()) {
    const hireDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (index % 30), 1));
    let employee = await Employee.findOne({ email: item.email });
    if (!employee) {
      employee = await Employee.create({
        name: item.name,
        email: item.email,
        department: item.department.name,
        jobTitle: item.department.title,
        hireDate,
        employmentType: item.employmentType,
        salary: item.annualSalary,
        status: "Active",
      });
      newEmployeeCount += 1;
    }

    const existingLogin = await User.findOne({ $or: [{ email: item.email }, { employee: employee._id }] });
    if (!existingLogin) {
      await User.create({
        name: employee.name,
        email: item.email,
        passwordHash: await bcrypt.hash(item.password, 12),
        role: "employee",
        employee: employee._id,
      });
      newLoginCount += 1;
    }

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - dayOffset);
      const status = attendanceStatuses[(index + dayOffset) % attendanceStatuses.length];
      const working = status === "Present" || status === "Late";
      const hour = status === "Late" ? 10 : 8 + ((index + dayOffset) % 2);
      const checkIn = working ? `${String(hour).padStart(2, "0")}:15` : "";
      await insertIfMissing(Attendance, { employee: employee._id, date }, {
        employee: employee._id,
        date,
        checkIn,
        checkOut: working ? "17:00" : "",
        hoursWorked: working ? 8 : 0,
        status,
        notes: "Sample employee attendance",
      });
    }

    const leaveType = leaveTypes[index % leaveTypes.length];
    if (index % 2 === 0) {
      const startDate = new Date(today);
      startDate.setUTCDate(startDate.getUTCDate() - 10 + (index % 28));
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + (index % 3));
      await insertIfMissing(LeaveRequest, {
        employee: employee._id,
        reason: "Sample employee leave request",
      }, {
        employee: employee._id,
        type: leaveType,
        startDate,
        endDate,
        reason: "Sample employee leave request",
        status: leaveStatuses[(index / 2) % leaveStatuses.length],
      });
    }

    for (const [type, entitlement] of Object.entries(leaveEntitlements)) {
      await insertIfMissing(LeaveBalance, {
        employee: employee._id,
        year: now.getUTCFullYear(),
        type,
      }, {
        employee: employee._id,
        year: now.getUTCFullYear(),
        type,
        entitlement,
      });
    }

    const monthlyBase = Math.round(item.annualSalary / 12);
    for (const [periodIndex, period] of periods.entries()) {
      const bonus = (index % 4) * 75;
      const deductions = Math.round(monthlyBase * 0.08);
      await insertIfMissing(Payroll, { employee: employee._id, period }, {
        employee: employee._id,
        period,
        baseSalary: monthlyBase,
        bonus,
        deductions,
        netPay: monthlyBase + bonus - deductions,
        status: (index + periodIndex) % 4 === 0 ? "Pending" : "Processed",
        processedAt: (index + periodIndex) % 4 === 0 ? null : new Date(`${period}-28T12:00:00.000Z`),
      });
    }

    await insertIfMissing(PerformanceReview, {
      employee: employee._id,
      reviewer: "PeopleDesk HR",
      period: `Annual ${now.getUTCFullYear()}`,
    }, {
      employee: employee._id,
      reviewer: "PeopleDesk HR",
      period: `Annual ${now.getUTCFullYear()}`,
      rating: 3 + (index % 3),
      feedback: "Sample review record for the employee demo workspace.",
      status: index % 4 === 0 ? "In progress" : "Completed",
    });
  }

  console.log(`Seed complete: ${newEmployeeCount} employees and ${newLoginCount} logins added; existing employee records and account passwords were left unchanged.`);
  console.log("The demo roster includes attendance, leave, leave balances, six payroll periods, and performance review samples.");
}

try {
  await seed();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
