import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import SupportChatbot from "./SupportChatbot.jsx";
import ProfileAvatar from "./ProfileAvatar.jsx";

const navigation = [
  { to: "/", label: "Dashboard", icon: "⌂", end: true },
  { to: "/employees", label: "Employees", icon: "♙" },
  { to: "/attendance", label: "Attendance", icon: "◷" },
  { to: "/leave", label: "Leave management", icon: "▣" },
  { to: "/payroll", label: "Payroll", icon: "＄" },
  { to: "/recruitment", label: "Recruitment", icon: "♧" },
  { to: "/performance", label: "Performance", icon: "↗" },
  { to: "/operations", label: "Operations & reports", icon: "◉" },
];

export default function Shell() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const pageName = navigation.find((item) => item.to === location.pathname)?.label || "Dashboard";

  async function signOut() {
    let logoutWarning = "";
    try {
      await logout();
    } catch {
      logoutWarning = "This device has signed out, but the server could not revoke the session. It expires automatically.";
    }
    navigate("/login", { replace: true, state: { logoutWarning } });
  }

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <NavLink className="brand" to="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">P</span><span className="brand-name">PeopleDesk<small>PEOPLE &amp; CULTURE</small></span>
        </NavLink>
        <div className="nav-label">Workspace</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`} onClick={() => setMenuOpen(false)}>
              <span className="nav-icon">{item.icon}</span>{item.label}{item.count && <span className="nav-count">{item.count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="help-card"><strong>Need a hand?</strong><p>Ask the PeopleDesk support assistant about HR tools and your workspace.</p><button type="button" onClick={() => setChatOpen(true)}>Chat with support →</button></div>
        <div className="profile">
          <ProfileAvatar name={user?.name || "HR Administrator"} role="hr" />
          <span className="profile-info"><strong>{user?.name || "HR Administrator"}</strong><small>{user?.role || "HR Administrator"}</small></span>
          <button className="profile-logout" onClick={signOut} title="Sign out" aria-label="Sign out">↪</button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button><div className="breadcrumb">Workspace <span>/</span> <strong>{pageName}</strong></div></div>
          <div className="top-actions">
            <ThemeToggle />
            <span className="top-date">{new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            <ProfileAvatar name={user?.name || "HR Administrator"} role="hr" size="topbar" />
          </div>
        </header>
        <div className="page-content" key={location.pathname}><Outlet /></div>
      </main>
      <SupportChatbot open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} />
    </div>
  );
}
