import { AuditLog } from "../models/index.js";

export function auditChanges(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  res.once("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 400 || !req.user) return;
    const segments = req.path.split("/").filter(Boolean);
    const resource = segments[0] || "record";
    const resourceId = segments.length > 1 && /^[a-f\d]{24}$/i.test(segments[1]) ? segments[1] : "";
    AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: `${req.method} ${req.path}`,
      resource,
      resourceId,
      summary: `${req.user.role} ${req.method.toLowerCase()} ${resource}`,
    }).catch((error) => console.error("Could not save audit log:", error.message));
  });
  return next();
}
