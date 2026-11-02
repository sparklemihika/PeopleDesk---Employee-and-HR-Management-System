import { Router } from "express";
import mongoose from "mongoose";
import {
  CollaborationAnnouncement, CollaborationTodo, Employee, MeetingMinute, OnboardingChecklist,
  TaskComment, User, WorkTask,
} from "../models/index.js";
import { requireRole } from "../middleware/auth.js";
import { notifyEmployee, notifyUser } from "../utils/notifications.js";

const router = Router();
const hrOnly = requireRole("admin", "hr");

function isValidDate(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

router.get("/", async (req, res) => {
  const taskFilter = req.user.role === "employee"
    ? { assignedEmployee: req.user.employee }
    : {};
  const [meetings, todos, tasks, announcements, employees, mentionUsers, onboarding] = await Promise.all([
    MeetingMinute.find().populate("createdBy", "name").sort({ date: -1 }).limit(50),
    CollaborationTodo.find().populate("createdBy", "name").sort({ createdAt: -1 }).limit(100),
    WorkTask.find(taskFilter).populate("assignedEmployee", "name department jobTitle").populate("assignedBy", "name").sort({ dueDate: 1, createdAt: -1 }).limit(200),
    CollaborationAnnouncement.find().populate("createdBy", "name").sort({ createdAt: -1 }).limit(30),
    req.user.role === "employee" ? [] : Employee.find({ status: { $ne: "Inactive" } }).select("name department jobTitle").sort({ name: 1 }),
    Employee.find({ status: { $ne: "Inactive" } }).select("_id name"),
    OnboardingChecklist.find(req.user.role === "employee" ? { employee: req.user.employee } : {})
      .populate("employee", "name department jobTitle")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .limit(200),
  ]);
  const activeEmployeeIds = mentionUsers.map(({ _id }) => _id);
  const employeeAccounts = activeEmployeeIds.length
    ? await User.find({ role: "employee", employee: { $in: activeEmployeeIds } }).select("name employee").sort({ name: 1 })
    : [];
  const employeesWithAccounts = new Set(employeeAccounts.map(({ employee }) => String(employee)));
  const activeEmployeeNames = new Map(mentionUsers.map(({ _id, name }) => [String(_id), name]));
  const comments = tasks.length
    ? await TaskComment.find({ task: { $in: tasks.map(({ _id }) => _id) } })
      .populate("author", "name role")
      .populate("mentions", "name")
      .sort({ createdAt: 1 })
    : [];
  return res.json({
    meetings,
    todos,
    tasks,
    comments,
    announcements,
    employees: employees.filter(({ _id }) => employeesWithAccounts.has(String(_id))),
    mentionUsers: employeeAccounts.map((account) => ({
      _id: account._id,
      name: activeEmployeeNames.get(String(account.employee)),
    })),
    onboarding,
    permissions: { canManage: req.user.role !== "employee" },
  });
});

router.post("/meetings", hrOnly, async (req, res) => {
  const title = cleanText(req.body.title);
  const notes = cleanText(req.body.notes);
  if (!title || title.length > 160 || !notes || notes.length > 5000 || !isValidDate(req.body.date)) {
    return res.status(400).json({ message: "Enter a meeting title, valid date, and notes (up to 5,000 characters)." });
  }
  const meeting = await MeetingMinute.create({
    title,
    date: new Date(req.body.date),
    attendees: cleanText(req.body.attendees),
    notes,
    actionItems: cleanText(req.body.actionItems),
    createdBy: req.user._id,
  });
  await meeting.populate("createdBy", "name");
  return res.status(201).json({ data: meeting });
});

router.post("/todos", async (req, res) => {
  const title = cleanText(req.body.title);
  if (!title || title.length > 160 || (req.body.description !== undefined && (typeof req.body.description !== "string" || req.body.description.length > 1000))) {
    return res.status(400).json({ message: "Enter a to-do title (up to 160 characters) and a description of up to 1,000 characters." });
  }
  const todo = await CollaborationTodo.create({
    title,
    description: cleanText(req.body.description),
    createdBy: req.user._id,
  });
  await todo.populate("createdBy", "name");
  return res.status(201).json({ data: todo });
});

router.patch("/todos/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid to-do ID is required." });
  if (typeof req.body.completed !== "boolean") return res.status(400).json({ message: "To-do completion must be true or false." });
  const todo = await CollaborationTodo.findByIdAndUpdate(
    req.params.id,
    { completed: req.body.completed },
    { new: true, runValidators: true },
  ).populate("createdBy", "name");
  if (!todo) return res.status(404).json({ message: "To-do item not found." });
  return res.json({ data: todo });
});

