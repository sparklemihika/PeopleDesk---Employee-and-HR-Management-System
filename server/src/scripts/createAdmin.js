import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/index.js";

const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!MONGODB_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("Set MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD before provisioning an administrator.");
}
if (ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");

try {
  await mongoose.connect(MONGODB_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (await User.exists({ email })) throw new Error("An administrator with this email already exists.");
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await User.create({ name: ADMIN_NAME.trim(), email, passwordHash, role: "admin" });
  console.log(`Administrator account created for ${email}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
