import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const portal = searchParams.get("portal") === "employee" ? "employee" : "hr";
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [resetUrl, setResetUrl] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSending(true);
    try {
      const result = await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email, portal }),
      });
      setResetUrl(result.devResetUrl || "");
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="recovery-theme-toggle"><ThemeToggle /></div>
        <div className="brand login-brand"><span className="brand-mark">P</span><span className="brand-name">PeopleDesk<small>PEOPLE &amp; CULTURE</small></span></div>
        <div className="eyebrow">{portal === "employee" ? "EMPLOYEE PORTAL" : "HR & ADMIN PORTAL"}</div>
        <h1>Forgot your password?</h1>
        <div className="recovery-stage" key={submitted ? "success" : "form"}>
          {submitted ? (
            <div className="password-reset-success" role="status">
              <span className="reset-success-icon">✓</span>
              <p>{resetUrl ? "Email delivery is not configured. Use this local development reset link; it expires in 30 minutes and works once." : "If an account matches that email and portal, a password reset link will be sent. Check your inbox and spam folder."}</p>
              {resetUrl && <a className="btn btn-outline-primary login-submit" href={resetUrl}>Open local reset link</a>}
              <Link to={portal === "employee" ? "/employee-login" : "/login"} className="btn btn-primary login-submit">Back to sign in</Link>
            </div>
          ) : (
            <>
              <p className="subtitle">Enter the email address linked to your account. We’ll email a secure reset link, or show a local-only link when development reset mode is enabled.</p>
              <form className="login-form" onSubmit={handleSubmit}>
                <label htmlFor="reset-email">Email address</label>
                <input id="reset-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
                {error && <div className="alert alert-danger py-2 mb-0" role="alert">{error}</div>}
                <button className="btn btn-primary login-submit" disabled={sending}>{sending ? "Sending…" : "Send reset link"}</button>
              </form>
              <p className="login-note">For your security, reset links expire after 30 minutes and can only be used once.</p>
            </>
          )}
        </div>
        <Link className="back-to-login" to={portal === "employee" ? "/employee-login" : "/login"}>← Back to sign in</Link>
      </section>
    </main>
  );
}
