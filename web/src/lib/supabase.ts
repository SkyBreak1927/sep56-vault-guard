import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client. The session lives in cookies (via @supabase/ssr) so
 * server code can read it too (`supabase-server.ts`, refreshed by `proxy.ts`);
 * OAuth, email confirmation and password recovery all return through PKCE
 * `?code=` links, exchanged here on load.
 *
 * Returns null when NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY aren't set
 * (inlined at build time), so the auth UI can say so instead of crashing.
 */
export const url = process.env.NEXT_PUBLIC_SUPABASE_URL
export const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const authConfigured = !!(url && key)

let client: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (client === undefined) client = url && key ? createBrowserClient(url, key) : null
  return client
}

/** Absolute URL of a page on this site, under basePath (for auth redirects). */
export const siteUrl = (path: string) => `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`
