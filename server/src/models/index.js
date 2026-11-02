import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  sessionVersion: { type: Number, default: 0 },
  role: { type: String, enum: ["admin", "hr", "employee", "partner"], default: "admin" },
  employee: { type: Schema.Types.ObjectId, ref: "Employee", default: undefined },
  partnerOrganization: { type: Schema.Types.ObjectId, ref: "ExternalOrganization", default: undefined },
}, { timestamps: true });
userSchema.index({ employee: 1 }, { unique: true, sparse: true });

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

const employeeSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  department: { type: String, required: true, trim: true, maxlength: 100 },
  jobTitle: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 30, default: "" },
  gender: { type: String, enum: ["", "Female", "Male", "Non-binary", "Other", "Prefer not to say"], default: "" },
  hireDate: { type: Date, required: true },
  employmentType: { type: String, enum: ["Full-time", "Part-time", "Contract", "Intern"], default: "Full-time" },
  salary: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["Active", "On leave", "Inactive"], default: "Active" },
}, { timestamps: true });
employeeSchema.index({ email: 1 }, { unique: true });

const attendanceSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  date: { type: Date, required: true },
  checkIn: { type: String, default: "", match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
  checkOut: { type: String, default: "", match: /^$|^([01]\d|2[0-3]):[0-5]\d$/ },
  hoursWorked: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["Present", "Late", "Absent", "On leave"], default: "Present" },
  notes: { type: String, trim: true, maxlength: 500, default: "" },
}, { timestamps: true });
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

const leaveSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  type: { type: String, enum: ["Annual", "Sick", "Personal", "Parental", "Unpaid"], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, trim: true, maxlength: 1000, default: "" },
  status: { type: String, enum: ["Pending", "Approved", "Declined"], default: "Pending" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });
leaveSchema.pre("validate", function validateLeaveDates() {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate("endDate", "End date must be on or after the start date.");
  }
});

const leaveBalanceSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  year: { type: Number, required: true, min: 2000, max: 2200 },
  type: { type: String, enum: ["Annual", "Sick", "Personal", "Parental"], required: true },
  entitlement: { type: Number, required: true, min: 0, max: 366, default: 0 },
}, { timestamps: true });
leaveBalanceSchema.index({ employee: 1, year: 1, type: 1 }, { unique: true });

const profileChangeSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  changes: {
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 30 },
  },
  status: { type: String, enum: ["Pending", "Approved", "Declined"], default: "Pending" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const payrollSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  baseSalary: { type: Number, required: true, min: 0 },
  bonus: { type: Number, min: 0, default: 0 },
  deductions: { type: Number, min: 0, default: 0 },
  netPay: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["Pending", "Processed"], default: "Pending" },
  processedAt: { type: Date, default: null },
}, { timestamps: true });

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  readAt: { type: Date, default: null },
  link: { type: String, trim: true, maxlength: 200, default: "" },
  eventKey: { type: String, trim: true, select: false },
}, { timestamps: true });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index(
  { user: 1, eventKey: 1 },
  { unique: true, partialFilterExpression: { eventKey: { $type: "string" } } },
);

const auditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actorName: { type: String, required: true, maxlength: 100 },
  actorRole: { type: String, required: true, enum: ["admin", "hr", "employee", "partner"] },
  action: { type: String, required: true, maxlength: 120 },
  resource: { type: String, required: true, maxlength: 100 },
  resourceId: { type: String, maxlength: 100, default: "" },
  summary: { type: String, trim: true, maxlength: 500, default: "" },
}, { timestamps: true });
auditLogSchema.index({ createdAt: -1 });
payrollSchema.index({ employee: 1, period: 1 }, { unique: true });

const candidateSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  position: { type: String, required: true, trim: true, maxlength: 120 },
  department: { type: String, required: true, trim: true, maxlength: 100 },
  stage: { type: String, enum: ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"], default: "Applied" },
  job: { type: Schema.Types.ObjectId, ref: "JobOpening", default: null },
  notes: { type: String, trim: true, maxlength: 3000, default: "" },
  interviewAt: { type: Date, default: null },
  appliedAt: { type: Date, default: Date.now },
}, { timestamps: true });

const jobOpeningSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  department: { type: String, required: true, trim: true, maxlength: 100 },
  location: { type: String, trim: true, maxlength: 120, default: "" },
  employmentType: { type: String, enum: ["Full-time", "Part-time", "Contract", "Intern"], default: "Full-time" },
  description: { type: String, trim: true, maxlength: 3000, default: "" },
  status: { type: String, enum: ["Open", "Closed"], default: "Open" },
}, { timestamps: true });

const performanceSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  reviewer: { type: String, required: true, trim: true, maxlength: 120 },
  period: { type: String, required: true, trim: true, maxlength: 50 },
  rating: { type: Number, min: 1, max: 5, default: null },
  feedback: { type: String, trim: true, maxlength: 3000, default: "" },
  status: { type: String, enum: ["In progress", "Completed"], default: "In progress" },
}, { timestamps: true });

const meetingMinuteSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  date: { type: Date, required: true },
  attendees: { type: String, trim: true, maxlength: 2000, default: "" },
  notes: { type: String, required: true, trim: true, maxlength: 5000 },
  actionItems: { type: String, trim: true, maxlength: 3000, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const collaborationTodoSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  completed: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const workTaskSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  assignedEmployee: { type: Schema.Types.ObjectId, ref: "Employee", required: true },
  dueDate: { type: Date, default: null },
  status: { type: String, enum: ["To do", "In progress", "Done"], default: "To do" },
  assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });
workTaskSchema.index({ assignedEmployee: 1, status: 1, dueDate: 1 });

const taskCommentSchema = new Schema({
  task: { type: Schema.Types.ObjectId, ref: "WorkTask", required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

const onboardingChecklistSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  items: [{
    title: { type: String, required: true, trim: true, maxlength: 160 },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  }],
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const collaborationAnnouncementSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const externalOrganizationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  nameKey: { type: String, required: true, lowercase: true, trim: true, unique: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const externalProjectSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  partnerOrganization: { type: Schema.Types.ObjectId, ref: "ExternalOrganization", required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const externalProjectMemberSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: "ExternalProject", required: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  kind: { type: String, enum: ["internal", "partner"], required: true },
}, { timestamps: true });
externalProjectMemberSchema.index({ project: 1, user: 1 }, { unique: true });
externalProjectMemberSchema.index({ user: 1, project: 1 });

const externalProjectInviteSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: "ExternalProject", required: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  tokenHash: { type: String, required: true, unique: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  acceptedAt: { type: Date, default: null },
  status: { type: String, enum: ["Pending", "Accepted", "Revoked"], default: "Pending", index: true },
}, { timestamps: true });
externalProjectInviteSchema.index({ project: 1, email: 1 });

const externalProjectTaskSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: "ExternalProject", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  status: { type: String, enum: ["To do", "In progress", "Done"], default: "To do" },
  dueDate: { type: Date, default: null },
  assignee: { type: Schema.Types.ObjectId, ref: "User", default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  statusUpdatedAt: { type: Date, default: null },
  statusUpdatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

const externalProjectCommentSchema = new Schema({
  task: { type: Schema.Types.ObjectId, ref: "ExternalProjectTask", required: true, index: true },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: true });

const externalProjectMeetingSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: "ExternalProject", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  date: { type: Date, required: true },
  notes: { type: String, required: true, trim: true, maxlength: 5000 },
  actionItems: { type: String, trim: true, maxlength: 3000, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const externalProjectAnnouncementSchema = new Schema({
  project: { type: Schema.Types.ObjectId, ref: "ExternalProject", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

const externalCollaborationRequestSchema = new Schema({
  partnerOrganization: { type: Schema.Types.ObjectId, ref: "ExternalOrganization", required: true, index: true },
  fromUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
  projectName: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ["Pending", "Accepted", "Declined"], default: "Pending", index: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  project: { type: Schema.Types.ObjectId, ref: "ExternalProject", default: null },
  responseMessage: { type: String, trim: true, maxlength: 1000, default: "" },
}, { timestamps: true });

const revokedTokenSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

const passwordResetSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

export const User = model("User", userSchema);
export const Employee = model("Employee", employeeSchema);
export const Attendance = model("Attendance", attendanceSchema);
export const LeaveRequest = model("LeaveRequest", leaveSchema);
export const LeaveBalance = model("LeaveBalance", leaveBalanceSchema);
export const ProfileChange = model("ProfileChange", profileChangeSchema);
export const Payroll = model("Payroll", payrollSchema);
export const Candidate = model("Candidate", candidateSchema);
export const JobOpening = model("JobOpening", jobOpeningSchema);
export const PerformanceReview = model("PerformanceReview", performanceSchema);
export const MeetingMinute = model("MeetingMinute", meetingMinuteSchema);
export const CollaborationTodo = model("CollaborationTodo", collaborationTodoSchema);
export const WorkTask = model("WorkTask", workTaskSchema);
export const TaskComment = model("TaskComment", taskCommentSchema);
export const OnboardingChecklist = model("OnboardingChecklist", onboardingChecklistSchema);
export const CollaborationAnnouncement = model("CollaborationAnnouncement", collaborationAnnouncementSchema);
export const ExternalOrganization = model("ExternalOrganization", externalOrganizationSchema);
export const ExternalProject = model("ExternalProject", externalProjectSchema);
export const ExternalProjectMember = model("ExternalProjectMember", externalProjectMemberSchema);
export const ExternalProjectInvite = model("ExternalProjectInvite", externalProjectInviteSchema);
export const ExternalProjectTask = model("ExternalProjectTask", externalProjectTaskSchema);
export const ExternalProjectComment = model("ExternalProjectComment", externalProjectCommentSchema);
export const ExternalProjectMeeting = model("ExternalProjectMeeting", externalProjectMeetingSchema);
export const ExternalProjectAnnouncement = model("ExternalProjectAnnouncement", externalProjectAnnouncementSchema);
export const ExternalCollaborationRequest = model("ExternalCollaborationRequest", externalCollaborationRequestSchema);
export const Notification = model("Notification", notificationSchema);
export const AuditLog = model("AuditLog", auditLogSchema);
export const RevokedToken = model("RevokedToken", revokedTokenSchema);
export const PasswordReset = model("PasswordReset", passwordResetSchema);
