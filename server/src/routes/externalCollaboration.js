import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router } from "express";
import mongoose from "mongoose";
import {
  ExternalCollaborationRequest, ExternalOrganization, ExternalProject, ExternalProjectAnnouncement,
  ExternalProjectComment, ExternalProjectInvite, ExternalProjectMeeting, ExternalProjectMember,
  ExternalProjectTask, Notification, User,
} from "../models/index.js";
import { requireRole } from "../middleware/auth.js";
import { notifyUser } from "../utils/notifications.js";
import { createMailer } from "../utils/email.js";

const router = Router();
const hrOnly = requireRole("admin", "hr");
const maxFileBytes = 10 * 1024 * 1024;
const projectStorageLimit = 100 * 1024 * 1024;
const allowedFileTypes = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/csv",
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function fileBucket() {
  if (!mongoose.connection.db) throw new Error("The database connection is not ready.");
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "externalProjectFiles" });
}

async function getProjectAccess(projectId, user) {
  if (!mongoose.isValidObjectId(projectId)) return { error: "invalid" };
  const project = await ExternalProject.findById(projectId).populate("partnerOrganization", "name");
  if (!project) return { error: "missing" };
  const isHost = user.role === "admin" || user.role === "hr";
  if (isHost) return { project, isHost };
  const member = await ExternalProjectMember.exists({ project: project._id, user: user._id });
  return member ? { project, isHost } : { error: "missing" };
}

async function createInvite(project, email, invitedBy) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail }).select("role partnerOrganization");
  if (existingUser && (existingUser.role !== "partner" || String(existingUser.partnerOrganization) !== String(project.partnerOrganization._id || project.partnerOrganization))) {
    const error = new Error("That email already belongs to a different PeopleDesk account. Use an unused partner email address.");
    error.status = 409;
    throw error;
  }
  const token = randomBytes(32).toString("base64url");
  const invite = await ExternalProjectInvite.create({
    project: project._id,
    email: normalizedEmail,
    tokenHash: hashToken(token),
    invitedBy,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  if (existingUser) {
    await notifyUser(
      existingUser._id,
      "Partner project invitation",
      `You were invited to join "${project.name}". Check your email for the invitation link.`,
      "/partner",
    );
  }
  const baseUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
  const invitationUrl = `${baseUrl}/partner-invite?token=${encodeURIComponent(token)}`;
  let emailSent = false;
  const mailer = createMailer();
  if (mailer) {
    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM,
        to: normalizedEmail,
        subject: `Invitation to collaborate on ${project.name}`,
        text: `You have been invited to collaborate with ${project.partnerOrganization.name} on "${project.name}". Accept your invitation within seven days: ${invitationUrl}`,
        html: `<p>You have been invited to collaborate with <strong>${escapeHtml(project.partnerOrganization.name)}</strong> on <strong>${escapeHtml(project.name)}</strong>.</p><p><a href="${escapeHtml(invitationUrl)}">Accept your invitation</a>. This link expires in seven days.</p>`,
      });
      emailSent = true;
    } catch (error) {
      console.error("Could not send external collaboration invitation:", error.message);
    }
  }
  return { invite, invitationUrl, emailSent };
}

function sendAccessError(res, error) {
  if (error === "invalid") return res.status(400).json({ message: "A valid project ID is required." });
  if (error === "missing") return res.status(404).json({ message: "Project not found." });
  return null;
}