router.post("/tasks", hrOnly, async (req, res) => {
  const title = cleanText(req.body.title);
  const employeeId = req.body.employeeId;
  if (!title || title.length > 160 || typeof employeeId !== "string" || !mongoose.isValidObjectId(employeeId)) {
    return res.status(400).json({ message: "Enter a task title and choose an employee." });
  }
  if (req.body.description !== undefined && (typeof req.body.description !== "string" || req.body.description.length > 1000)) {
    return res.status(400).json({ message: "Task description must be 1,000 characters or fewer." });
  }
  let dueDate = null;
  if (req.body.dueDate) {
    if (!isValidDate(req.body.dueDate)) return res.status(400).json({ message: "Enter a valid task due date." });
    dueDate = new Date(req.body.dueDate);
  }
  const employee = await Employee.findOne({ _id: employeeId, status: { $ne: "Inactive" } });
  if (!employee) return res.status(404).json({ message: "Active employee not found." });
  if (!(await User.exists({ employee: employee._id, role: "employee" }))) {
    return res.status(409).json({ message: "This employee does not have an employee portal account yet." });
  }
  const task = await WorkTask.create({
    title,
    description: cleanText(req.body.description),
    assignedEmployee: employee._id,
    dueDate,
    assignedBy: req.user._id,
  });
  await task.populate([
    { path: "assignedEmployee", select: "name department jobTitle" },
    { path: "assignedBy", select: "name" },
  ]);
  await notifyEmployee(employee._id, "New task assigned", `You were assigned "${task.title}".`, "/employee");
  return res.status(201).json({ data: task });
});

router.patch("/tasks/:id/status", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid task ID is required." });
  const { status } = req.body;
  if (!["To do", "In progress", "Done"].includes(status)) {
    return res.status(400).json({ message: "Choose To do, In progress, or Done." });
  }
  const filter = { _id: req.params.id };
  if (req.user.role === "employee") filter.assignedEmployee = req.user.employee;
  const existingTask = await WorkTask.findOne(filter);
  if (!existingTask) return res.status(404).json({ message: "Assigned task not found." });
  const task = await WorkTask.findByIdAndUpdate(existingTask._id, { status }, { new: true, runValidators: true })
    .populate("assignedEmployee", "name department jobTitle")
    .populate("assignedBy", "name");
  if (existingTask.status !== status) {
    if (req.user.role === "employee") {
      await notifyUser(existingTask.assignedBy, "Task status updated", `${task.assignedEmployee.name} changed "${task.title}" to ${status}.`, "/operations");
    } else {
      await notifyEmployee(existingTask.assignedEmployee._id, "Task status updated", `"${task.title}" was changed to ${status}.`, "/employee");
    }
  }
  return res.json({ data: task });
});

