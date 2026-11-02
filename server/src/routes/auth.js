import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import {
  Employee, ExternalProject, ExternalProjectInvite, ExternalProjectMember,
  Notification, PasswordReset, RevokedToken, User,
} from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import { createMailer } from "../utils/email.js";

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
const inviteAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many invitation attempts. Try again later." },
});
const genericResetMessage = "If an account matches that email and portal, a password reset link will be sent.";

function allowLocalResetPreview(req) {
  const address = req.ip?.replace(/^::ffff:/, "");
  return process.env.NODE_ENV !== "production"
    && process.env.DEV_PASSWORD_RESET === "true"
    && ["127.0.0.1", "::1"].includes(address);
}

function portalRoleFilter(portal) {
  if (portal === "employee") return { role: "employee" };
  if (portal === "partner") return { role: "partner" };
  return { role: { $in: ["admin", "hr"] } };
}

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

router.post("/login", loginLimiter, async (req, res) => {
  const portal = req.body.portal;
  if (!["hr", "employee", "partner"].includes(portal)) {
    return res.status(400).json({ message: "Choose the HR, employee, or partner sign-in portal." });
  }
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!email || !password || email.length > 254 || password.length > 128) {
    return res.status(400).json({ message: "Enter a valid email address and password." });
  }
  const user = await User.findOne({ email }).select("+passwordHash");
  const roleMatchesPortal = portal === "employee"
    ? user?.role === "employee"
    : portal === "partner"
      ? user?.role === "partner"
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
  if (user.role === "partner" && !user.partnerOrganization) {
    return res.status(403).json({ message: "This partner account is not linked to an organization. Contact your project host." });
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

router.post("/accept-partner-invite", inviteAcceptLimiter, async (req, res) => {
  const token = typeof req.body.token === "string" ? req.body.token : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!/^[\w-]{43}$/.test(token) || !name || name.length > 100 || password.length < 12 || password.length > 128) {
    return res.status(400).json({ message: "Enter your name and a password of 12 to 128 characters using a valid invitation link." });
  }
  const tokenHash = hashResetToken(token);
  const invite = await ExternalProjectInvite.findOne({
    tokenHash,
    acceptedAt: null,
    status: "Pending",
    expiresAt: { $gt: new Date() },
  }).populate("invitedBy", "_id");
  if (!invite) return res.status(400).json({ message: "This invitation is invalid, expired, or already used. Ask the project host for a new invite." });
  const project = await ExternalProject.findById(invite.project).select("partnerOrganization");
  if (!project) return res.status(400).json({ message: "The invited project is no longer available." });
  let user = await User.findOne({ email: invite.email });
  if (user && (user.role !== "partner" || String(user.partnerOrganization) !== String(project.partnerOrganization))) {
    return res.status(409).json({ message: "This email already belongs to another PeopleDesk account. Ask the project host to invite your registered partner account." });
  }
  if (!user) {
    user = await User.create({
      name,
      email: invite.email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "partner",
      partnerOrganization: project.partnerOrganization,
    });
  }
  await ExternalProjectMember.updateOne(
    { project: invite.project, user: user._id },
    { $setOnInsert: { project: invite.project, user: user._id, kind: "partner" } },
    { upsert: true, runValidators: true },
  );
  invite.acceptedAt = new Date();
  invite.status = "Accepted";
  await invite.save();
  await Notification.create({
    user: invite.invitedBy._id,
    title: "Partner invitation accepted",
    message: `${user.name} accepted the invitation to "${project.name}".`,
    link: "/",
  });
  return res.json({ message: "Invitation accepted. You can now sign in to your partner workspace." });
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
  if (!["hr", "employee", "partner"].includes(portal)) {
    return res.status(400).json({ message: "Choose the HR, employee, or partner portal." });
  }
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }
  const mailer = createMailer();
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
  return res.json({
    message: "Password reset successfully. Please sign in with your new password.",
    portal: user.role === "employee" ? "employee" : user.role === "partner" ? "partner" : "hr",
  });
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
