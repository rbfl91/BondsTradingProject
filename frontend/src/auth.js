// H-04 FIX — server-side / per-operator auth, no static token in the bundle.
//
// The old design baked `VITE_API_TOKEN` into the JS bundle at build time, so
// every visitor could read the API's write token. Now:
//
//   1. DEV: the Vite dev proxy (vite.config.js) injects the bearer token
//      server-side from `frontend/.env` (untracked, local only). The token
//      never reaches the browser.
//   2. PROD: the reverse proxy / backend serving the SPA injects the bearer
//      token on the server side (documented in README).
//   3. FALLBACK (operator dashboard, C-01 scope): if a request comes back 401
//      (e.g. the API is reached directly without a proxy), the AuthGate lets
//      the operator paste the dashboard token at runtime. It is kept in
//      localStorage (per operator/browser, revocable) — NOT in the bundle.
//
// The API itself stays fail-closed: no configured AUTH_TOKEN → 401 everywhere
// except /health and the docs routes.

const STORAGE_KEY = 'bond_dashboard_api_token'

// In-memory fallback when localStorage is unavailable (e.g. private mode).
let memoryToken = ''

/** @returns {string} the operator-provided token, or '' if none is stored */
export function getAuthToken() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || memoryToken
  } catch {
    return memoryToken
  }
}

/** Store (or replace) the operator token. Pass '' to clear. */
export function setAuthToken(token) {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode) — token stays in memory for the session.
    memoryToken = token || ''
  }
}

/** Forget the stored token (logout / "Disconnect"). */
export function clearAuthToken() {
  setAuthToken('')
}

// ── Unauthorized (401) event channel ─────────────────────────────────────────
// The axios response interceptor (services/api.js) emits here on 401; the
// AuthGate component subscribes to show the token prompt.
const listeners = new Set()
let unauthorizedEmitted = false

/** Subscribe to 401 events. Returns an unsubscribe function. */
export function onUnauthorized(cb) {
  listeners.add(cb)
  // Notify immediately if a 401 already happened before we subscribed.
  if (unauthorizedEmitted) cb()
  return () => listeners.delete(cb)
}

/** Mark the API as requiring a token (called by the interceptor on 401). */
export function markUnauthorized() {
  unauthorizedEmitted = true
  for (const cb of [...listeners]) {
    try {
      cb()
    } catch {
      // listener errors must not break the request pipeline
    }
  }
}

/** Clear the 401 flag (after a token is set, or a health check succeeds). */
export function clearUnauthorized() {
  unauthorizedEmitted = false
}

// ── Manual prompt (header "API Token" button) ───────────────────────────
const promptListeners = new Set()

/** Ask the UI to open the token prompt (operator-initiated). */
export function requestTokenPrompt() {
  for (const cb of [...promptListeners]) {
    try {
      cb()
    } catch {
      // listener errors must not break the caller
    }
  }
}

/** Subscribe to manual prompt requests. Returns an unsubscribe function. */
export function onTokenPrompt(cb) {
  promptListeners.add(cb)
  return () => promptListeners.delete(cb)
}
