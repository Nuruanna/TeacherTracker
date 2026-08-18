import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";

export default function AuthGate({ children }) {
  const { session, loading, configurationError, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (loading)
    return (
      <main className="auth-screen" aria-live="polite">
        <section className="auth-card auth-loading">Checking your session…</section>
      </main>
    );
  if (session) return children;

  const submit = async (event) => {
    event.preventDefault();
    if (configurationError || submitting) return;
    setSubmitting(true);
    setError("");
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span>Teacher</span>
          <small>Lesson Tracker</small>
        </div>
        <h1>Teacher sign in</h1>
        <p>Sign in to open your lesson tracker.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={Boolean(configurationError) || submitting}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={Boolean(configurationError) || submitting}
            />
          </label>
          {(configurationError || error) && (
            <p className="auth-error" role="alert">
              {configurationError || error}
            </p>
          )}
          <button type="submit" disabled={Boolean(configurationError) || submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
