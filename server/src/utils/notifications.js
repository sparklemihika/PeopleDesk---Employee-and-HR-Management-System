import { Notification, User, WorkTask } from "../models/index.js";

export async function notifyUser(user, title, message, link = "") {
  if (!user) return;
  await Notification.create({ user, title, message, link });
}

export async function notifyHr(title, message, link = "") {
  const users = await User.find({ role: { $in: ["admin", "hr"] } }).select("_id");
  if (users.length) {
    await Notification.insertMany(users.map(({ _id }) => ({ user: _id, title, message, link })));
  }
}

export async function notifyEmployee(employeeId, title, message, link = "/employee") {
  const account = await User.findOne({ employee: employeeId }).select("_id");
  if (account) await notifyUser(account._id, title, message, link);
}

export async function notifyUpcomingTaskDue(user) {
  if (user.role !== "employee" || !user.employee) return;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);
  const tasks = await WorkTask.find({
    assignedEmployee: user.employee,
    status: { $ne: "Done" },
    dueDate: { $gte: today, $lt: dayAfterTomorrow },
  }).select("title dueDate");
  for (const task of tasks) {
    const due = new Date(task.dueDate);
    const dueDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
    const daysUntilDue = Math.round((dueDay - today) / 86400000);
    const wording = daysUntilDue === 0 ? "due today" : "due tomorrow";
    try {
      await Notification.updateOne(
        { user: user._id, eventKey: `task-due:${task._id}:${daysUntilDue}` },
        {
          $setOnInsert: {
            user: user._id,
            eventKey: `task-due:${task._id}:${daysUntilDue}`,
            title: `Task ${wording}`,
            message: `"${task.title}" is ${wording}.`,
            link: "/employee",
          },
        },
        { upsert: true, runValidators: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
}