router.get("/", async (req, res) => {
  const isHost = req.user.role === "admin" || req.user.role === "hr";
  const [projects, requests, invitations] = await Promise.all([
    isHost
      ? ExternalProject.find().populate("partnerOrganization", "name").sort({ updatedAt: -1 }).limit(200)
      : ExternalProject.find({
        _id: { $in: await ExternalProjectMember.find({ user: req.user._id }).distinct("project") },
      }).populate("partnerOrganization", "name").sort({ updatedAt: -1 }).limit(200),
    ExternalCollaborationRequest.find(isHost ? {} : { partnerOrganization: req.user.partnerOrganization })
      .populate("partnerOrganization", "name")
      .populate("fromUser", "name email")
      .populate("reviewedBy", "name")
      .populate("project", "name")
      .sort({ createdAt: -1 })
      .limit(100),
    isHost
      ? ExternalProjectInvite.find().populate("project", "name").populate("invitedBy", "name").sort({ createdAt: -1 }).limit(100)
      : [],
  ]);
  return res.json({
    data: projects,
    requests,
    invitations,
    canCreate: isHost,
    organizationName: process.env.ORGANIZATION_NAME || "PeopleDesk",
  });
});

router.post("/requests", async (req, res) => {
  if (req.user.role !== "partner") {
    return res.status(403).json({ message: "Only an external partner account can send a company collaboration request." });
  }
  const projectName = cleanText(req.body.projectName);
  const message = cleanText(req.body.message);
  if (!projectName || projectName.length > 160 || !message || message.length > 2000) {
    return res.status(400).json({ message: "Enter a project name and collaboration proposal (up to 2,000 characters)." });
  }
  const org = await ExternalOrganization.findById(req.user.partnerOrganization);
  if (!org) return res.status(409).json({ message: "Your partner organization is not configured. Contact the project host." });
  const pending = await ExternalCollaborationRequest.findOne({
    partnerOrganization: org._id,
    projectName,
    status: "Pending",
  });
  if (pending) return res.status(409).json({ message: "This company request is already waiting for a response." });
  const request = await ExternalCollaborationRequest.create({
    partnerOrganization: org._id,
    fromUser: req.user._id,
    projectName,
    message,
  });
  await request.populate([{ path: "partnerOrganization", select: "name" }, { path: "fromUser", select: "name email" }]);
  const hosts = await User.find({ role: { $in: ["admin", "hr"] } }).select("_id email");
  await Promise.all(hosts.map((host) => notifyUser(
    host._id,
    "New company collaboration request",
    `${org.name} proposed "${projectName}". Review it in Partner projects.`,
    "/",
  )));
  const mailer = createMailer();
  if (mailer && hosts.length) {
    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM,
        to: hosts.map(({ email }) => email),
        subject: `New collaboration proposal from ${org.name}`,
        text: `${org.name} proposed a collaboration project: ${projectName}\n\n${message}\n\nSign in to PeopleDesk to review this request.`,
        html: `<p><strong>${escapeHtml(org.name)}</strong> proposed a collaboration project: <strong>${escapeHtml(projectName)}</strong>.</p><p>${escapeHtml(message)}</p><p>Sign in to PeopleDesk to review this request.</p>`,
      });
    } catch (error) {
      console.error("Could not email external collaboration request:", error.message);
    }
  }
  return res.status(201).json({ data: request, message: "Your proposal was sent to the PeopleDesk HR team." });
});

