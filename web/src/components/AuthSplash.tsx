export function AuthSplash(props: { onLogin(): void; busy: boolean }) {
  return (
    <section className="bb-auth-shell">
      <div className="bb-auth-grid">
        <article className="bb-auth-hero">
          <div className="bb-auth-hero__inner">
            <div className="bb-auth-hero__mark" aria-hidden="true">
              <span className="bb-brand-mark__pill">bb</span>
            </div>
            <h1 className="bb-auth-hero__title">BBNote</h1>
            <div className="bb-auth-hero__actions">
              <button
                type="button"
                onClick={props.onLogin}
                disabled={props.busy}
                className="bb-button bb-button--primary"
              >
                {props.busy ? "Preparing sign-in" : "Sign in with OIDC"}
              </button>
              <a
                href="/docs"
                className="bb-button bb-button--ghost"
              >
                Read API docs
              </a>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
