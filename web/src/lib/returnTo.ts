/**
 * Where to send the user after signing in: `?next=` on the sign-in / sign-up
 * pages, kept in localStorage so OAuth and email-confirmation round trips
 * (which land on /auth/callback, possibly in another tab) still find it.
 */
const KEY = 'aegis-auth-return'

/** Same-site paths only (no `//host` or scheme), so `next` can't open-redirect. */
const safe = (path: string | null | undefined) => (path && /^\/(?![/\\])/.test(path) ? path : undefined)

/** Remember the `?next=` of the current page, if valid; returns it. */
export function rememberReturnTo(): string | undefined {
  const next = safe(new URLSearchParams(window.location.search).get('next'))
  try {
    if (next) localStorage.setItem(KEY, next)
  } catch {}
  return next
}

/** The remembered path (falling back to `/`), cleared once read. */
export function takeReturnTo(): string {
  try {
    const next = safe(localStorage.getItem(KEY))
    localStorage.removeItem(KEY)
    return next ?? '/'
  } catch {
    return '/'
  }
}

/** `/sign-up?next=…` style link target. */
export const withNext = (page: string, next: string) => `${page}?next=${encodeURIComponent(next)}`
