import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const portal = searchParams.get("portal") === "employee" ? "employee" : "hr";
  const loginUrl = portal === "employee" ? "/employee-login" : "/login";
  const [form, setForm] = useState({ password: "", confirmation: "" });
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: form.password }),
      });
      setComplete(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="recovery-theme-toggle"><ThemeToggle /></div>
        <div className="brand login-brand"><span className="brand-mark">P</span><span className="brand-name">PeopleDesk<small>PEOPLE &amp; CULTURE</small></span></div>
        <div className="eyebrow">SECURE ACCOUNT RECOVERY</div>
        <h1>{complete ? "Password updated." : "Create a new password."}</h1>
        <div className="recovery-stage" key={complete ? "complete" : token ? "form" : "missing-token"}>
          {complete ? (
            <div className="password-reset-success" role="status">
              <span className="reset-success-icon">✓</span>
              <p>Your password has been changed. Sign in with your new password.</p>
              <Link to={loginUrl} className="btn btn-primary login-submit">Continue to sign in</Link>
            </div>
          ) : !token ? (
            <div className="password-reset-success" role="alert">
              <p>This reset link is incomplete. Request a new link to continue.</p>
              <Link to={`/forgot-password?portal=${portal}`} className="btn btn-primary login-submit">Request a reset link</Link>
            </div>
          ) : (
            <>
              <p className="subtitle">Choose a unique password with at least 12 characters.</p>
              <form className="login-form" onSubmit={handleSubmit}>
                <label htmlFor="new-password">New password</label>
                <input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
                <label htmlFor="confirm-password">Confirm new password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.confirmation} onChange={(event) => setForm({ ...form, confirmation: event.target.value })} />
                {error && <div className="alert alert-danger py-2 mb-0" role="alert">{error}</div>}
                <button className="btn btn-primary login-submit" disabled={saving}>{saving ? "Updating…" : "Update password"}</button>
              </form>
            </>
          )}
        </div>
        <Link className="back-to-login" to={loginUrl}>← Back to sign in</Link>
      </section>
    </main>
  );
}
