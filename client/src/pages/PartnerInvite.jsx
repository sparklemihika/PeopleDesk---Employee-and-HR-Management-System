import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { api } from "../lib/api.js";

export default function PartnerInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [form, setForm] = useState({ name: "", password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function acceptInvite(event) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const result = await api("/auth/accept-partner-invite", {
        method: "POST",
        body: JSON.stringify({ token, name: form.name, password: form.password }),
      });
      navigate("/partner-login", { replace: true, state: { inviteAccepted: result.message } });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card partner-invite-card">
        <div className="login-card-top"><span className="eyebrow">PARTNER PROJECT</span><ThemeToggle /></div>
        <h1>Join the collaboration.</h1>
        <p className="login-intro">Create your secure partner account to access the project space you were invited to.</p>
        {!token && <div className="alert alert-danger" role="alert">This invitation link is missing its access token. Ask the project host to send a new invitation.</div>}
        <form className="login-form" onSubmit={acceptInvite}>
          <label htmlFor="partner-name">Your name</label>
          <input id="partner-name" required maxLength="100" autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <label htmlFor="partner-password">Create password</label>
          <input id="partner-password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          <label htmlFor="partner-confirm-password">Confirm password</label>
          <input id="partner-confirm-password" type="password" required minLength="12" maxLength="128" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} />
          {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
          <button className="btn btn-primary login-submit" disabled={saving || !token}>{saving ? "Joining project…" : "Accept invitation"}</button>
        </form>
        <p className="login-note">Invitation links expire after seven days. <Link to="/partner-login">Already joined? Sign in</Link></p>
      </section>
    </main>
  );
}