router.patch("/requests/:id/respond", hrOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid collaboration request ID is required." });
  const { decision } = req.body;
  const responseMessage = cleanText(req.body.message);
  if (!["Accepted", "Declined"].includes(decision) || responseMessage.length > 1000) {
    return res.status(400).json({ message: "Choose accept or decline and enter a response of up to 1,000 characters." });
  }
  const request = await ExternalCollaborationRequest.findOne({ _id: req.params.id, status: "Pending" })
    .populate("partnerOrganization", "name")
    .populate("fromUser", "name email partnerOrganization");
  if (!request) return res.status(404).json({ message: "Pending collaboration request not found." });
  let project = null;
  if (decision === "Accepted") {
    project = await ExternalProject.create({
      name: request.projectName,
      description: request.message,
      partnerOrganization: request.partnerOrganization._id,
      createdBy: req.user._id,
    });
    const partnerUsers = await User.find({
      role: "partner",
      partnerOrganization: request.partnerOrganization._id,
    }).select("_id");
    const memberRows = [
      { project: project._id, user: req.user._id, kind: "internal" },
      ...partnerUsers.map(({ _id }) => ({ project: project._id, user: _id, kind: "partner" })),
    ];
    await ExternalProjectMember.bulkWrite(memberRows.map((member) => ({
      updateOne: {
        filter: { project: member.project, user: member.user },
        update: { $setOnInsert: member },
        upsert: true,
      },
    })));
    request.project = project._id;
  }
  request.status = decision;
  request.reviewedBy = req.user._id;
  request.responseMessage = responseMessage;
  await request.save();
  const humanDecision = decision === "Accepted" ? "accepted" : "declined";
  const partnerUsers = await User.find({
    role: "partner",
    partnerOrganization: request.partnerOrganization._id,
  }).select("_id");
  await Promise.all(partnerUsers.map(({ _id }) => notifyUser(
    _id,
    `Company request ${humanDecision}`,
    responseMessage || `${process.env.ORGANIZATION_NAME || "PeopleDesk"} ${humanDecision} "${request.projectName}".`,
    "/partner",
  )));
  if (decision === "Accepted") {
    await notifyUser(
      req.user._id,
      "Collaboration request accepted",
      `${request.partnerOrganization.name} joined "${request.projectName}".`,
      "/",
    );
  }
  return res.json({
    message: decision === "Accepted" ? "Request accepted. The shared project is ready." : "Request declined.",
    data: { request, project },
  });
});