router.post("/tasks/:id/comments", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "A valid task ID is required." });
  const body = cleanText(req.body.body);
  const mentionIds = req.body.mentions === undefined ? [] : req.body.mentions;
  if (!body || body.length > 2000 || !Array.isArray(mentionIds) || mentionIds.length > 20 || mentionIds.some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: "Enter a comment (up to 2,000 characters) and valid mention selections." });
  }
  const taskFilter = { _id: req.params.id };
  if (req.user.role === "employee") taskFilter.assignedEmployee = req.user.employee;
  const task = await WorkTask.findOne(taskFilter);
  if (!task) return res.status(404).json({ message: "Assigned task not found." });
  const uniqueMentionIds = [...new Set(mentionIds.map(String))];
  const mentionedUsers = uniqueMentionIds.length
    ? await User.find({ _id: { $in: uniqueMentionIds }, role: "employee" }).populate("employee", "name status").select("name employee")
    : [];
  if (mentionedUsers.length !== uniqueMentionIds.length || mentionedUsers.some(({ employee }) => !employee || employee.status === "Inactive")) {
    return res.status(400).json({ message: "One or more mentioned employees are unavailable." });
  }
  const normalizedBody = body.toLocaleLowerCase();
  if (mentionedUsers.some(({ employee }) => !normalizedBody.includes(`@${employee.name.toLocaleLowerCase()}`))) {
    return res.status(400).json({ message: "Include each selected employee mention in the comment using @Name." });
  }
  const comment = await TaskComment.create({
    task: task._id,
    author: req.user._id,
    body,
    mentions: uniqueMentionIds,
  });
  await comment.populate([
    { path: "author", select: "name role" },
    { path: "mentions", select: "name" },
  ]);
  for (const mentionedUser of mentionedUsers) {
    if (String(mentionedUser._id) === String(req.user._id)) continue;
    await notifyUser(
      mentionedUser._id,
      "You were mentioned in a task",
      `${req.user.name} mentioned you on "${task.title}": ${body.slice(0, 250)}`,
      "/employee",
    );
  }
  return res.status(201).json({ data: comment });
});

router.post("/onboarding", hrOnly, async (req, res) => {
  const title = cleanText(req.body.title);
  const employeeId = req.body.employeeId;
  const items = req.body.items;
  if (!title || title.length > 160 || typeof employeeId !== "string" || !mongoose.isValidObjectId(employeeId)
    || !Array.isArray(items) || items.length < 1 || items.length > 30
    || items.some((item) => typeof item !== "string" || !item.trim() || item.trim().length > 160)) {
    return res.status(400).json({ message: "Choose an employee, enter a checklist title, and add 1–30 checklist items (up to 160 characters each)." });
  }
  const employee = await Employee.findOne({ _id: employeeId, status: { $ne: "Inactive" } });
  if (!employee) return res.status(404).json({ message: "Active employee not found." });
  if (!(await User.exists({ employee: employee._id, role: "employee" }))) {
    return res.status(409).json({ message: "This employee does not have an employee portal account yet." });
  }
  const checklist = await OnboardingChecklist.create({
    employee: employee._id,
    title,
    items: items.map((item) => ({ title: item.trim() })),
    createdBy: req.user._id,
  });
  await checklist.populate([
    { path: "employee", select: "name department jobTitle" },
    { path: "createdBy", select: "name" },
  ]);
  await notifyEmployee(employee._id, "Onboarding checklist assigned", `Your checklist "${title}" is ready.`, "/employee");
  return res.status(201).json({ data: checklist });
});

router.patch("/onboarding/:id/items/:itemId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.itemId)) {
    return res.status(400).json({ message: "Valid checklist and checklist item IDs are required." });
  }
  if (typeof req.body.completed !== "boolean") return res.status(400).json({ message: "Checklist completion must be true or false." });
  const filter = { _id: req.params.id };
  if (req.user.role === "employee") filter.employee = req.user.employee;
  const checklist = await OnboardingChecklist.findOne(filter);
  if (!checklist) return res.status(404).json({ message: "Onboarding checklist not found." });
  const item = checklist.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: "Onboarding checklist item not found." });
  item.completed = req.body.completed;
  item.completedAt = item.completed ? new Date() : null;
  await checklist.save();
  await checklist.populate([
    { path: "employee", select: "name department jobTitle" },
    { path: "createdBy", select: "name" },
  ]);
  return res.json({ data: checklist });
});

router.post("/announcements", hrOnly, async (req, res) => {
  const title = cleanText(req.body.title);
  const message = cleanText(req.body.message);
  if (!title || title.length > 160 || !message || message.length > 2000) {
    return res.status(400).json({ message: "Enter an announcement title and message (up to 2,000 characters)." });
  }
  const announcement = await CollaborationAnnouncement.create({ title, message, createdBy: req.user._id });
  await announcement.populate("createdBy", "name");
  return res.status(201).json({ data: announcement });
});

export default router;
