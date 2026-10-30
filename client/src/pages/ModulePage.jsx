import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const attendanceColors = { Present: "#34a987", Late: "#f0a94a", Absent: "#e47791", "On leave": "#5485df" };
const departmentColors = ["#6d5ce8", "#34a987", "#f0a94a", "#5485df", "#e47791", "#35a9ba"];
const leaveColors = { Pending: "#f0a94a", Approved: "#34a987", Declined: "#e47791" };
const payrollColors = { Processed: "#34a987", Pending: "#f0a94a" };

const modules = {
  employees: {
    title: "Employees", eyebrow: "People directory", description: "Manage your team, roles, and employee information.", endpoint: "/employees", action: "Add employee",
    summary: [{ label: "Employees", value: "total", note: "In your organization" }, { label: "Active", value: "active", note: "Currently employed" }, { label: "Departments", value: "departments", note: "Represented on your team" }],
    columns: [["name", "Employee"], ["department", "Department"], ["jobTitle", "Job title"], ["email", "Email"], ["status", "Status"]],
    fields: [["name", "Full name", "text", true], ["email", "Email address", "email", true], ["department", "Department", "text", true], ["jobTitle", "Job title", "text", true], ["phone", "Phone number", "tel", false], ["hireDate", "Hire date", "date", true], ["employmentType", "Employment type", "select", true, ["Full-time", "Part-time", "Contract", "Intern"]], ["salary", "Annual salary", "number", false]],
  },
  attendance: {
    title: "Attendance", eyebrow: "Time & schedules", description: "Record and review your team’s daily attendance.", endpoint: "/attendance", action: "Record attendance",
    summary: [{ label: "Present today", value: "present", note: "Checked in today" }, { label: "Late arrivals", value: "late", note: "Marked late today" }, { label: "Attendance records", value: "total", note: "All recorded entries" }],
    columns: [["employee", "Employee"], ["date", "Date"], ["checkIn", "Check-in"], ["checkOut", "Check-out"], ["hoursWorked", "Hours"], ["status", "Status"], ["actions", "Actions"]],
    fields: [["employeeId", "Employee", "employee", true], ["date", "Date", "date", true], ["checkIn", "Check-in time", "time", true], ["checkOut", "Check-out time", "time", false], ["status", "Status", "select", true, ["Present", "Late", "Absent", "On leave"]], ["notes", "Notes", "text", false]],
  },
  leave: {
    title: "Leave management", eyebrow: "Time away", description: "Review leave requests and keep team schedules up to date.", endpoint: "/leaves", action: "New leave request",
    summary: [{ label: "Pending requests", value: "pending", note: "Awaiting your review" }, { label: "Approved", value: "approved", note: "Approved requests" }, { label: "Total requests", value: "total", note: "All time-off requests" }],
    columns: [["employee", "Employee"], ["type", "Leave type"], ["startDate", "Start date"], ["endDate", "End date"], ["days", "Days"], ["status", "Status"], ["actions", "Actions"]],
    fields: [["employeeId", "Employee", "employee", true], ["type", "Leave type", "select", true, ["Annual", "Sick", "Personal", "Parental", "Unpaid"]], ["startDate", "Start date", "date", true], ["endDate", "End date", "date", true], ["reason", "Reason", "text", false]],
  },
  payroll: {
    title: "Payroll", eyebrow: "Compensation", description: "Create payroll records and review employee compensation.", endpoint: "/payroll", action: "Create payroll record",
    summary: [{ label: "Payroll records", value: "total", note: "All records" }, { label: "Processed", value: "processed", note: "Successfully processed" }, { label: "Pending", value: "pending", note: "Awaiting processing" }],
    columns: [["employee", "Employee"], ["period", "Pay period"], ["baseSalary", "Base salary"], ["bonus", "Bonus"], ["netPay", "Net pay"], ["status", "Status"], ["actions", "Actions"]],
    fields: [["employeeId", "Employee", "employee", true], ["period", "Pay period (YYYY-MM)", "month", true], ["baseSalary", "Base salary", "number", true], ["bonus", "Bonus", "number", false], ["deductions", "Deductions", "number", false]],
  },
  recruitment: {
    title: "Recruitment", eyebrow: "Grow your team", description: "Manage candidates and keep your hiring pipeline moving.", endpoint: "/candidates", action: "Add candidate",
    summary: [{ label: "Candidates", value: "total", note: "In your hiring pipeline" }, { label: "Interviews", value: "interviews", note: "In interview stage" }, { label: "Offers", value: "offers", note: "Awaiting a decision" }],
    columns: [["name", "Candidate"], ["email", "Email"], ["position", "Position"], ["job", "Job opening"], ["interviewAt", "Interview"], ["notes", "Notes"], ["stage", "Stage"], ["actions", "Actions"]],
    fields: [["name", "Full name", "text", true], ["email", "Email address", "email", true], ["position", "Position", "text", true], ["department", "Department", "text", true], ["job", "Job opening", "job", false], ["interviewAt", "Interview date and time", "datetime-local", false], ["notes", "Recruiter notes", "textarea", false], ["stage", "Hiring stage", "select", true, ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"]]],
  },
  performance: {
    title: "Performance", eyebrow: "Growth & development", description: "Support your team’s growth with meaningful reviews and feedback.", endpoint: "/performance", action: "Create review",
    summary: [{ label: "Reviews", value: "total", note: "All review records" }, { label: "Completed", value: "completed", note: "Reviews completed" }, { label: "In progress", value: "pending", note: "Awaiting feedback" }],
    columns: [["employee", "Employee"], ["reviewer", "Reviewer"], ["period", "Review period"], ["rating", "Rating"], ["status", "Status"]],
    fields: [["employeeId", "Employee", "employee", true], ["reviewer", "Reviewer name", "text", true], ["period", "Review period", "text", true], ["rating", "Rating (1–5)", "number", false], ["feedback", "Feedback", "text", false]],
  },
};

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function dateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function formatPeriod(value) {
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initials(name = "") {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function AttendanceChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><strong>{label ?? "Attendance"}</strong>{payload.map((item) => <span key={item.dataKey || item.name}><i style={{ background: item.color || item.payload?.fill }} />{item.name}: {item.value}</span>)}</div>;
}

function InterviewCell({ record, onSave }) {
  const [value, setValue] = useState(record.interviewAt
    ? new Date(new Date(record.interviewAt).getTime() - new Date(record.interviewAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "");
  useEffect(() => {
    setValue(record.interviewAt
      ? new Date(new Date(record.interviewAt).getTime() - new Date(record.interviewAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      : "");
  }, [record.interviewAt]);
  return <div className="interview-cell"><input className="form-control form-control-sm interview-input" aria-label={`Schedule interview for ${record.name}`} type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} /><button className="btn btn-sm btn-outline-primary" onClick={() => onSave(value)}>Save</button></div>;
}

export default function ModulePage({ moduleKey }) {
  const config = modules[moduleKey];
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(null);
  const [notice, setNotice] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api(config.endpoint);
      setRecords(result.data || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [config.endpoint]);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => {
    if (!config.fields.some(([name]) => name === "employeeId")) return;
    setEmployeesLoading(true);
    api("/employees")
      .then((result) => setEmployees(result.data || []))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setEmployeesLoading(false));
  }, [config.fields]);
  useEffect(() => {
    if (moduleKey !== "recruitment") return;
    api("/operations/jobs").then((result) => setJobs(result.data || [])).catch((requestError) => setError(requestError.message));
  }, [moduleKey]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const filtered = useMemo(() => records.filter((record) => Object.values(record)
    .map((value) => value && typeof value === "object" ? Object.values(value).join(" ") : value)
    .join(" ").toLowerCase().includes(query.toLowerCase())), [records, query]);
  const todayKey = localDateKey();
  const todayAttendance = useMemo(
    () => new Map(records.filter((record) => dateKey(record.date) === todayKey).map((record) => [record.employee?._id, record])),
    [records, todayKey],
  );
  const attendanceEmployees = useMemo(
    () => employees.filter((employee) => employee.status !== "Inactive" && employee.name.toLowerCase().includes(query.toLowerCase())),
    [employees, query],
  );
  const attendanceWeek = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = localDateKey(date);
    const dayRecords = records.filter((record) => dateKey(record.date) === key);
    return {
      day: date.toLocaleDateString(undefined, { weekday: "short" }),
      present: dayRecords.filter((record) => ["Present", "Late"].includes(record.status)).length,
      absent: dayRecords.filter((record) => record.status === "Absent").length,
    };
  }), [records]);
  const attendanceMix = useMemo(() => Object.keys(attendanceColors).map((status) => ({
    name: status,
    value: records.filter((record) => record.status === status && dateKey(record.date) === todayKey).length,
  })).filter((item) => item.value > 0), [records, todayKey]);
  const departmentCounts = useMemo(() => {
    const countsByDepartment = new Map();
    employees.forEach((employee) => {
      const department = employee.department || "Unassigned";
      countsByDepartment.set(department, (countsByDepartment.get(department) || 0) + 1);
    });
    return [...countsByDepartment].map(([department, employeesCount]) => ({ department, employees: employeesCount }));
  }, [employees]);
  const leaveStatusMix = useMemo(() => Object.entries(leaveColors).map(([name, color]) => ({
    name,
    color,
    value: records.filter((record) => record.status === name).length,
  })).filter((item) => item.value > 0), [records]);
  const leaveTypeCounts = useMemo(() => {
    const countsByType = new Map();
    records.forEach((record) => {
      const type = record.type || "Other";
      countsByType.set(type, (countsByType.get(type) || 0) + 1);
    });
    return [...countsByType].map(([type, requests]) => ({ type, requests }));
  }, [records]);
  const payrollByPeriod = useMemo(() => {
    const totalsByPeriod = new Map();
    records.forEach((record) => {
      const period = record.period;
      if (!period) return;
      totalsByPeriod.set(period, (totalsByPeriod.get(period) || 0) + Number(record.netPay || 0));
    });
    return [...totalsByPeriod]
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(-6)
      .map(([period, netPay]) => ({ period: formatPeriod(period), netPay }));
  }, [records]);
  const payrollStatusMix = useMemo(() => Object.entries(payrollColors).map(([name, color]) => ({
    name,
    color,
    value: records.filter((record) => record.status === name).length,
  })).filter((item) => item.value > 0), [records]);
  const counts = useMemo(() => ({
    total: records.length,
    active: records.filter((record) => record.status === "Active").length,
    departments: new Set(records.map((record) => record.department).filter(Boolean)).size,
    present: records.filter((record) => dateKey(record.date) === todayKey && ["Present", "Late"].includes(record.status)).length,
    late: records.filter((record) => dateKey(record.date) === todayKey && record.status === "Late").length,
    pending: records.filter((record) => record.status === "Pending" || record.status === "In progress").length,
    approved: records.filter((record) => record.status === "Approved" || record.status === "Processed" || record.status === "Completed").length,
    processed: records.filter((record) => record.status === "Processed").length,
    interviews: records.filter((record) => record.stage === "Interview" || record.interviewAt).length,
    offers: records.filter((record) => record.stage === "Offer").length,
    completed: records.filter((record) => record.status === "Completed").length,
  }), [records, todayKey]);

  async function setAttendanceStatus(employee, record, status) {
    setError("");
    setAttendanceSaving({ employeeId: employee._id, status });
    try {
      let savedRecord;
      if (record) {
        const result = await api(`/attendance/${record._id}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status,
            checkIn: status === "Present" ? new Date().toTimeString().slice(0, 5) : undefined,
          }),
        });
        savedRecord = result.data;
      } else {
        const result = await api("/attendance", {
          method: "POST",
          body: JSON.stringify({
            employeeId: employee._id,
            date: todayKey,
            status,
            checkIn: status === "Present" ? new Date().toTimeString().slice(0, 5) : "",
          }),
        });
        savedRecord = result.data;
      }
      setNotice(`${employee.name} marked ${status.toLowerCase()}.`);
      setRecords((currentRecords) => record
        ? currentRecords.map((item) => item._id === record._id ? savedRecord : item)
        : [savedRecord, ...currentRecords]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAttendanceSaving(null);
    }
  }

  async function submitRecord(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    for (const [key, value] of Object.entries(payload)) {
      if (["salary", "bonus", "deductions", "rating"].includes(key) && value !== "") payload[key] = Number(value);
    }
    if (payload.job === "") delete payload.job;
    if (payload.interviewAt === "") payload.interviewAt = null;
    setSaving(true);
    setError("");
    try {
      await api(config.endpoint, { method: "POST", body: JSON.stringify(payload) });
      setModalOpen(false);
      setNotice(`${config.title} record created successfully.`);
      await loadRecords();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitJob(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    setError("");
    try {
      await api("/operations/jobs", { method: "POST", body: JSON.stringify(payload) });
      setJobModalOpen(false);
      setNotice("Job opening created.");
      const result = await api("/operations/jobs");
      setJobs(result.data || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateLeave(id, status) {
    setError("");
    try {
      await api(`/leaves/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setNotice(`Leave request ${status.toLowerCase()}.`);
      await loadRecords();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateRecord(path, payload, message) {
    setError("");
    try {
      await api(path, { method: "PATCH", body: JSON.stringify(payload) });
      setNotice(message);
      if (path.startsWith("/operations/jobs/")) {
        const result = await api("/operations/jobs");
        setJobs(result.data || []);
      }
      await loadRecords();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function cellValue(record, key) {
    if (key === "employee") {
      const employeeName = record.employee?.name || record.name || "—";
      const detail = record.employee?.department || record.department || record.position || "";
      return <div className="person-cell"><span className="avatar">{initials(employeeName)}</span><span><strong>{employeeName}</strong><small>{detail}</small></span></div>;
    }
    if (key === "job") return record.job?.title || "—";
    if (key === "interviewAt") return <InterviewCell record={record} onSave={(interviewAt) => updateRecord(`/operations/candidates/${record._id}/interview`, { interviewAt: interviewAt || null }, interviewAt ? "Interview scheduled." : "Interview removed.")} />;
    if (key === "notes") return <div className="candidate-notes-cell"><small>{record.notes || "No notes yet"}</small><button className="btn btn-sm btn-outline-secondary" onClick={() => { const notes = window.prompt("Recruiter notes", record.notes || ""); if (notes !== null) updateRecord(`/operations/candidates/${record._id}/notes`, { notes }, "Candidate notes saved."); }}>{record.notes ? "Edit" : "Add"}</button></div>;
    if (key === "actions" && moduleKey === "attendance") return record.checkOut ? "—" : <button className="btn btn-sm btn-outline-primary" onClick={() => updateRecord(`/attendance/${record._id}/checkout`, { checkOut: new Date().toTimeString().slice(0, 5) }, "Check-out recorded.")}>Check out</button>;
    if (key === "actions" && moduleKey === "payroll") return record.status === "Pending" ? <button className="btn btn-sm btn-outline-success" onClick={() => updateRecord(`/payroll/${record._id}/status`, { status: "Processed" }, "Payroll record processed.")}>Process</button> : "—";
    if (key === "actions" && moduleKey === "recruitment") return <select className="form-select form-select-sm stage-select" aria-label={`Update ${record.name} stage`} value={record.stage} onChange={(event) => updateRecord(`/candidates/${record._id}/stage`, { stage: event.target.value }, `${record.name} moved to ${event.target.value}.`)}>{["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"].map((stage) => <option key={stage}>{stage}</option>)}</select>;
    if (key === "actions") return record.status === "Pending" ? <div className="table-actions"><button className="btn btn-sm btn-outline-success" onClick={() => updateLeave(record._id, "Approved")}>Approve</button><button className="btn btn-sm btn-outline-danger" onClick={() => updateLeave(record._id, "Declined")}>Decline</button></div> : "—";
    if (key === "status" || key === "stage") return <StatusBadge>{record[key]}</StatusBadge>;
    if (["startDate", "endDate", "appliedAt", "date"].includes(key)) return displayDate(record[key]);
    if (["baseSalary", "bonus", "deductions", "netPay"].includes(key)) return record[key] == null ? "—" : `$${Number(record[key]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (key === "hoursWorked") return record[key] == null ? "—" : `${record[key]}h`;
    if (key === "days") return record.days ?? (record.startDate && record.endDate ? Math.max(1, Math.ceil((new Date(record.endDate) - new Date(record.startDate)) / 86400000) + 1) : "—");
    if (key === "rating") return record.rating == null ? "—" : `${record.rating} / 5`;
    return record[key] ?? "—";
  }

  return (
    <>
      <PageHeader eyebrow={config.eyebrow} title={config.title} subtitle={config.description} action={<button className="btn btn-primary page-action" onClick={() => setModalOpen(true)}>＋ {config.action}</button>} />
      {error && <div className="alert alert-danger alert-dismissible">{error}<button className="btn-close" aria-label="Dismiss error" onClick={() => setError("")} /></div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      <div className="module-summary">{config.summary.map((item) => <div className="summary-box" key={item.label}><span>{item.label}</span><strong>{counts[item.value]}</strong><small>{item.note}</small></div>)}</div>
      {moduleKey === "attendance" && <>
        <section className="attendance-overview">
          <div className="attendance-overview-copy"><span className="eyebrow">A CLEAR VIEW OF YOUR DAY</span><h2>Every check-in, in rhythm.</h2><p>Track team presence, review the weekly pattern, and update today’s attendance from one place.</p><div className="attendance-overview-stats"><span><strong>{counts.present}</strong> present today</span><span><strong>{counts.late}</strong> late today</span><span><strong>{counts.total}</strong> records</span></div></div>
          <img src="/attendance-hero.svg" alt="" />
        </section>
        <div className="module-chart-grid">
          <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Weekly attendance</h2><p>Present and absent records over the last 7 days</p></div></div><div className="module-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={attendanceWeek} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} /><Tooltip content={<AttendanceChartTooltip />} /><Bar dataKey="present" name="Present" fill="#34a987" radius={[5, 5, 0, 0]} maxBarSize={28} /><Bar dataKey="absent" name="Absent" fill="#e47791" radius={[5, 5, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer>{!records.length && <div className="module-chart-empty">Attendance trends will appear as records are added.</div>}</div></section>
          <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Today’s status mix</h2><p>Recorded attendance by status</p></div></div><div className="attendance-mix-layout"><div className="attendance-mix-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip content={<AttendanceChartTooltip />} /><Pie data={attendanceMix.length ? attendanceMix : [{ name: "No records", value: 1 }]} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{(attendanceMix.length ? attendanceMix : [{ name: "No records" }]).map((item) => <Cell key={item.name} fill={attendanceColors[item.name] || "#dfe2eb"} />)}</Pie></PieChart></ResponsiveContainer>{!attendanceMix.length && <div className="attendance-mix-empty">No records yet</div>}</div><div className="attendance-mix-legend">{Object.keys(attendanceColors).map((status) => <div key={status}><i style={{ background: attendanceColors[status] }} /><span>{status}</span><strong>{attendanceMix.find((item) => item.name === status)?.value || 0}</strong></div>)}</div></div></section>
        </div>
      </>}
      {moduleKey === "employees" && <section className="panel employee-directory-overview"><div className="employee-directory-art"><img src="/team-hero.svg" alt="" /></div><div className="employee-directory-chart"><div className="panel-heading"><div><h2>Your team, by department</h2><p>{employees.length} employees across {departmentCounts.length} departments</p></div></div><div className="module-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={departmentCounts} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="department" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} interval={0} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} /><Tooltip content={<AttendanceChartTooltip />} /><Bar dataKey="employees" name="Employees" radius={[5, 5, 0, 0]} maxBarSize={42}>{departmentCounts.map((item, index) => <Cell key={item.department} fill={departmentColors[index % departmentColors.length]} />)}</Bar></BarChart></ResponsiveContainer>{!departmentCounts.length && <div className="module-chart-empty">Add employees to see your team distribution.</div>}</div></div></section>}
      {moduleKey === "leave" && <>
        <section className="attendance-overview module-feature-overview leave-overview">
          <div className="attendance-overview-copy"><span className="eyebrow">TIME TO RECHARGE</span><h2>Time away, thoughtfully managed.</h2><p>Keep requests visible, understand your team’s time-off patterns, and make reviews easier.</p><div className="attendance-overview-stats"><span><strong>{counts.pending}</strong> awaiting review</span><span><strong>{counts.approved}</strong> approved</span><span><strong>{counts.total}</strong> requests</span></div></div>
          <img src="/leave-hero.svg" alt="" />
        </section>
        <div className="module-chart-grid">
          <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Requests by leave type</h2><p>Distribution across submitted requests</p></div></div><div className="module-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={leaveTypeCounts} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="type" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 10 }} /><Tooltip content={<AttendanceChartTooltip />} /><Bar dataKey="requests" name="Requests" radius={[5, 5, 0, 0]} maxBarSize={34}>{leaveTypeCounts.map((item, index) => <Cell key={item.type} fill={departmentColors[index % departmentColors.length]} />)}</Bar></BarChart></ResponsiveContainer>{!records.length && <div className="module-chart-empty">Leave request insights will appear as requests are submitted.</div>}</div></section>
          <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Request status</h2><p>Pending, approved, and declined requests</p></div></div><div className="attendance-mix-layout"><div className="attendance-mix-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip content={<AttendanceChartTooltip />} /><Pie data={leaveStatusMix.length ? leaveStatusMix : [{ name: "No requests", value: 1 }]} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{(leaveStatusMix.length ? leaveStatusMix : [{ name: "No requests" }]).map((item) => <Cell key={item.name} fill={leaveColors[item.name] || "#dfe2eb"} />)}</Pie></PieChart></ResponsiveContainer>{!leaveStatusMix.length && <div className="attendance-mix-empty">No requests yet</div>}</div><div className="attendance-mix-legend">{Object.keys(leaveColors).map((status) => <div key={status}><i style={{ background: leaveColors[status] }} /><span>{status}</span><strong>{leaveStatusMix.find((item) => item.name === status)?.value || 0}</strong></div>)}</div></div></section>
        </div>
      </>}
      {moduleKey === "payroll" && <>
        <section className="attendance-overview module-feature-overview payroll-overview">
          <div className="attendance-overview-copy"><span className="eyebrow">PEOPLE FIRST, EVERY PAYDAY</span><h2>Clear, consistent compensation.</h2><p>Review payroll activity at a glance and keep upcoming processing on track.</p><div className="attendance-overview-stats"><span><strong>{counts.processed}</strong> processed</span><span><strong>{counts.pending}</strong> pending</span><span><strong>{counts.total}</strong> records</span></div></div>
          <img src="/payroll-hero.svg" alt="" />
        </section>
        <div className="module-chart-grid">
          <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Net pay by period</h2><p>Combined employee net pay for the latest periods</p></div></div><div className="module-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={payrollByPeriod} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} tickFormatter={(value) => `$${Number(value).toLocaleString()}`} /><Tooltip content={<AttendanceChartTooltip />} /><Bar dataKey="netPay" name="Net pay ($)" fill="#6d5ce8" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer>{!records.length && <div className="module-chart-empty">Payroll trends will appear as records are created.</div>}</div></section>
          <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Processing status</h2><p>Processed and pending payroll records</p></div></div><div className="attendance-mix-layout"><div className="attendance-mix-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip content={<AttendanceChartTooltip />} /><Pie data={payrollStatusMix.length ? payrollStatusMix : [{ name: "No records", value: 1 }]} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{(payrollStatusMix.length ? payrollStatusMix : [{ name: "No records" }]).map((item) => <Cell key={item.name} fill={payrollColors[item.name] || "#dfe2eb"} />)}</Pie></PieChart></ResponsiveContainer>{!payrollStatusMix.length && <div className="attendance-mix-empty">No payroll records yet</div>}</div><div className="attendance-mix-legend">{Object.keys(payrollColors).map((status) => <div key={status}><i style={{ background: payrollColors[status] }} /><span>{status}</span><strong>{payrollStatusMix.find((item) => item.name === status)?.value || 0}</strong></div>)}</div></div></section>
        </div>
      </>}
      {moduleKey === "attendance" && <section className="panel attendance-roster">
        <div className="panel-heading"><div><h2>Today’s attendance</h2><p>Mark each employee present or absent.</p></div><span className="attendance-roster-count">{employeesLoading ? "Loading employees…" : `${attendanceEmployees.length} employees`}</span></div>
        <div className="attendance-roster-list">
          {!loading && !employeesLoading && attendanceEmployees.map((employee) => {
            const record = todayAttendance.get(employee._id);
            const status = record?.status || "Not marked";
            const isOnLeave = status === "On leave";
            return <div className="attendance-roster-row" key={employee._id}>
              <div className="attendance-roster-person"><span className="avatar">{initials(employee.name)}</span><span><strong>{employee.name}</strong><small>{employee.department}</small></span></div>
              <div className="attendance-roster-action"><StatusBadge>{status}</StatusBadge><div className="attendance-mark-actions">
                {["Present", "Absent"].map((nextStatus) => {
                  const isSelected = nextStatus === "Present" ? ["Present", "Late"].includes(status) : status === "Absent";
                  return <button
                    key={nextStatus}
                    type="button"
                    className={`attendance-mark-button ${nextStatus === "Present" ? "mark-present" : "mark-absent"} ${isSelected ? "is-selected" : ""}`}
                    aria-label={`Mark ${employee.name} ${nextStatus.toLowerCase()}`}
                    aria-pressed={isSelected}
                    title={`Mark ${employee.name} ${nextStatus.toLowerCase()}`}
                    disabled={isOnLeave || attendanceSaving?.employeeId === employee._id || isSelected}
                    onClick={() => setAttendanceStatus(employee, record, nextStatus)}
                  >{attendanceSaving?.employeeId === employee._id && attendanceSaving.status === nextStatus ? <span className="attendance-mark-spinner" /> : nextStatus === "Present" ? "✓" : "×"}</button>;
                })}
              </div></div>
            </div>;
          })}
          {!loading && !employeesLoading && attendanceEmployees.length === 0 && <p className="empty-state">{query ? "No employees match your search." : "No active employees to mark."}</p>}
          {(loading || employeesLoading) && <p className="empty-state">Loading attendance…</p>}
        </div>
      </section>}
      {moduleKey === "recruitment" && <section className="panel job-openings-panel"><div className="panel-heading"><div><h2>Job openings</h2><p>{jobs.length} roles in the recruitment workspace</p></div><button className="btn btn-sm btn-outline-primary" onClick={() => setJobModalOpen(true)}>＋ Add opening</button></div><div className="job-opening-list">{jobs.map((job) => <article key={job._id}><div><strong>{job.title}</strong><small>{job.department}{job.location ? ` · ${job.location}` : ""} · {job.employmentType}</small>{job.description && <p>{job.description}</p>}</div><div className="table-actions"><StatusBadge>{job.status}</StatusBadge><button className="btn btn-sm btn-outline-secondary" onClick={() => updateRecord(`/operations/jobs/${job._id}/status`, { status: job.status === "Open" ? "Closed" : "Open" }, `Job marked ${job.status === "Open" ? "closed" : "open"}.`)}>{job.status === "Open" ? "Close" : "Reopen"}</button></div></article>)}{!jobs.length && <p className="empty-state">Create a job opening to connect candidates to a role.</p>}</div></section>}
      <section className="panel module-panel">
        <div className="panel-heading module-toolbar"><div><h2>{moduleKey === "employees" ? "All employees" : config.title}</h2><p>{loading ? "Loading records…" : `${filtered.length} ${filtered.length === 1 ? "record" : "records"} found`}</p></div><div className="toolbar-actions"><input className="form-control form-control-sm table-search" type="search" placeholder={`Search ${config.title.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={`Search ${config.title}`} /><button className="btn btn-sm btn-outline-secondary" onClick={loadRecords} disabled={loading}>↻ Refresh</button></div></div>
        <div className="table-responsive"><table className="table align-middle data-table"><thead><tr>{config.columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>
          {!loading && filtered.map((record) => <tr key={record._id}>{config.columns.map(([key]) => <td key={key}>{cellValue(record, key)}</td>)}</tr>)}
          {!loading && filtered.length === 0 && <tr><td className="empty-state" colSpan={config.columns.length}>{query ? "No records match your search." : "No records yet. Use the button above to add the first one."}</td></tr>}
          {loading && <tr><td className="empty-state" colSpan={config.columns.length}>Loading records…</td></tr>}
        </tbody></table></div>
      </section>
      {modalOpen && <div className="modal-backdrop-custom" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
          <div className="panel-heading"><div><h2 id="record-modal-title">{config.action}</h2><p>Enter the details below to save this record.</p></div><button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Close">×</button></div>
          <form onSubmit={submitRecord}><div className="modal-form-grid">{config.fields.map(([name, label, type, required, options]) => <div className={`form-field ${type === "textarea" ? "form-field-wide" : ""}`} key={name}><label htmlFor={`field-${name}`}>{label}{required && <span className="required-mark"> *</span>}</label>{type === "select" ? <select className="form-select" id={`field-${name}`} name={name} required={required}>{options.map((option) => <option key={option}>{option}</option>)}</select> : type === "employee" ? <select className="form-select" id={`field-${name}`} name={name} required={required} defaultValue=""><option value="" disabled>Select an employee</option>{employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.name} · {employee.department}</option>)}</select> : type === "job" ? <select className="form-select" id={`field-${name}`} name={name} defaultValue=""><option value="">Unlinked candidate</option>{jobs.filter((job) => job.status === "Open").map((job) => <option key={job._id} value={job._id}>{job.title} · {job.department}</option>)}</select> : type === "textarea" ? <textarea className="form-control" id={`field-${name}`} name={name} maxLength="3000" rows="3" /> : <input className="form-control" id={`field-${name}`} name={name} type={type} required={required} min={type === "number" && name === "rating" ? 1 : undefined} max={name === "rating" ? 5 : undefined} step={type === "number" ? "0.01" : undefined} />}</div>)}</div>
            <div className="modal-actions"><button type="button" className="btn btn-light" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save record"}</button></div>
          </form>
        </section>
      </div>}
      {jobModalOpen && <div className="modal-backdrop-custom" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setJobModalOpen(false); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="job-modal-title"><div className="panel-heading"><div><h2 id="job-modal-title">Add job opening</h2><p>Create a role for your candidate pipeline.</p></div><button className="modal-close" onClick={() => setJobModalOpen(false)} aria-label="Close">×</button></div><form onSubmit={submitJob}><div className="modal-form-grid"><div className="form-field"><label htmlFor="job-title">Job title *</label><input className="form-control" id="job-title" name="title" required maxLength="120" /></div><div className="form-field"><label htmlFor="job-department">Department *</label><input className="form-control" id="job-department" name="department" required maxLength="100" /></div><div className="form-field"><label htmlFor="job-location">Location</label><input className="form-control" id="job-location" name="location" maxLength="120" /></div><div className="form-field"><label htmlFor="job-type">Employment type</label><select className="form-select" id="job-type" name="employmentType"><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></div><div className="form-field form-field-wide"><label htmlFor="job-description">Description</label><textarea className="form-control" id="job-description" name="description" rows="3" maxLength="3000" /></div></div><div className="modal-actions"><button type="button" className="btn btn-light" onClick={() => setJobModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Create opening"}</button></div></form></section></div>}
    </>
  );
}
