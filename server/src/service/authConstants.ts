export const SESSION_COOKIE_NAME = "bbnote_session";
export const OIDC_STATE_COOKIE_NAME = "bbnote_oidc_state";
export const OIDC_VERIFIER_COOKIE_NAME = "bbnote_oidc_verifier";
export const RETURN_TO_COOKIE_NAME = "bbnote_auth_return_to";

export function authCookieOptions(secure: boolean) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure
  };
}