router.post("/projects", hrOnly, async (req, res) => {
  const name = cleanText(req.body.name);
  const description = cleanText(req.body.description);
  const partnerName = cleanText(req.body.partnerName);
  const email = cleanText(req.body.email).toLowerCase();
  if (!name || name.length > 160 || description.length > 2000 || !partnerName || partnerName.length > 160
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ message: "Enter a project name, partner organization, and valid invitation email." });
  }
  const org = await ExternalOrganization.findOneAndUpdate(
    { nameKey: partnerName.toLocaleLowerCase() },
    { $setOnInsert: { name: partnerName, nameKey: partnerName.toLocaleLowerCase(), createdBy: req.user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const project = await ExternalProject.create({
    name,
    description,
    partnerOrganization: org._id,
    createdBy: req.user._id,
  });
  await ExternalProjectMember.create({ project: project._id, user: req.user._id, kind: "internal" });
  const hydratedProject = await ExternalProject.findById(project._id).populate("partnerOrganization", "name");
  try {
    const { invite, invitationUrl, emailSent } = await createInvite(hydratedProject, email, req.user._id);
    return res.status(201).json({
      data: hydratedProject,
      invitation: { email: invite.email, url: invitationUrl, emailSent, expiresAt: invite.expiresAt },
    });
  } catch (error) {
    await ExternalProjectMember.deleteOne({ project: project._id, user: req.user._id });
    await ExternalProject.deleteOne({ _id: project._id });
    throw error;
  }
});

router.get("/projects/:id", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const projectId = access.project._id;
  const [tasks, meetings, announcements, members, files, employees] = await Promise.all([
    ExternalProjectTask.find({ project: projectId })
      .populate("assignee", "name email role")
      .populate("createdBy", "name")
      .populate("statusUpdatedBy", "name")
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(200),
    ExternalProjectMeeting.find({ project: projectId }).populate("createdBy", "name").sort({ date: -1 }).limit(100),
    ExternalProjectAnnouncement.find({ project: projectId }).populate("createdBy", "name").sort({ createdAt: -1 }).limit(100),
    ExternalProjectMember.find({ project: projectId }).populate("user", "name email role").sort({ createdAt: 1 }),
    fileBucket().find({ "metadata.project": projectId }).limit(200).toArray(),
    access.isHost
      ? User.find({ role: "employee" }).populate("employee", "status").select("name email employee").sort({ name: 1 })
        .then((users) => users.filter(({ employee }) => employee && employee.status !== "Inactive"))
      : [],
  ]);
  const comments = tasks.length
    ? await ExternalProjectComment.find({ task: { $in: tasks.map(({ _id }) => _id) } }).populate("author", "name").sort({ createdAt: 1 })
    : [];
  const activity = [
    ...comments.map((comment) => ({
      _id: `comment-${comment._id}`,
      kind: "comment",
      title: `${comment.author?.name || "A project member"} commented`,
      message: comment.body,
      taskTitle: tasks.find(({ _id }) => String(_id) === String(comment.task))?.title || "Project task",
      createdAt: comment.createdAt,
    })),
    ...tasks.filter((task) => task.statusUpdatedAt).map((task) => ({
      _id: `task-${task._id}`,
      kind: "task",
      title: `${task.statusUpdatedBy?.name || "A project member"} changed task status`,
      message: `${task.title} is now ${task.status}.`,
      taskTitle: task.title,
      createdAt: task.statusUpdatedAt,
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
  return res.json({
    data: {
      project: access.project,
      tasks,
      comments,
      activity,
      meetings,
      announcements,
      members,
      employees,
      files: files.map((file) => ({
        _id: file._id,
        filename: file.filename,
        length: file.length,
        contentType: file.metadata?.contentType || "application/octet-stream",
        uploadedAt: file.uploadDate,
        uploadedBy: file.metadata?.uploadedByName || "Project member",
      })),
      canManage: access.isHost,
    },
  });
});

router.post("/projects/:id/invites", hrOnly, async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const email = cleanText(req.body.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ message: "Enter a valid partner email address." });
  }
  const result = await createInvite(access.project, email, req.user._id);
  return res.status(201).json({
    invitation: { email: result.invite.email, url: result.invitationUrl, emailSent: result.emailSent, expiresAt: result.invite.expiresAt },
  });
});

router.post("/projects/:id/members", hrOnly, async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const userId = req.body.userId;
  if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Choose an employee account to add to the project." });
  }
  const employee = await User.findOne({ _id: userId, role: "employee" });
  if (!employee) return res.status(404).json({ message: "Employee account not found." });
  const alreadyMember = await ExternalProjectMember.exists({ project: access.project._id, user: employee._id });
  await ExternalProjectMember.updateOne(
    { project: access.project._id, user: employee._id },
    { $setOnInsert: { project: access.project._id, user: employee._id, kind: "internal" } },
    { upsert: true, runValidators: true },
  );
  if (!alreadyMember) {
    await notifyUser(employee._id, "Added to a partner project", `You were added to "${access.project.name}".`, "/employee");
  }
  return res.status(201).json({ message: "Employee added to the project." });
});

router.post("/projects/:id/tasks", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const title = cleanText(req.body.title);
  const description = cleanText(req.body.description);
  if (!title || title.length > 160 || description.length > 2000) {
    return res.status(400).json({ message: "Enter a task title and details no longer than 2,000 characters." });
  }
  let dueDate = null;
  if (req.body.dueDate) {
    dueDate = new Date(req.body.dueDate);
    if (Number.isNaN(dueDate.getTime())) return res.status(400).json({ message: "Enter a valid due date." });
  }
  let assignee = null;
  let assigneeRole = "";
  if (req.body.assigneeId) {
    if (!mongoose.isValidObjectId(req.body.assigneeId) || !(await ExternalProjectMember.exists({ project: access.project._id, user: req.body.assigneeId }))) {
      return res.status(400).json({ message: "Choose a member of this project." });
    }
    const assignedUser = await User.findById(req.body.assigneeId).select("role");
    if (!assignedUser) return res.status(400).json({ message: "Choose an active project member." });
    assignee = assignedUser._id;
    assigneeRole = assignedUser.role;
  }
  const task = await ExternalProjectTask.create({
    project: access.project._id,
    title,
    description,
    dueDate,
    assignee,
    createdBy: req.user._id,
  });
  await task.populate([{ path: "assignee", select: "name email role" }, { path: "createdBy", select: "name" }]);
  if (assignee && String(assignee) !== String(req.user._id)) {
    await Notification.create({
      user: assignee,
      title: "Partner project task assigned",
      message: `You were assigned "${task.title}" in ${access.project.name}.`,
      link: assigneeRole === "partner" ? "/partner" : assigneeRole === "employee" ? "/employee" : "/",
    });
  }
  return res.status(201).json({ data: task });
});

