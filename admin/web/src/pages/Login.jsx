import { useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { SIGNED_OUT_EVENT, api } from "../lib/api.js";
import { SiteContext } from "../lib/site.js";
import { Button, TextInput } from "../ui/controls.jsx";

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="5" cy="10" r="3" fill="var(--text)" />
      <path d="M8 10h4" stroke="var(--text)" strokeWidth="1.5" />
      <circle cx="15" cy="10" r="3" fill="var(--accent)" />
    </svg>
  );
}

function LoginForm({ site, expired, onSignedIn }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async (event) => {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const session = await api("/api/auth/login", { method: "POST", body: { password } });
      onSignedIn(session);
    } catch (err) {
      setError(err.message);
      setPassword("");
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <form className="login-card" onSubmit={submit}>
      <Mark />
      <div className="login-head">
        <h1>{expired ? "Session expired" : "Sign in to Studio"}</h1>
        <p>{expired ? "Sign in again to keep working. Unsaved changes are still here." : `Enter the admin password to manage ${site || "your website"}.`}</p>
      </div>
      <label className="login-field">
        <span>Admin password</span>
        <TextInput
          ref={inputRef}
          type="password"
          icon={LockKeyhole}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(error)}
        />
      </label>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!password}>
        Sign in
      </Button>
    </form>
  );
}

// Once signed in, the app stays mounted under the login overlay so an expired session doesn't drop unsaved edits.
export function AuthGate({ children }) {
  const [state, setState] = useState("checking");
  const [mounted, setMounted] = useState(false);
  const [site, setSite] = useState("");

  const accept = (session) => {
    if (session?.site) setSite(session.site);
    setState(session?.authenticated ? "in" : "out");
  };

  useEffect(() => {
    api("/api/auth/session")
      .then(accept)
      .catch(() => setState("out"));
    const onSignedOut = (event) => {
      if (event.detail?.manual) setMounted(false);
      setState("out");
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  useEffect(() => {
    if (state === "in") setMounted(true);
  }, [state]);

  useEffect(() => {
    document.title = site ? `${site} · Studio` : "Studio";
  }, [site]);

  if (state === "checking") return null;

  return (
    <SiteContext.Provider value={{ name: site }}>
      {mounted && children}
      {state === "out" && (
        <div className={mounted ? "login-screen login-overlay" : "login-screen"}>
          <LoginForm site={site} expired={mounted} onSignedIn={accept} />
        </div>
      )}
    </SiteContext.Provider>
  );
}
