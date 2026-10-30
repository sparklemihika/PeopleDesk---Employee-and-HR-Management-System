import { Notification, User } from "../models/index.js";

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
