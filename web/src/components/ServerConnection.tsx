import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";

export function ServerConnection() {
  const auth = useAuth();
  const [url, setUrl] = useState("");
  return (
    <main className="bb-page-shell bb-connection-shell">
      <section className="bb-connection-card" aria-labelledby="server-title">
        <span className="bb-brand-mark__pill" aria-hidden="true">BB</span>
        <h1 id="server-title">Connect to BBNote</h1>
        <p>Enter the address of your BBNote server to open your notebooks.</p>
        <form onSubmit={(event) => { event.preventDefault(); void auth.connect(url); }}>
          <label className="bb-field">
            <span>Server URL</span>
            <input className="bb-input" type="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              inputMode="url" autoComplete="url" placeholder="https://notes.example.com" required
              value={url} onChange={(event) => setUrl(event.target.value)} disabled={auth.busy} />
          </label>
          {auth.error ? <p role="alert" className="bb-inline-error">{auth.error}</p> : null}
          <button className="bb-button bb-button--primary" type="submit" disabled={auth.busy}>
            {auth.busy ? "Connecting…" : "Connect"}
          </button>
        </form>
      </section>
    </main>
  );
}
