import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import StatusBadge from "../components/StatusBadge.jsx";
import SupportChatbot from "../components/SupportChatbot.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import ProfileAvatar from "../components/ProfileAvatar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

const personalAttendanceColors = { Present: "#34a987", Late: "#f0a94a", Absent: "#e47791", "On leave": "#5485df" };
const personalLeaveColors = { Pending: "#f0a94a", Approved: "#34a987", Declined: "#e47791" };
const personalPayrollColors = { Processed: "#34a987", Pending: "#f0a94a" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatPeriod(value) {
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export default function EmployeePortal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [welcomeRotation, setWelcomeRotation] = useState({ x: 0, y: 0 });

  const loadPortal = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [portal, noticeResult] = await Promise.all([
        api("/employee-portal"),
        api("/operations/notifications"),
      ]);
      setData({ ...portal, notifications: noticeResult.data || [] });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPortal(); }, [loadPortal]);

  async function handleCheckIn() {
    setSaving(true);
    setError("");
    try {
      await api("/employee-portal/attendance/check-in", { method: "POST", body: JSON.stringify({}) });
      setNotice("You are checked in. Have a great day!");
      await loadPortal();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckOut() {
    if (!data?.todayAttendance?._id) return;
    setSaving(true);
    setError("");
    try {
      await api(`/employee-portal/attendance/${data.todayAttendance._id}/checkout`, { method: "PATCH", body: JSON.stringify({}) });
      setNotice("Your check-out time has been recorded.");
      await loadPortal();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitLeave(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    setSaving(true);
    setError("");
    try {
      await api("/employee-portal/leaves", { method: "POST", body: JSON.stringify(payload) });
      setLeaveOpen(false);
      setNotice("Your leave request has been submitted to HR.");
      await loadPortal();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitProfileChange(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...formData.entries()].filter(([, value]) => value !== ""));
    setSaving(true);
    setError("");
    try {
      await api("/employee-portal/profile-changes", { method: "POST", body: JSON.stringify(payload) });
      setProfileOpen(false);
      setNotice("Your profile update is awaiting HR review.");
      await loadPortal();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function markNotificationRead(notification) {
    try {
      await api(`/operations/notifications/${notification._id}/read`, { method: "PATCH", body: JSON.stringify({}) });
      setData((current) => ({ ...current, notifications: current.notifications.map((item) => item._id === notification._id ? { ...item, readAt: new Date().toISOString() } : item) }));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function printPayslip(item) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Allow pop-ups to open the payslip for printing.");
      return;
    }
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
    printWindow.document.write(`<!doctype html><html><head><title>Payslip ${escapeHtml(item.period)}</title><style>body{font:16px Arial,sans-serif;color:#172033;max-width:680px;margin:50px auto;padding:24px}h1{color:#5548bf}table{border-collapse:collapse;width:100%;margin-top:24px}td{border-bottom:1px solid #ddd;padding:12px}td:last-child{text-align:right;font-weight:bold}.foot{color:#687187;margin-top:30px;font-size:13px}@media print{body{margin:0}}</style></head><body><h1>PeopleDesk payslip</h1><p>${escapeHtml(employee?.name)} · ${escapeHtml(employee?.jobTitle)} · ${escapeHtml(employee?.department)}</p><p>Pay period: <strong>${escapeHtml(item.period)}</strong> · Status: ${escapeHtml(item.status)}</p><table><tr><td>Base salary</td><td>${escapeHtml(money(item.baseSalary))}</td></tr><tr><td>Bonus</td><td>${escapeHtml(money(item.bonus))}</td></tr><tr><td>Deductions</td><td>−${escapeHtml(money(item.deductions))}</td></tr><tr><td>Net pay</td><td>${escapeHtml(money(item.netPay))}</td></tr></table><p class="foot">This statement is private. Contact HR if you have questions about this payroll record.</p><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  }

  function money(amount) {
    return `$${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  async function signOut() {
    let logoutWarning = "";
    try {
      await logout();
    } catch {
      logoutWarning = "This device has signed out, but the server could not revoke the session. It expires automatically.";
    }
    navigate("/employee-login", { replace: true, state: { logoutWarning } });
  }

  const employee = data?.employee;
  const attendance = data?.todayAttendance;
  const recentAttendance = [...(data?.attendance || [])].slice(0, 7).reverse().map((item) => ({
    day: new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    hours: Number(item.hoursWorked || 0),
    status: item.status || "Present",
  }));
  const personalAttendanceMix = Object.entries(personalAttendanceColors).map(([name, color]) => ({
    name,
    color,
    value: recentAttendance.filter((item) => item.status === name).length,
  })).filter((item) => item.value > 0);
  const leaveBalances = data?.leaveBalances || [];
  const personalLeaveRequests = data?.leaves || [];
  const personalLeaveStatusMix = Object.entries(personalLeaveColors).map(([name, color]) => ({
    name,
    color,
    value: personalLeaveRequests.filter((item) => item.status === name).length,
  })).filter((item) => item.value > 0);
  const personalPayroll = [...(data?.payroll || [])]
    .sort((first, second) => first.period.localeCompare(second.period))
    .map((item) => ({ period: formatPeriod(item.period), netPay: Number(item.netPay || 0) }));
  const personalPayrollStatusMix = Object.entries(personalPayrollColors).map(([name, color]) => ({
    name,
    color,
    value: (data?.payroll || []).filter((item) => item.status === name).length,
  })).filter((item) => item.value > 0);
  const hasCheckedIn = Boolean(attendance);
  const hasCheckedOut = Boolean(attendance?.checkOut);

  function moveWelcomeVisual(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    setWelcomeRotation({ x: -y * 12, y: x * 16 });
  }

  return (
    <main className="employee-portal">
      <header className="employee-topbar">
        <Link className="brand employee-brand" to="/employee"><span className="brand-mark">P</span><span className="brand-name">PeopleDesk<small>EMPLOYEE PORTAL</small></span></Link>
        <div className="employee-user"><ThemeToggle /><ProfileAvatar name={user?.name || "Employee"} /><span className="employee-user-name"><strong>{user?.name}</strong><small>Employee</small></span><button className="btn btn-sm btn-outline-primary employee-support-button" onClick={() => setChatOpen(true)}>Contact support</button><button className="btn btn-sm btn-outline-secondary" onClick={signOut}>Sign out</button></div>
      </header>
      <div className="employee-content">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <section className="employee-welcome">
          <div className="employee-welcome-copy"><div className="eyebrow">YOUR EMPLOYEE WORKSPACE</div><h1>Welcome, {employee?.name?.split(" ")[0] || user?.name?.split(" ")[0] || "there"}.</h1><p>Here are your personal work details and updates.</p><span className="employee-welcome-date">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span></div>
          <div className="employee-welcome-visual" onPointerMove={moveWelcomeVisual} onPointerLeave={() => setWelcomeRotation({ x: 0, y: 0 })} style={{ "--tilt-x": `${welcomeRotation.x}deg`, "--tilt-y": `${welcomeRotation.y}deg` }}>
            <img src="/people-hero.svg" alt="" />
            <span className="employee-welcome-chip"><i /> Your workday, in sync</span>
          </div>
        </section>
        {data?.notifications?.length > 0 && <section className="panel employee-notifications"><div className="panel-heading"><div><h2>Notifications</h2><p>Updates about your requests and payroll</p></div></div><div className="operations-list">{data.notifications.slice(0, 5).map((item) => <article className={`operation-notification ${item.readAt ? "" : "unread"}`} key={item._id}><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>{!item.readAt && <button className="btn btn-sm btn-outline-primary" onClick={() => markNotificationRead(item)}>Mark read</button>}</article>)}</div></section>}
        {loading && !data ? <div className="panel employee-loading"><span className="spinner-border spinner-border-sm text-primary" /> Loading your personal workspace…</div> : null}
        {data && <>
          <section className="employee-summary-grid">
            <div className="panel employee-info-card"><span className="employee-info-icon purple">♙</span><span><small>Department</small><strong>{employee.department}</strong></span></div>
            <div className="panel employee-info-card"><span className="employee-info-icon green">✳</span><span><small>Job title</small><strong>{employee.jobTitle}</strong></span></div>
            <div className="panel employee-info-card"><span className="employee-info-icon blue">▣</span><span><small>Employment type</small><strong>{employee.employmentType}</strong></span></div>
            <div className="panel employee-info-card"><span className="employee-info-icon orange">◷</span><span><small>Hire date</small><strong>{formatDate(employee.hireDate)}</strong></span></div>
          </section>
          <section className="panel employee-profile-panel">
            <div className="panel-heading employee-profile-heading"><div className="employee-profile-identity"><ProfileAvatar name={employee.name || user?.name || "Employee"} size="profile" /><div><h2>{employee.name}</h2><p>{employee.email} · {employee.phone || "No phone number"}</p></div></div><button className="btn btn-sm btn-outline-primary" onClick={() => setProfileOpen(true)}>Request an update</button></div>
            {data.profileChanges?.map((change) => <div className="employee-profile-change" key={change._id}><span>Requested {Object.entries(change.changes).map(([field, value]) => `${field}: ${value || "(empty)"}`).join(" · ")}</span><StatusBadge>{change.status}</StatusBadge></div>)}
          </section>
          <section className="panel employee-leave-balances">
            <div className="panel-heading"><div><h2>My leave balance</h2><p>Approved calendar days used this year</p></div></div>
            <div className="leave-balance-cards">{leaveBalances.map((balance) => <div key={balance.type}><small>{balance.type}</small><strong>{balance.remaining}</strong><span>of {balance.entitlement} days · {balance.used} used</span></div>)}</div>
          </section>
          <section className="attendance-overview module-feature-overview employee-feature-overview leave-overview">
            <div className="attendance-overview-copy"><span className="eyebrow">YOUR TIME, YOUR BALANCE</span><h2>Make room for what matters.</h2><p>See how your leave days are being used and keep your requests easy to track.</p><div className="attendance-overview-stats"><span><strong>{personalLeaveRequests.length}</strong> recent requests</span><span><strong>{leaveBalances.reduce((total, balance) => total + Number(balance.remaining || 0), 0)}</strong> days remaining</span></div></div>
            <img src="/leave-hero.svg" alt="" />
          </section>
          <div className="module-chart-grid employee-finance-insights">
            <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Leave balance by type</h2><p>Used and remaining days this year</p></div></div><div className="module-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={leaveBalances} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="type" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><Tooltip contentStyle={{ background: "var(--panel)", borderColor: "var(--border)", borderRadius: 9, color: "var(--text)", fontSize: 10 }} /><Bar dataKey="used" name="Used days" stackId="days" fill="#6d5ce8" radius={[0, 0, 0, 0]} maxBarSize={30} /><Bar dataKey="remaining" name="Remaining days" stackId="days" fill="#70cbb0" radius={[5, 5, 0, 0]} maxBarSize={30} /></BarChart></ResponsiveContainer>{!leaveBalances.length && <div className="module-chart-empty">Your leave balances will appear here.</div>}</div></section>
            <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>My request status</h2><p>Recent leave requests by status</p></div></div><div className="attendance-mix-layout"><div className="attendance-mix-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={{ background: "var(--panel)", borderColor: "var(--border)", borderRadius: 9, color: "var(--text)", fontSize: 10 }} /><Pie data={personalLeaveStatusMix.length ? personalLeaveStatusMix : [{ name: "No requests", value: 1 }]} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{(personalLeaveStatusMix.length ? personalLeaveStatusMix : [{ name: "No requests", color: "#dfe2eb" }]).map((item) => <Cell key={item.name} fill={item.color} />)}</Pie></PieChart></ResponsiveContainer>{!personalLeaveStatusMix.length && <div className="attendance-mix-empty">No requests yet</div>}</div><div className="attendance-mix-legend">{Object.entries(personalLeaveColors).map(([status, color]) => <div key={status}><i style={{ background: color }} /><span>{status}</span><strong>{personalLeaveStatusMix.find((item) => item.name === status)?.value || 0}</strong></div>)}</div></div></section>
          </div>
          <section className="panel employee-attendance">
            <div><div className="eyebrow">TODAY’S ATTENDANCE</div><h2>{hasCheckedOut ? "Day complete" : hasCheckedIn ? "You’re checked in" : "Ready to start your day?"}</h2><p>{hasCheckedIn ? `Check-in: ${attendance.checkIn}${hasCheckedOut ? ` · Check-out: ${attendance.checkOut}` : ""}` : "Record your arrival to get your workday started."}</p></div>
            {!hasCheckedIn ? <button className="btn btn-primary" onClick={handleCheckIn} disabled={saving}>{saving ? "Recording…" : "Check in"}</button> : !hasCheckedOut ? <button className="btn btn-outline-primary" onClick={handleCheckOut} disabled={saving}>{saving ? "Recording…" : "Check out"}</button> : <StatusBadge>{attendance.status}</StatusBadge>}
          </section>
          <section className="employee-attendance-insights">
            <div className="employee-attendance-chart panel"><div className="panel-heading"><div><h2>My attendance trends</h2><p>Hours recorded across your latest 7 workdays</p></div><img src="/attendance-hero.svg" alt="" /></div><div className="employee-personal-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={recentAttendance} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><Tooltip contentStyle={{ background: "var(--panel)", borderColor: "var(--border)", borderRadius: 9, color: "var(--text)", fontSize: 10 }} /><Bar dataKey="hours" name="Hours worked" fill="#6d5ce8" radius={[5, 5, 0, 0]} maxBarSize={32} /></BarChart></ResponsiveContainer>{!recentAttendance.length && <div className="module-chart-empty">Your attendance chart will appear after your first check-in.</div>}</div></div>
            <div className="employee-attendance-chart panel"><div className="panel-heading"><div><h2>Recent status</h2><p>Attendance mix for your latest records</p></div></div><div className="employee-status-chart-layout"><div className="employee-status-chart-canvas"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={{ background: "var(--panel)", borderColor: "var(--border)", borderRadius: 9, color: "var(--text)", fontSize: 10 }} /><Pie data={personalAttendanceMix.length ? personalAttendanceMix : [{ name: "No records", value: 1 }]} dataKey="value" nameKey="name" innerRadius="57%" outerRadius="82%" paddingAngle={3} stroke="none">{(personalAttendanceMix.length ? personalAttendanceMix : [{ name: "No records", color: "#dfe2eb" }]).map((item) => <Cell key={item.name} fill={item.color} />)}</Pie></PieChart></ResponsiveContainer>{!personalAttendanceMix.length && <div className="attendance-mix-empty">No records yet</div>}</div><div className="attendance-mix-legend">{Object.entries(personalAttendanceColors).map(([status, color]) => <div key={status}><i style={{ background: color }} /><span>{status}</span><strong>{personalAttendanceMix.find((item) => item.name === status)?.value || 0}</strong></div>)}</div></div></div>
          </section>
          <section className="attendance-overview module-feature-overview employee-feature-overview payroll-overview">
            <div className="attendance-overview-copy"><span className="eyebrow">YOUR COMPENSATION</span><h2>Your pay, clearly in view.</h2><p>Follow your net pay history and stay up to date on payroll processing.</p><div className="attendance-overview-stats"><span><strong>{data.payroll.length}</strong> recent pay records</span><span><strong>{personalPayrollStatusMix.find((item) => item.name === "Processed")?.value || 0}</strong> processed</span></div></div>
            <img src="/payroll-hero.svg" alt="" />
          </section>
          <div className="module-chart-grid employee-finance-insights">
            <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>My net pay history</h2><p>Recent payroll periods</p></div></div><div className="module-chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={personalPayroll} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 9 }} tickFormatter={(value) => `$${Number(value).toLocaleString()}`} /><Tooltip formatter={(value) => money(value)} contentStyle={{ background: "var(--panel)", borderColor: "var(--border)", borderRadius: 9, color: "var(--text)", fontSize: 10 }} /><Bar dataKey="netPay" name="Net pay" fill="#6d5ce8" radius={[5, 5, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer>{!personalPayroll.length && <div className="module-chart-empty">Your pay history will appear here.</div>}</div></section>
            <section className="panel module-chart-panel"><div className="panel-heading"><div><h2>Payroll status</h2><p>Recent records by processing status</p></div></div><div className="attendance-mix-layout"><div className="attendance-mix-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={{ background: "var(--panel)", borderColor: "var(--border)", borderRadius: 9, color: "var(--text)", fontSize: 10 }} /><Pie data={personalPayrollStatusMix.length ? personalPayrollStatusMix : [{ name: "No records", value: 1 }]} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{(personalPayrollStatusMix.length ? personalPayrollStatusMix : [{ name: "No records", color: "#dfe2eb" }]).map((item) => <Cell key={item.name} fill={item.color} />)}</Pie></PieChart></ResponsiveContainer>{!personalPayrollStatusMix.length && <div className="attendance-mix-empty">No payroll records yet</div>}</div><div className="attendance-mix-legend">{Object.entries(personalPayrollColors).map(([status, color]) => <div key={status}><i style={{ background: color }} /><span>{status}</span><strong>{personalPayrollStatusMix.find((item) => item.name === status)?.value || 0}</strong></div>)}</div></div></section>
          </div>
          <div className="employee-data-grid">
            <section className="panel">
              <div className="panel-heading"><div><h2>My leave requests</h2><p>Your submitted requests and their status</p></div><button className="btn btn-sm btn-primary" onClick={() => setLeaveOpen(true)}>＋ Request leave</button></div>
              <div className="table-responsive"><table className="table align-middle data-table"><thead><tr><th>Type</th><th>Dates</th><th>Status</th></tr></thead><tbody>
                {data.leaves.map((item) => <tr key={item._id}><td>{item.type}</td><td>{formatDate(item.startDate)} – {formatDate(item.endDate)}</td><td><StatusBadge>{item.status}</StatusBadge></td></tr>)}
                {!data.leaves.length && <tr><td className="empty-state" colSpan="3">No leave requests yet.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="panel">
              <div className="panel-heading"><div><h2>My pay records</h2><p>Your personal payroll history</p></div></div>
              <div className="table-responsive"><table className="table align-middle data-table"><thead><tr><th>Period</th><th>Net pay</th><th>Status</th><th>Payslip</th></tr></thead><tbody>
                {data.payroll.map((item) => <tr key={item._id}><td>{item.period}</td><td>{money(item.netPay)}</td><td><StatusBadge>{item.status}</StatusBadge></td><td><button className="btn btn-sm btn-outline-primary" onClick={() => printPayslip(item)}>Print</button></td></tr>)}
                {!data.payroll.length && <tr><td className="empty-state" colSpan="4">Your pay records will appear here.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="panel">
              <div className="panel-heading"><div><h2>My attendance</h2><p>Your recent check-in history</p></div></div>
              <div className="table-responsive"><table className="table align-middle data-table"><thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Hours</th></tr></thead><tbody>
                {data.attendance.map((item) => <tr key={item._id}><td>{formatDate(item.date)}</td><td>{item.checkIn}</td><td>{item.checkOut || "—"}</td><td>{item.hoursWorked ? `${item.hoursWorked}h` : "—"}</td></tr>)}
                {!data.attendance.length && <tr><td className="empty-state" colSpan="4">No attendance records yet.</td></tr>}
              </tbody></table></div>
            </section>
            <section className="panel">
              <div className="panel-heading"><div><h2>My performance reviews</h2><p>Private feedback shared with you</p></div></div>
              <div className="recent-list">{data.reviews.map((item) => <article className="employee-review" key={item._id}><div><strong>{item.period}</strong><small>Reviewer: {item.reviewer} · {item.rating ? `${item.rating} / 5` : item.status}</small></div><StatusBadge>{item.status}</StatusBadge>{item.feedback && <p>{item.feedback}</p>}</article>)}{!data.reviews.length && <p className="empty-state">Your performance reviews will appear here.</p>}</div>
            </section>
          </div>
        </>}
      </div>
      {leaveOpen && <div className="modal-backdrop-custom" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLeaveOpen(false); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="employee-leave-title">
        <div className="panel-heading"><div><h2 id="employee-leave-title">Request leave</h2><p>HR will review your request.</p></div><button className="modal-close" onClick={() => setLeaveOpen(false)} aria-label="Close">×</button></div>
        <form onSubmit={submitLeave}><div className="modal-form-grid">
          <div className="form-field"><label htmlFor="leave-type">Leave type</label><select className="form-select" id="leave-type" name="type" required><option>Annual</option><option>Sick</option><option>Personal</option><option>Parental</option><option>Unpaid</option></select></div>
          <div className="form-field"><label htmlFor="leave-start">Start date</label><input className="form-control" id="leave-start" name="startDate" type="date" required /></div>
          <div className="form-field"><label htmlFor="leave-end">End date</label><input className="form-control" id="leave-end" name="endDate" type="date" required /></div>
          <div className="form-field form-field-wide"><label htmlFor="leave-reason">Reason (optional)</label><textarea className="form-control" id="leave-reason" name="reason" maxLength="1000" rows="3" /></div>
        </div><div className="modal-actions"><button type="button" className="btn btn-light" onClick={() => setLeaveOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Submitting…" : "Submit request"}</button></div></form>
      </section></div>}
      {profileOpen && <div className="modal-backdrop-custom" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="employee-profile-title">
        <div className="panel-heading"><div><h2 id="employee-profile-title">Request a profile update</h2><p>HR will review changes to your contact details.</p></div><button className="modal-close" onClick={() => setProfileOpen(false)} aria-label="Close">×</button></div>
        <form onSubmit={submitProfileChange}><div className="modal-form-grid"><div className="form-field"><label htmlFor="profile-email">Email address</label><input className="form-control" id="profile-email" name="email" type="email" defaultValue={employee?.email} /></div><div className="form-field"><label htmlFor="profile-phone">Phone number</label><input className="form-control" id="profile-phone" name="phone" type="tel" defaultValue={employee?.phone || ""} maxLength="30" /></div></div><div className="modal-actions"><button type="button" className="btn btn-light" onClick={() => setProfileOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Submitting…" : "Submit for review"}</button></div></form>
      </section></div>}
      <SupportChatbot open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} />
    </main>
  );
}
