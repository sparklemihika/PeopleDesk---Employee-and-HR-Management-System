import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import PageHeader from "../components/PageHeader.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { api } from "../lib/api.js";

const chartColors = ["#6d5ce8", "#34a987", "#f0a94a", "#5485df", "#e47791", "#35a9ba"];

function initials(name = "") {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function Person({ name, detail }) {
  return <div className="person-cell"><span className="avatar">{initials(name)}</span><span><strong>{name}</strong><small>{detail}</small></span></div>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><strong>{label ?? payload[0].name}</strong>{payload.map((item) => <span key={item.dataKey || item.name}><i style={{ background: item.color || item.payload?.fill || "#6d5ce8" }} />{item.name}: {item.value}</span>)}</div>;
}

function ChartPanel({ title, description, children, className = "" }) {
  return <section className={`panel chart-panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>;
}

function AnimatedValue({ value }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const target = Number(value);
    if (!Number.isFinite(target)) {
      setDisplayValue(value);
      return undefined;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayValue(target);
      return undefined;
    }

    let frame;
    const start = performance.now();
    const initial = 0;
    const duration = 650;
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayValue(Math.round(initial + (target - initial) * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return displayValue;
}

function ChartEmpty({ visible }) {
  return visible ? null : <div className="chart-empty">Add HR records to see your analytics here.</div>;
}

function AnalyticsHero({ employeeCount, attendanceCount }) {
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  function handleMove(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    setRotation({ x: -y * 9, y: x * 12 });
  }

  return (
    <section className="analytics-hero" onPointerMove={handleMove} onPointerLeave={() => setRotation({ x: 0, y: 0 })}>
      <div className="hero-copy">
        <span className="hero-kicker"><span className="hero-live-dot" /> PEOPLE ANALYTICS</span>
        <h2>Make people data<br /><span>work for you.</span></h2>
        <p>Turn everyday HR activity into a clearer view of your team. Explore the live insights below.</p>
        <a href="#people-insights" className="hero-link">Explore insights <span>↓</span></a>
        <div className="hero-mini-stats"><span><strong>{employeeCount ?? "—"}</strong> team members</span><i /><span><strong>{attendanceCount ?? "—"}</strong> check-ins today</span></div>
      </div>
      <div className="hero-art" style={{ "--tilt-x": `${rotation.x}deg`, "--tilt-y": `${rotation.y}deg` }} aria-label="Interactive three dimensional analytics illustration">
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <div className="hero-glow" />
        <div className="hero-cube">
          <div className="cube-face cube-front"><span className="cube-label">TEAM GROWTH</span><strong>People<br />first.</strong><div className="cube-bars"><i /><i /><i /><i /><i /><i /><i /></div><div className="cube-foot"><span>WORKFORCE</span><b>↗</b></div></div>
          <div className="cube-face cube-side"><span>INSIGHTS</span><b>HR<br />DATA</b><i>✳</i></div>
          <div className="cube-face cube-top"><span>PEOPLE DESK</span></div>
        </div>
        <div className="floating-chip chip-one"><span className="chip-icon">↗</span><span><b>People,</b><small>in perspective</small></span></div>
        <div className="floating-chip chip-two"><span className="chip-dot" /><span><b>Live insights</b><small>Updated from your team</small></span></div>
        <div className="hero-orbit-dot dot-one" /><div className="hero-orbit-dot dot-two" />
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/dashboard").then(setData).catch((requestError) => setError(requestError.message));
  }, []);
  const attendanceScatter = data?.attendanceScatter || [];
  const pieData = data?.attendanceStatuses?.length ? data.attendanceStatuses : [{ name: "No data", value: 1 }];
  const insights = data?.insights || [];

  return (
    <>
      <PageHeader eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} title="Your people, at a glance" subtitle="Here’s what’s happening across your organization today." />
      {error && <div className="alert alert-danger">{error}</div>}
      <AnalyticsHero employeeCount={data?.employees} attendanceCount={data?.presentToday} />
      <div className="stats-grid">
        <Stat icon="♙" tone="purple" label="Total employees" value={data?.employees ?? "—"} note="In your organization" />
        <Stat icon="◷" tone="green" label="Present today" value={data?.presentToday ?? "—"} note="Checked in today" />
        <Stat icon="▣" tone="orange" label="Pending leave" value={data?.pendingLeave ?? "—"} note="Awaiting your review" />
        <Stat icon="♧" tone="blue" label="Open positions" value={data?.openPositions ?? "—"} note="Active job openings" />
      </div>

      <section className="insight-panel panel">
        <div className="panel-heading"><div><h2>Executive insights</h2><p>AI-style recommendations from your current people data</p></div></div>
        <div className="insight-grid">
          {insights.map((item) => (
            <article key={item.title} className={`insight-card ${item.tone}`}>
              <span className="insight-tag">{item.tone === "warning" ? "Action" : item.tone === "success" ? "Healthy" : "Insight"}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="analytics-heading" id="people-insights"><div><span className="eyebrow">DATA, WITH A HUMAN TOUCH</span><h2>People insights</h2><p>Interactive views of your hiring, attendance, and team makeup.</p></div><span className="live-pill"><i /> Live dashboard</span></div>
      <div className="chart-grid">
        <ChartPanel title="Hiring momentum" description="New employees by month · last 6 months">
          <div className="chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.hiringTrend || []} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#eff0f5" vertical={false} /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 10 }} /><Tooltip content={<ChartTooltip />} cursor={{ fill: "#f6f4ff" }} /><Bar dataKey="hires" name="New hires" fill="#6d5ce8" radius={[6, 6, 1, 1]} maxBarSize={38} /></BarChart></ResponsiveContainer><ChartEmpty visible={Boolean(data?.hiringTrend?.some((item) => item.hires > 0))} /></div>
        </ChartPanel>
        <ChartPanel title="Team attendance" description="Check-ins vs absences · past 7 days">
          <div className="chart-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={data?.attendanceTrend || []} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#eff0f5" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 10 }} /><Tooltip content={<ChartTooltip />} cursor={{ fill: "#f6f4ff" }} /><Bar dataKey="present" name="Present" fill="#34a987" radius={[5, 5, 0, 0]} maxBarSize={28} /><Bar dataKey="absent" name="Absent" fill="#f0a94a" radius={[5, 5, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer><ChartEmpty visible={Boolean(data?.attendanceTrend?.some((item) => item.present + item.absent > 0))} /></div>
        </ChartPanel>
        <ChartPanel title="Attendance mix" description="Recorded attendance status · last 30 days">
          <div className="chart-canvas pie-canvas"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={58} outerRadius={88} paddingAngle={4} stroke="none">{pieData.map((item, index) => <Cell key={item.name} fill={item.name === "No data" ? "#e9ebf1" : chartColors[index % chartColors.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer><ChartEmpty visible={Boolean(data?.attendanceStatuses?.length)} /></div>
          <div className="chart-legend">{(data?.attendanceStatuses || []).map((item, index) => <span key={item.name}><i style={{ background: chartColors[index % chartColors.length] }} />{item.name}<b>{item.value}</b></span>)}</div>
        </ChartPanel>
        <ChartPanel title="Check-in rhythm" description="Arrival time vs hours worked · last 30 days">
          <div className="chart-canvas"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 14, right: 15, bottom: 5, left: -12 }}><CartesianGrid stroke="#eff0f5" /><XAxis type="number" dataKey="checkIn" name="Check-in" domain={[6, 12]} tickFormatter={(value) => `${Math.floor(value)}:${String(Math.round((value % 1) * 60)).padStart(2, "0")}`} axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 9 }} /><YAxis type="number" dataKey="hoursWorked" name="Hours worked" domain={[0, "dataMax + 1"]} axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 9 }} /><ZAxis range={[55, 90]} /><Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "4 4" }} /><Scatter data={attendanceScatter} name="Attendance" fill="#6d5ce8" fillOpacity={0.75} /></ScatterChart></ResponsiveContainer><ChartEmpty visible={attendanceScatter.length > 0} /></div>
          <div className="chart-note">Each dot represents one completed attendance record.</div>
        </ChartPanel>
        <ChartPanel title="Team by department" description="Active employees grouped by department" className="chart-wide">
          <div className="department-chart"><div className="department-canvas"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.departments || []} margin={{ top: 12, right: 14, left: -20, bottom: 0 }}><defs><linearGradient id="departmentFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6d5ce8" stopOpacity={0.22} /><stop offset="100%" stopColor="#6d5ce8" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#eff0f5" vertical={false} /><XAxis dataKey="department" axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#9299aa", fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="employees" name="Employees" stroke="#6d5ce8" strokeWidth={3} fill="url(#departmentFill)" activeDot={{ r: 6, stroke: "#fff", strokeWidth: 3 }} /></AreaChart></ResponsiveContainer><ChartEmpty visible={Boolean(data?.departments?.length)} /></div><div className="department-list">{(data?.departments || []).map((item, index) => <div className="department-row" key={item.department}><i style={{ background: chartColors[index % chartColors.length] }} /><span>{item.department}</span><strong>{item.employees}</strong></div>)}{data && !data.departments.length && <span className="chart-note">Add employees to see department insights.</span>}</div></div>
        </ChartPanel>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Recent employees</h2><p>Latest additions to your team</p></div><Link className="text-link" to="/employees">View all</Link></div>
          <div className="recent-list">{(data?.recentEmployees || []).map((employee) => <div className="recent-row" key={employee._id}><Person name={employee.name} detail={employee.department} /><StatusBadge>{employee.status}</StatusBadge></div>)}{data && data.recentEmployees.length === 0 && <p className="empty-state">No employees added yet. Start by adding your team.</p>}{!data && !error && <p className="empty-state">Loading your workspace…</p>}</div>
        </section>
      </div>
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Leave requests</h2><p>Requests that need your attention</p></div><Link className="text-link" to="/leave">Review requests →</Link></div>
          <div className="recent-list">{(data?.recentLeave || []).map((item) => <div className="recent-row" key={item._id}><Person name={item.employee?.name || "Employee"} detail={`${item.type} · ${new Date(item.startDate).toLocaleDateString()}`} /><StatusBadge>{item.status}</StatusBadge></div>)}{data && data.recentLeave.length === 0 && <p className="empty-state">No leave requests to review.</p>}</div>
        </section>
        <section className="panel shortcut-panel"><div className="panel-heading"><div><h2>Quick access</h2><p>Jump into your HR workspace</p></div></div><div className="shortcut-grid">{[["Employees", "/employees"], ["Attendance", "/attendance"], ["Payroll", "/payroll"], ["Recruitment", "/recruitment"]].map(([label, to]) => <Link className="shortcut-link" key={to} to={to}>{label}<span>→</span></Link>)}</div></section>
      </div>
    </>
  );
}

function Stat({ icon, tone, label, value, note }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div><div className="stat-number"><AnimatedValue value={value} /></div><div className="stat-foot">{note}</div></div>;
}
