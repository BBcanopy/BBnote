import { ArrowRight, NotePencil, StackSimple, Swatches } from "@phosphor-icons/react";

export function AuthSplash(props: { onLogin(): void; busy: boolean }) {
  return (
    <section className="bb-auth-shell">
      <div className="bb-auth-grid">
        <article className="bb-auth-hero">
          <div className="bb-auth-hero__mark">
            <span aria-hidden="true" className="bb-brand-mark__pill">bb</span>
          </div>
          <p className="bb-eyebrow">Quietly structured note work</p>
          <h1 className="bb-auth-hero__title">BBNote</h1>
          <p className="bb-auth-hero__copy">
            Capture drafts, sort notebooks, and keep a calm markdown workspace across imports, exports, and attached files.
          </p>
          <div className="bb-auth-hero__actions">
            <button
              type="button"
              onClick={props.onLogin}
              disabled={props.busy}
              className="bb-button bb-button--primary"
            >
              <ArrowRight size={18} weight="bold" />
              {props.busy ? "Preparing sign-in" : "Sign in with OIDC"}
            </button>
            <a
              href="/docs"
              className="bb-button bb-button--ghost"
            >
              Read API docs
            </a>
          </div>
        </article>
        <aside className="bb-auth-preview" aria-label="Workspace preview">
          <div className="bb-auth-preview__row">
            <div className="bb-auth-preview__badge">
              <NotePencil size={18} weight="bold" />
            </div>
            <div>
              <p className="bb-eyebrow">Editor</p>
              <h2 className="bb-auth-preview__title">Keep drafts moving without friction</h2>
            </div>
          </div>
          <div className="bb-auth-preview__stack">
            <article className="bb-auth-preview__card">
              <div className="bb-auth-preview__card-icon">
                <StackSimple size={18} weight="bold" />
              </div>
              <div>
                <p>Nested notebooks stay easy to scan</p>
                <span>Drag, collapse, and reopen the workspace without losing context.</span>
              </div>
            </article>
            <article className="bb-auth-preview__card">
              <div className="bb-auth-preview__card-icon">
                <Swatches size={18} weight="bold" />
              </div>
              <div>
                <p>Three themes, one steady workspace</p>
                <span>Sea, Ember, and Midnight travel with your account.</span>
              </div>
            </article>
          </div>
        </aside>
      </div>
    </section>
  );
}
