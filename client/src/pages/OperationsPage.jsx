import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api, download } from "../lib/api.js";

const leaveTypes = ["Annual", "Sick", "Personal", "Parental"];

function dateLabel(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  return params.toString();
}

export default function OperationsPage() {
  const thisYear = String(new Date().getFullYear());
  const [notifications, setNotifications] = useState([]);
  const [balances, setBalances] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [profileRequests, setProfileRequests] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [report, setReport] = useState([]);
  const [reportModule, setReportModule] = useState("attendance");
  const [filters, setFilters] = useState({ year: thisYear, startDate: "", endDate: "", department: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filterQuery = queryString(filters);
      const [notificationsResult, balancesResult, calendarResult, profilesResult, logsResult, employeeResult] = await Promise.all([
        api("/operations/notifications"),
        api(`/operations/leave-balances?year=${encodeURIComponent(filters.year)}`),
        api(`/operations/leave-calendar?${filterQuery}`),
        api("/operations/profile-changes"),
        api(`/operations/audit-logs?${queryString({ startDate: filters.startDate, endDate: filters.endDate })}`),
        api("/employees"),
      ]);
      setNotifications(notificationsResult.data || []);
      setBalances(balancesResult.data || []);
      setCalendar(calendarResult.data || []);
      setProfileRequests(profilesResult.data || []);
      setAuditLogs(logsResult.data || []);
      setEmployees(employeeResult.data || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadReport = useCallback(async () => {
    setError("");
    try {
      const params = queryString({ module: reportModule, startDate: filters.startDate, endDate: filters.endDate, department: filters.department });
      const result = await api(`/operations/reports?${params}`);
      setReport(result.data || []);
    } catch (requestError) {
      setError(requestError.message);
      setReport([]);
    }
  }, [filters.department, filters.endDate, filters.startDate, reportModule]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { loadReport(); }, [loadReport]);

  async function markRead(item) {
    try {
      await api(`/operations/notifications/${item._id}/read`, { method: "PATCH", body: JSON.stringify({}) });
      setNotifications((current) => current.map((noticeItem) => noticeItem._id === item._id ? { ...noticeItem, readAt: new Date().toISOString() } : noticeItem));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function reviewProfile(request, status) {
    setError("");
    try {
      await api(`/operations/profile-changes/${request._id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setNotice(`Profile update ${status.toLowerCase()}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function saveBalance(employeeId, type, value) {
    const entitlement = Number(value);
    if (!Number.isInteger(entitlement) || entitlement < 0 || entitlement > 366) {
      setError("Leave allowance must be a whole number from 0 to 366.");
      return;
    }
    setError("");
    try {
      await api(`/operations/leave-balances/${employeeId}/${type}`, {
        method: "PUT",
        body: JSON.stringify({ year: Number(filters.year), entitlement }),
      });
      setNotice(`${type} allowance updated.`);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function exportReport() {
    try {
      const params = queryString({ module: reportModule, startDate: filters.startDate, endDate: filters.endDate, department: filters.department });
      await download(`/operations/reports/export?${params}`, `peopledesk-${reportModule}-report.csv`);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const departments = useMemo(() => [...new Set(employees.map((employee) => employee.department))].sort(), [employees]);
  const pendingProfiles = profileRequests.filter((request) => request.status === "Pending");

  return (
    <>
      <PageHeader eyebrow="HR OPERATIONS" title="Operations & reports" subtitle="Review requests, manage leave allowances, follow the team calendar, and export filtered reports." action={<button className="btn btn-outline-secondary page-action" onClick={refresh} disabled={loading}>↻ Refresh</button>} />
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <section className="operations-filter panel">
        <div className="panel-heading"><div><h2>Shared filters</h2><p>Apply date and department filters to the calendar and reports.</p></div></div>
        <div className="operations-filter-grid">
          <label>From<input className="form-control form-control-sm" type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></label>
          <label>To<input className="form-control form-control-sm" type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></label>
          <label>Department<select className="form-select form-select-sm" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
          <label>Leave year<input className="form-control form-control-sm" type="number" min="2000" max="2200" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })} /></label>
        </div>
      </section>

      <div className="operations-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Notifications</h2><p>Updates for your HR account</p></div><span className="status-badge blue">{notifications.filter((item) => !item.readAt).length} unread</span></div>
          <div className="operations-list">
            {notifications.map((item) => <article className={`operation-notification ${item.readAt ? "" : "unread"}`} key={item._id}><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>{!item.readAt && <button className="btn btn-sm btn-outline-primary" onClick={() => markRead(item)}>Mark read</button>}</article>)}
            {!notifications.length && <p className="empty-state">No notifications yet.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Profile update requests</h2><p>Employee changes require HR approval</p></div><span className="status-badge orange">{pendingProfiles.length} pending</span></div>
          <div className="operations-list">
            {profileRequests.map((item) => <article className="operation-request" key={item._id}><div className="operation-request-top"><strong>{item.employee?.name || "Employee"}</strong><StatusBadge>{item.status}</StatusBadge></div><p>{Object.entries(item.changes || {}).map(([key, value]) => `${key}: ${value || "(empty)"}`).join(" · ")}</p><small>{dateLabel(item.createdAt)}</small>{item.status === "Pending" && <div className="table-actions"><button className="btn btn-sm btn-outline-success" onClick={() => reviewProfile(item, "Approved")}>Approve</button><button className="btn btn-sm btn-outline-danger" onClick={() => reviewProfile(item, "Declined")}>Decline</button></div>}</article>)}
            {!profileRequests.length && <p className="empty-state">No profile update requests.</p>}
          </div>
        </section>

        <section className="panel operations-wide">
          <div className="panel-heading"><div><h2>Leave calendar</h2><p>Approved time away {filters.department ? `· ${filters.department}` : "· all departments"}</p></div></div>
          <div className="table-responsive"><table className="table align-middle data-table"><thead><tr><th>Employee</th><th>Department</th><th>Leave type</th><th>From</th><th>To</th></tr></thead><tbody>
            {calendar.map((item) => <tr key={item._id}><td>{item.employee?.name || "—"}</td><td>{item.employee?.department || "—"}</td><td>{item.type}</td><td>{dateLabel(item.startDate)}</td><td>{dateLabel(item.endDate)}</td></tr>)}
            {!calendar.length && <tr><td className="empty-state" colSpan="5">No approved leave in this date range.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="panel operations-wide">
          <div className="panel-heading"><div><h2>Leave balances · {filters.year}</h2><p>Edit annual, sick, personal, and parental allowances. Usage counts approved calendar days.</p></div></div>
          <div className="table-responsive"><table className="table align-middle data-table"><thead><tr><th>Employee</th><th>Department</th><th>Leave type</th><th>Allowance</th><th>Used</th><th>Remaining</th><th /></tr></thead><tbody>
            {balances.flatMap(({ employee, balances: items }) => items.map((item) => <BalanceRow key={`${employee._id}-${item.type}`} employee={employee} item={item} onSave={saveBalance} />))}
            {!balances.length && <tr><td className="empty-state" colSpan="7">{loading ? "Loading balances…" : "No employees found."}</td></tr>}
          </tbody></table></div>
        </section>

        <section className="panel operations-wide">
          <div className="panel-heading"><div><h2>Filtered reports</h2><p>{report.length} records · up to 1,000 per export</p></div><button className="btn btn-sm btn-primary" onClick={exportReport}>Export CSV</button></div>
          <div className="report-controls"><label>Report type<select className="form-select form-select-sm" value={reportModule} onChange={(event) => setReportModule(event.target.value)}><option value="attendance">Attendance</option><option value="leaves">Leave</option><option value="payroll">Payroll</option><option value="employees">Employees</option></select></label><button className="btn btn-sm btn-outline-secondary" onClick={loadReport}>Apply filters</button></div>
          <div className="table-responsive"><ReportTable module={reportModule} records={report} /></div>
        </section>

        <section className="panel operations-wide">
          <div className="panel-heading"><div><h2>Audit history</h2><p>Recent successful changes by signed-in users (latest 200)</p></div><span className="status-badge neutral">{auditLogs.length} events</span></div>
          <div className="table-responsive"><table className="table align-middle data-table"><thead><tr><th>When</th><th>Who</th><th>Role</th><th>Action</th></tr></thead><tbody>
            {auditLogs.map((item) => <tr key={item._id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.actorName}</td><td>{item.actorRole}</td><td>{item.action}</td></tr>)}
            {!auditLogs.length && <tr><td className="empty-state" colSpan="4">No activity recorded for this range.</td></tr>}
          </tbody></table></div>
        </section>
      </div>
    </>
  );
}

function BalanceRow({ employee, item, onSave }) {
  const [value, setValue] = useState(String(item.entitlement));
  useEffect(() => setValue(String(item.entitlement)), [item.entitlement]);
  return <tr><td>{employee.name}</td><td>{employee.department}</td><td>{item.type}</td><td><input aria-label={`${employee.name} ${item.type} allowance`} className="form-control form-control-sm balance-input" type="number" min="0" max="366" value={value} onChange={(event) => setValue(event.target.value)} /></td><td>{item.used}</td><td>{item.remaining}</td><td><button className="btn btn-sm btn-outline-primary" onClick={() => onSave(employee._id, item.type, value)}>Save</button></td></tr>;
}

function ReportTable({ module, records }) {
  const columns = module === "employees" ? [["name", "Employee"], ["department", "Department"], ["jobTitle", "Job title"], ["hireDate", "Hire date"], ["status", "Status"]]
    : module === "attendance" ? [["employee", "Employee"], ["date", "Date"], ["checkIn", "Check-in"], ["checkOut", "Check-out"], ["hoursWorked", "Hours"], ["status", "Status"]]
      : module === "leaves" ? [["employee", "Employee"], ["type", "Type"], ["startDate", "From"], ["endDate", "To"], ["status", "Status"]]
        : [["employee", "Employee"], ["period", "Period"], ["baseSalary", "Base pay"], ["netPay", "Net pay"], ["status", "Status"]];
  function value(record, key) {
    if (key === "employee") return record.employee?.name || "—";
    if (["date", "hireDate", "startDate", "endDate"].includes(key)) return dateLabel(record[key]);
    if (["baseSalary", "netPay"].includes(key)) return `$${Number(record[key] || 0).toLocaleString()}`;
    return record[key] ?? "—";
  }
  return <table className="table align-middle data-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{records.map((record) => <tr key={record._id}>{columns.map(([key]) => <td key={key}>{value(record, key)}</td>)}</tr>)}{!records.length && <tr><td className="empty-state" colSpan={columns.length}>No records match the selected filters.</td></tr>}</tbody></table>;
}
