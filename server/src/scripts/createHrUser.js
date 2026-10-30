import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/index.js";

const { MONGODB_URI, HR_NAME, HR_EMAIL, HR_PASSWORD } = process.env;
if (!MONGODB_URI || !HR_NAME || !HR_EMAIL || !HR_PASSWORD) {
  throw new Error("Set MONGODB_URI, HR_NAME, HR_EMAIL, and HR_PASSWORD before provisioning an HR account.");
}
if (HR_PASSWORD.length < 12) throw new Error("HR_PASSWORD must be at least 12 characters.");

try {
  await mongoose.connect(MONGODB_URI);
  const email = HR_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) throw new Error("A user with this email already exists.");
  const passwordHash = await bcrypt.hash(HR_PASSWORD, 12);
  await User.create({ name: HR_NAME.trim(), email, passwordHash, role: "hr" });
  console.log(`HR account created for ${email}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