router.patch("/projects/:id/tasks/:taskId", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  if (!mongoose.isValidObjectId(req.params.taskId) || !["To do", "In progress", "Done"].includes(req.body.status)) {
    return res.status(400).json({ message: "Choose a valid task and status." });
  }
  const task = await ExternalProjectTask.findOne({ _id: req.params.taskId, project: access.project._id });
  if (!task) return res.status(404).json({ message: "Project task not found." });
  if (!access.isHost && String(task.assignee) !== String(req.user._id)) {
    return res.status(403).json({ message: "Only the assigned project member or host can update this task." });
  }
  const previousStatus = task.status;
  task.status = req.body.status;
  task.statusUpdatedAt = previousStatus === task.status ? task.statusUpdatedAt : new Date();
  task.statusUpdatedBy = previousStatus === task.status ? task.statusUpdatedBy : req.user._id;
  await task.save();
  await task.populate([
    { path: "assignee", select: "name email role" },
    { path: "createdBy", select: "name" },
    { path: "statusUpdatedBy", select: "name" },
  ]);
  if (previousStatus !== task.status) {
    const members = await ExternalProjectMember.find({
      project: access.project._id,
      user: { $ne: req.user._id },
    }).populate("user", "role");
    await Promise.all(members.filter(({ user }) => user).map(({ user }) => notifyUser(
      user._id,
      "Partner project task updated",
      `${req.user.name} changed "${task.title}" to ${task.status}.`,
      user.role === "partner" ? "/partner" : user.role === "employee" ? "/employee" : "/",
    )));
  }
  return res.json({ data: task });
});

router.post("/projects/:id/tasks/:taskId/comments", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const body = cleanText(req.body.body);
  if (!mongoose.isValidObjectId(req.params.taskId) || !body || body.length > 2000) {
    return res.status(400).json({ message: "Enter a comment (up to 2,000 characters) for a valid project task." });
  }
  const task = await ExternalProjectTask.findOne({ _id: req.params.taskId, project: access.project._id });
  if (!task) return res.status(404).json({ message: "Project task not found." });
  const comment = await ExternalProjectComment.create({ task: task._id, author: req.user._id, body });
  await comment.populate("author", "name");
  const members = await ExternalProjectMember.find({
    project: access.project._id,
    user: { $ne: req.user._id },
  }).populate("user", "role");
  await Promise.all(members.filter(({ user }) => user).map(({ user }) => notifyUser(
    user._id,
    "New partner project update",
    `${req.user.name} commented on "${task.title}".`,
    user.role === "partner" ? "/partner" : user.role === "employee" ? "/employee" : "/",
  )));
  return res.status(201).json({ data: comment });
});

router.post("/projects/:id/meetings", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const title = cleanText(req.body.title);
  const notes = cleanText(req.body.notes);
  const date = new Date(req.body.date);
  if (!title || title.length > 160 || !notes || notes.length > 5000 || Number.isNaN(date.getTime())) {
    return res.status(400).json({ message: "Enter a meeting title, valid date, and minutes (up to 5,000 characters)." });
  }
  const meeting = await ExternalProjectMeeting.create({
    project: access.project._id,
    title,
    date,
    notes,
    actionItems: cleanText(req.body.actionItems),
    createdBy: req.user._id,
  });
  await meeting.populate("createdBy", "name");
  return res.status(201).json({ data: meeting });
});

