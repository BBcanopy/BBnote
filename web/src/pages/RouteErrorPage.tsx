import { ArrowLeft, CircleNotch, HouseSimple, SignIn, WarningCircle } from "@phosphor-icons/react";
import { Link, isRouteErrorResponse, useLocation, useNavigate, useRouteError } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { PageNav } from "../components/PageNav";
import { buttonPrimary, buttonSecondary } from "../components/buttonStyles";

export function RouteErrorPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const error = useRouteError();
  const routeError = isRouteErrorResponse(error) ? error : null;
  const statusCode = routeError?.status ?? 500;
  const notFound = statusCode === 404;
  const eyebrow = notFound ? "Page not found" : "Route error";
  const title = notFound ? "That page slipped out of this notebook." : "BBNote hit a route snag.";
  const description = notFound
    ? "The link may be old, incomplete, or pointing somewhere that was never filed."
    : "The app couldn't open this route cleanly, but your notes are still close by.";
  const detail = routeError
    ? routeError.statusText
    : error instanceof Error
      ? error.message
      : "Unknown route error";

  return (
    <main className="bb-page-shell">
      <div className="bb-shell bb-shell--error">
        {auth.user ? (
          <PageNav
            user={auth.user}
            onLogout={() => void auth.logout()}
            onThemeChange={(theme) => auth.setTheme(theme)}
          />
        ) : (
          <header className="bb-topbar">
            <div className="bb-topbar__nav bb-topbar__nav--brand-only">
              <Link to="/" className="bb-brand-mark" aria-label="BBNote home">
                <span className="bb-brand-mark__pill">bb</span>
                <span className="bb-brand-mark__title">BBNote</span>
              </Link>
            </div>
            {auth.status === "loading" ? (
              <div className="bb-status-pill">
                <CircleNotch size={16} className="animate-spin text-[color:var(--accent-strong)]" />
                Checking session
              </div>
            ) : (
              <button type="button" onClick={() => void auth.login()} className={buttonPrimary}>
                <SignIn size={18} />
                Sign in
              </button>
            )}
          </header>
        )}

        <section className="bb-route-error" data-testid="route-error-page">
          <div className="bb-route-error__hero">
            <div className="bb-route-error__copy">
              <p className="bb-route-error__eyebrow">{eyebrow}</p>
              <h1 className="bb-route-error__title">{title}</h1>
              <p className="bb-route-error__description">{description}</p>
              <div className="bb-route-error__actions">
                {auth.user ? (
                  <Link to="/" className={buttonPrimary}>
                    <HouseSimple size={18} />
                    Open notes
                  </Link>
                ) : auth.status === "loading" ? null : (
                  <Link to="/" className={buttonPrimary}>
                    <HouseSimple size={18} />
                    Back to home
                  </Link>
                )}
                <button type="button" onClick={() => navigate(-1)} className={buttonSecondary}>
                  <ArrowLeft size={18} />
                  Go back
                </button>
              </div>
            </div>

            <div className="bb-route-error__panel" aria-hidden="true">
              <div className="bb-route-error__note">
                <div className="bb-route-error__note-head">
                  <span className="bb-brand-mark__pill">bb</span>
                  <span className="bb-route-error__note-chip">{notFound ? "missing page" : "route issue"}</span>
                </div>
                <p className="bb-route-error__status">{statusCode}</p>
                <div className="bb-route-error__lines">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="bb-route-error__halo" />
            </div>
          </div>

          <div className="bb-route-error__meta">
            <span className="bb-route-error__meta-label">Path</span>
            <code>{location.pathname}</code>
          </div>

          {!notFound ? (
            <p className="bb-error-banner text-sm inline-flex items-center gap-2">
              <WarningCircle size={16} />
              {detail}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
