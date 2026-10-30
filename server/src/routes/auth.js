import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { rateLimit } from "express-rate-limit";
import { Employee, PasswordReset, RevokedToken, User } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Try again in 15 minutes." },
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many password reset requests. Try again later." },
});
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many password reset attempts. Try again later." },
});
const genericResetMessage = "If an account matches that email and portal, a password reset link will be sent.";

function resetMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !process.env.MAIL_FROM) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
}

function allowLocalResetPreview(req) {
  const address = req.ip?.replace(/^::ffff:/, "");
  return process.env.NODE_ENV !== "production"
    && process.env.DEV_PASSWORD_RESET === "true"
    && ["127.0.0.1", "::1"].includes(address);
}

function portalRoleFilter(portal) {
  return portal === "employee" ? { role: "employee" } : { role: { $in: ["admin", "hr"] } };
}

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

router.post("/login", loginLimiter, async (req, res) => {
  const portal = req.body.portal;
  if (!["hr", "employee"].includes(portal)) {
    return res.status(400).json({ message: "Choose the HR or employee sign-in portal." });
  }
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !password || email.length > 254 || password.length > 128) {
    return res.status(400).json({ message: "Enter a valid email address and password." });
  }
  const user = await User.findOne({ email }).select("+passwordHash");
  const roleMatchesPortal = portal === "employee"
    ? user?.role === "employee"
    : user?.role === "hr" || user?.role === "admin";
  if (!user || !roleMatchesPortal || !(await user.verifyPassword(password))) {
    return res.status(401).json({ message: "Email or password is incorrect." });
  }
  if (user.role === "employee" && !user.employee) {
    return res.status(403).json({ message: "This employee account is not linked to an employee record. Contact HR." });
  }
  if (user.role === "employee") {
    const employee = await Employee.findById(user.employee).select("status");
    if (!employee || employee.status === "Inactive") {
      return res.status(403).json({ message: "This employee account is inactive or unavailable. Contact HR." });
    }
  }
  const token = jwt.sign(
    { sub: user.id, sessionVersion: user.sessionVersion },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h", issuer: "peopledesk-api", audience: "peopledesk-client", jwtid: randomUUID() },
  );
  return res.json({
    token,
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
      employeeId: user.employee?.toString() || null,
    },
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  await RevokedToken.updateOne(
    { jti: req.authTokenId },
    { $setOnInsert: { jti: req.authTokenId, expiresAt: req.authTokenExpiresAt } },
    { upsert: true },
  );
  return res.json({ message: "Signed out successfully." });
});

router.post("/forgot-password", resetLimiter, async (req, res) => {
  const portal = req.body.portal;
  if (!["hr", "employee"].includes(portal)) {
    return res.status(400).json({ message: "Choose the HR or employee portal." });
  }
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }
  const mailer = resetMailer();
  const localResetPreview = allowLocalResetPreview(req);
  if (!mailer && !localResetPreview) {
    return res.status(503).json({ message: "Password reset email is not configured. Contact your system administrator." });
  }
  if (mailer) {
    try {
      await mailer.verify();
    } catch (error) {
      console.error("Password reset email service is unavailable:", error.message);
      return res.status(503).json({ message: "Password reset email is temporarily unavailable. Please try again later." });
    }
  }
  const user = await User.findOne({ email, ...portalRoleFilter(portal) }).select("name email role");
  if (user) {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await PasswordReset.deleteMany({ user: user.id });
    await PasswordReset.create({ user: user.id, tokenHash, expiresAt });
    const baseUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}&portal=${portal}`;
    if (!mailer && localResetPreview) {
      return res.json({
        message: "A local password reset link is ready. It expires in 30 minutes and can only be used once.",
        devResetUrl: resetUrl,
      });
    }
    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM,
        to: user.email,
        subject: "Reset your PeopleDesk password",
        text: `Hello ${user.name},\n\nUse the link below to reset your PeopleDesk password. It expires in 30 minutes and can only be used once.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`,
        html: `<p>Hello ${escapeHtml(user.name)},</p><p>Use the link below to reset your PeopleDesk password. It expires in 30 minutes and can only be used once.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>If you did not request this, you can ignore this message.</p>`,
      });
    } catch (error) {
      await PasswordReset.deleteOne({ tokenHash });
      console.error("Could not send password reset email:", error.message);
      return res.json({ message: genericResetMessage });
    }
  }
  return res.json({ message: genericResetMessage });
});

router.post("/reset-password", changePasswordLimiter, async (req, res) => {
  const token = typeof req.body.token === "string" ? req.body.token : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (token.length !== 43 || !/^[\w-]+$/.test(token)) {
    return res.status(400).json({ message: "This password reset link is invalid or has expired." });
  }
  if (password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: "Your new password must be between 12 and 128 characters." });
  }
  const reset = await PasswordReset.findOneAndDelete({
    tokenHash: hashResetToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!reset) {
    return res.status(400).json({ message: "This password reset link is invalid, expired, or already used." });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.findByIdAndUpdate(
    reset.user,
    { passwordHash, $inc: { sessionVersion: 1 } },
    { new: true, runValidators: true },
  ).select("name email role employee");
  if (!user) return res.status(400).json({ message: "This password reset link is no longer valid." });
  await PasswordReset.deleteMany({ user: user.id });
  return res.json({ message: "Password reset successfully. Please sign in with your new password.", portal: user.role === "employee" ? "employee" : "hr" });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role,
      employeeId: req.user.employee?.toString() || null,
    },
  });
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export default router;