router.post("/projects/:id/announcements", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const title = cleanText(req.body.title);
  const message = cleanText(req.body.message);
  if (!title || title.length > 160 || !message || message.length > 2000) {
    return res.status(400).json({ message: "Enter an update title and message (up to 2,000 characters)." });
  }
  const announcement = await ExternalProjectAnnouncement.create({
    project: access.project._id,
    title,
    message,
    createdBy: req.user._id,
  });
  await announcement.populate("createdBy", "name");
  return res.status(201).json({ data: announcement });
});

router.post("/projects/:id/files", async (req, res) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  const contentType = (req.get("content-type") || "").split(";")[0].toLowerCase();
  const encodedName = req.get("x-file-name") || "";
  let filename;
  try {
    filename = path.basename(decodeURIComponent(encodedName.replace(/\+/g, "%20")).replace(/[\\/]/g, "/")).trim();
  } catch {
    return res.status(400).json({ message: "The file name is invalid." });
  }
  const size = Number(req.get("content-length"));
  if (!filename || filename.length > 180 || !allowedFileTypes.has(contentType)) {
    return res.status(400).json({ message: "Share a PDF, image, CSV, or plain-text file with a valid file name." });
  }
  if (Number.isFinite(size) && size > maxFileBytes) {
    return res.status(413).json({ message: "Files must be 10 MB or smaller." });
  }
  const bucket = fileBucket();
  const [storage] = await mongoose.connection.db.collection("externalProjectFiles.files").aggregate([
    { $match: { "metadata.project": access.project._id } },
    { $group: { _id: null, total: { $sum: "$length" } } },
  ]).toArray();
  const availableProjectBytes = Math.max(0, projectStorageLimit - (storage?.total || 0));
  const allowedUploadBytes = Math.min(maxFileBytes, availableProjectBytes);
  if (!allowedUploadBytes) return res.status(413).json({ message: "This project has reached its 100 MB shared-file limit." });
  if (Number.isFinite(size) && size > allowedUploadBytes) {
    return res.status(413).json({ message: "A file must be 10 MB or smaller, and fit within the project's 100 MB shared-file limit." });
  }
  const upload = bucket.openUploadStream(filename, {
    metadata: {
      project: access.project._id,
      contentType,
      uploadedBy: req.user._id,
      uploadedByName: req.user.name,
    },
  });
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(bytes > allowedUploadBytes ? new Error("FILE_TOO_LARGE") : null, chunk);
    },
  });
  try {
    await pipeline(req, limiter, upload);
  } catch (error) {
    try {
      await bucket.delete(upload.id);
    } catch (cleanupError) {
      console.error("Could not remove incomplete collaboration upload:", cleanupError.message);
    }
    if (error.message === "FILE_TOO_LARGE") return res.status(413).json({ message: "A file must be 10 MB or smaller, and fit within the project's 100 MB shared-file limit." });
    throw error;
  }
  return res.status(201).json({
    data: {
      _id: upload.id,
      filename,
      length: bytes,
      contentType,
      uploadedAt: new Date(),
      uploadedBy: req.user.name,
    },
  });
});

router.get("/projects/:id/files/:fileId", async (req, res, next) => {
  const access = await getProjectAccess(req.params.id, req.user);
  if (sendAccessError(res, access.error)) return;
  if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(400).json({ message: "A valid file ID is required." });
  const bucket = fileBucket();
  const [file] = await bucket.find({
    _id: new mongoose.Types.ObjectId(req.params.fileId),
    "metadata.project": access.project._id,
  }).limit(1).toArray();
  if (!file) return res.status(404).json({ message: "Shared file not found." });
  res.set("Content-Type", file.metadata?.contentType || "application/octet-stream");
  res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  return bucket.openDownloadStream(file._id).on("error", next).pipe(res);
});

export default router;
