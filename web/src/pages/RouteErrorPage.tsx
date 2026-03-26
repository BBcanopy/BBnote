import { ArrowLeft, CircleNotch, HouseSimple, SignIn, WarningCircle } from "@phosphor-icons/react";
import { Link, isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { BrandMark } from "../components/BrandMark";
import { PageNav } from "../components/PageNav";
import { buttonPrimary, buttonSecondary } from "../components/buttonStyles";

export function RouteErrorPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const error = useRouteError();
  const routeError = isRouteErrorResponse(error) ? error : null;
  const statusCode = routeError?.status ?? 500;
  const notFound = statusCode === 404;
  const title = notFound ? "That page slipped out of this notebook." : "BBNote hit a route snag.";
  const showHomeAction = auth.status !== "loading";
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
              <BrandMark />
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
              <h1 className="bb-route-error__title">{title}</h1>
              <div className="bb-route-error__actions">
                {showHomeAction && (
                  <Link to="/" className={buttonPrimary}>
                    <HouseSimple size={18} />
                    {auth.user ? "Open notes" : "Back to home"}
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
                  <span className="bb-brand-mark__pill">BB</span>
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
