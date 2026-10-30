import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";

export default function Login({ portal = "hr" }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [artTilt, setArtTilt] = useState({ x: 0, y: 0 });

  function handleArtMove(event) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    setArtTilt({ x: -y * 5, y: x * 7 });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(form.email, form.password, portal);
      navigate(portal === "employee" ? "/employee" : "/", { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-layout">
        <section className={`login-showcase ${portal === "employee" ? "employee-showcase" : "hr-showcase"}`}>
          <div className="showcase-orb orb-a" /><div className="showcase-orb orb-b" />
          <div className="showcase-brand"><span className="showcase-brand-mark">P</span><span>PeopleDesk<small>PEOPLE &amp; CULTURE</small></span></div>
          <div className="showcase-copy">
            <span className="showcase-kicker"><i /> {portal === "employee" ? "YOUR EMPLOYEE SPACE" : "PEOPLE, IN PERSPECTIVE"}</span>
            <h2>{portal === "employee" ? <>A better workday<br /><span>starts here.</span></> : <>Build a thriving team.<br /><span>One insight at a time.</span></>}</h2>
            <p>{portal === "employee" ? "Your schedule, time off, payslips, and growth—all together in one calm, simple place." : "A more human way to bring your people operations, team insights, and everyday decisions together."}</p>
          </div>
          <div className="login-art-wrap" onPointerMove={handleArtMove} onPointerLeave={() => setArtTilt({ x: 0, y: 0 })}>
            <div className="login-art-depth" style={{ "--art-tilt-x": `${artTilt.x}deg`, "--art-tilt-y": `${artTilt.y}deg` }}>
              <img className="login-illustration" src="/people-hero.svg" alt="" />
            </div>
            <div className="float-card float-card-top"><span className="float-icon">✳</span><span><strong>{portal === "employee" ? "Your workspace" : "People analytics"}</strong><small>{portal === "employee" ? "Everything in sync" : "A clear view of your team"}</small></span></div>
            <div className="float-card float-card-bottom"><span className="float-avatar">✓</span><span><strong>{portal === "employee" ? "Time well managed" : "Better decisions, together"}</strong><small>{portal === "employee" ? "Made for your work life" : "Powered by thoughtful workflows"}</small></span></div>
          </div>
          <div className="showcase-footer"><span>PEOPLE FIRST. ALWAYS.</span><span className="showcase-dots"><i /><i /><i /></span><span>01 — 02</span></div>
        </section>

        <section className="login-card">
          <div className="login-card-top">
            <div><span className="eyebrow">{portal === "employee" ? "EMPLOYEE PORTAL" : "HR & ADMIN PORTAL"}</span><span className="secure-label"><i /> SECURE SIGN IN</span></div>
            <div className="login-card-actions"><ThemeToggle /><div className="brand-mark login-card-mark">P</div></div>
          </div>
          <h1>{portal === "employee" ? "Welcome to your space." : "Welcome back."}</h1>
          <p className="login-intro">{portal === "employee" ? "Sign in to pick up right where you left off." : "Sign in to see what’s happening across your team."}</p>
          <div className="portal-switch" aria-label="Choose sign-in portal"><Link className={portal === "hr" ? "selected" : ""} to="/login"><span>◈</span> HR portal</Link><Link className={portal === "employee" ? "selected" : ""} to="/employee-login"><span>♙</span> Employee portal</Link></div>
          {location.state?.logoutWarning && <div className="alert alert-warning py-2" role="status">{location.state.logoutWarning}</div>}
          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="username" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={portal === "employee" ? "you@company.com" : "hr@company.com"} />
            <div className="password-label-row"><label htmlFor="password">Password</label><Link className="forgot-password-link" to={`/forgot-password?portal=${portal}`}>Forgot password?</Link></div>
            <input id="password" type="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" />
            {error && <div className="alert alert-danger py-2 mb-0" role="alert">{error}</div>}
            <button className="btn btn-primary login-submit" disabled={submitting}>{submitting ? "Signing in…" : <>Sign in securely <span aria-hidden="true">→</span></>}</button>
          </form>
          <div className="login-assurance"><span className="assurance-icon">⌑</span><span><strong>Your information stays yours</strong><small>{portal === "employee" ? "Your account only shows your personal work records." : "Your organization’s data is protected and access-controlled."}</small></span></div>
          <p className="login-note">{portal === "employee" ? "Need access? Contact your HR team to get your individual account." : "HR accounts are individually provisioned by your administrator."}</p>
        </section>
      </div>
    </main>
  );
}
