import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Employee, User } from "../models/index.js";

const { MONGODB_URI, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = process.env;
if (!MONGODB_URI || !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD) {
  throw new Error("Set MONGODB_URI, EMPLOYEE_EMAIL, and EMPLOYEE_PASSWORD before provisioning an employee account.");
}
if (EMPLOYEE_PASSWORD.length < 12) throw new Error("EMPLOYEE_PASSWORD must be at least 12 characters.");

try {
  await mongoose.connect(MONGODB_URI);
  const email = EMPLOYEE_EMAIL.trim().toLowerCase();
  const employee = await Employee.findOne({ email });
  if (!employee) throw new Error("No employee record matches EMPLOYEE_EMAIL. Create the employee record before provisioning login.");
  if (employee.status === "Inactive") throw new Error("Cannot provision a login for an inactive employee.");
  if (await User.exists({ email })) throw new Error("A user account with this email already exists.");
  if (await User.exists({ employee: employee.id })) throw new Error("This employee record already has a login account.");
  const passwordHash = await bcrypt.hash(EMPLOYEE_PASSWORD, 12);
  await User.create({
    name: employee.name,
    email,
    passwordHash,
    role: "employee",
    employee: employee.id,
  });
  console.log(`Employee login created for ${email}. The account is linked to employee record ${employee.id}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
