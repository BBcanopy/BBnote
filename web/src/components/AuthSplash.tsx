import { isNative, openExternal } from "../platform/native";

export function AuthSplash(props: { onLogin(): void; busy: boolean; server?: string | null; onChangeServer?(): void; onRetry?(): void; error?: string | null }) {
  return (
    <section className="bb-auth-shell">
      <div className="bb-auth-grid">
        <article className="bb-auth-hero">
          <div className="bb-auth-hero__inner">
            <div className="bb-auth-hero__mark" aria-hidden="true">
              <span className="bb-brand-mark__pill">BB</span>
            </div>
            <h1 className="bb-auth-hero__title">BBNote</h1>
            {props.server ? <p className="bb-connected-server">{props.server}</p> : null}
            {props.error ? <p role="alert" className="bb-inline-error">{props.error}</p> : null}
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
                href={props.server ? `${props.server}/docs` : "/docs"}
                onClick={(event) => {
                  if (isNative() && props.server) { event.preventDefault(); void openExternal(`${props.server}/docs`); }
                }}
                className="bb-button bb-button--ghost"
              >
                Read API docs
              </a>
              {props.onChangeServer ? <button type="button" className="bb-button bb-button--ghost"
                onClick={props.onChangeServer} disabled={props.busy}>Change server</button> : null}
              {props.error && props.onRetry ? <button type="button" className="bb-button bb-button--ghost"
                onClick={props.onRetry} disabled={props.busy}>Retry connection</button> : null}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
