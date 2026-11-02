import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExternalCollaboration from "../components/ExternalCollaboration.jsx";
import ProfileAvatar from "../components/ProfileAvatar.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";

export default function PartnerPortal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState("");

  useEffect(() => {
    api("/operations/notifications")
      .then((result) => setNotifications(result.data || []))
      .catch((error) => setNotificationError(error.message));
  }, []);

  async function markRead(notification) {
    if (notification.readAt) return;
    try {
      const result = await api(`/operations/notifications/${notification._id}/read`, { method: "PATCH", body: JSON.stringify({}) });
      setNotifications((current) => current.map((item) => item._id === notification._id ? result.data : item));
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.message);
    }
  }

  async function signOut() {
    try {
      await logout();
      navigate("/partner-login", { replace: true });
    } catch {
      navigate("/partner-login", {
        replace: true,
        state: { logoutWarning: "This device has signed out, but the server could not revoke the session. It expires automatically." },
      });
    }
  }

  return (
    <div className="partner-portal">
      <header className="partner-portal-header">
        <div className="brand"><span className="brand-mark">P</span><span className="brand-name">PeopleDesk<small>PARTNER SPACE</small></span></div>
        <div className="partner-portal-user"><ThemeToggle /><div className="partner-notification-wrap"><button type="button" className="partner-notification-button" onClick={() => setNotificationsOpen((open) => !open)} aria-expanded={notificationsOpen} aria-label={`Notifications, ${notifications.filter((item) => !item.readAt).length} unread`}>♢{notifications.filter((item) => !item.readAt).length > 0 && <span>{notifications.filter((item) => !item.readAt).length}</span>}</button>{notificationsOpen && <section className="partner-notification-popover" aria-label="Notifications"><h2>Notifications</h2>{notificationError && <p className="partner-notification-error" role="alert">{notificationError}</p>}{notifications.map((item) => <button type="button" className={`partner-notification-item ${item.readAt ? "" : "unread"}`} key={item._id} onClick={() => markRead(item)}><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleString()}</small></button>)}{!notificationError && !notifications.length && <p>You’re all caught up.</p>}</section>}</div><ProfileAvatar name={user?.name || "Partner"} role="partner" /><span><strong>{user?.name}</strong><small>External collaborator</small></span><button type="button" className="btn btn-sm btn-outline-secondary" onClick={signOut}>Sign out</button></div>
      </header>
      <ExternalCollaboration user={user} fullPage />
    </div>
  );
}
