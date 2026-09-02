const PARAM = 'invite';
const CONNECT_PARAM = 'connect';
const RESET_PARAM = 'reset';

/** Reads a household invite code from the current URL's `?invite=` query param, if present. */
export function readInviteCodeFromUrl(): string | null {
  try {
    const code = new URLSearchParams(window.location.search).get(PARAM);
    return code ? code.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Reads a personal connect code from the current URL's `?connect=` query param, if present. */
export function readConnectCodeFromUrl(): string | null {
  try {
    const code = new URLSearchParams(window.location.search).get(CONNECT_PARAM);
    return code ? code.trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Reads a password-reset token from the current URL's `?reset=` query param, if present.
 * Unlike invite/connect codes this is a long, case-sensitive hex token (see
 * server/src/routes/auth.ts), so it's trimmed but never uppercased. */
export function readResetTokenFromUrl(): string | null {
  try {
    const token = new URLSearchParams(window.location.search).get(RESET_PARAM);
    return token ? token.trim() : null;
  } catch {
    return null;
  }
}

/** Strips the invite/connect/reset params from the address bar without a navigation/reload,
 * once they've been handled — so refreshing the page or sharing the URL again doesn't
 * re-trigger the flow. */
export function clearInviteCodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM) && !url.searchParams.has(CONNECT_PARAM) && !url.searchParams.has(RESET_PARAM)) return;
    url.searchParams.delete(PARAM);
    url.searchParams.delete(CONNECT_PARAM);
    url.searchParams.delete(RESET_PARAM);
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch {
    // no-op — worst case the param just lingers in the URL
  }
}

/** A plain `/?invite=CODE` link — deliberately not a path-based route (e.g. `/join/CODE`)
 * so it works on any static host without server-side SPA fallback configuration. */
export function buildInviteLink(code: string): string {
  try {
    const url = new URL('/', window.location.origin);
    url.searchParams.set(PARAM, code);
    return url.toString();
  } catch {
    return `${window.location.origin}/?${PARAM}=${encodeURIComponent(code)}`;
  }
}

/** Same idea as buildInviteLink, but for a personal one-to-one connect code rather than a
 * household invite — kept as a separate query param so the two flows never collide if
 * someone somehow has both in the same URL. */
export function buildConnectLink(code: string): string {
  try {
    const url = new URL('/', window.location.origin);
    url.searchParams.set(CONNECT_PARAM, code);
    return url.toString();
  } catch {
    return `${window.location.origin}/?${CONNECT_PARAM}=${encodeURIComponent(code)}`;
  }
}
