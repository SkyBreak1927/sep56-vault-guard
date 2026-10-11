import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { key, url } from './supabase'

/**
 * Supabase client for server components, route handlers and server actions,
 * reading the session from the request cookies. Create one per request.
 * Trust `auth.getClaims()` / `auth.getUser()`, never `getSession()`, on the server.
 *
 * Returns null when Supabase isn't configured.
 */
export async function getServerSupabase() {
  if (!url || !key) return null
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        // Server components can't set cookies; proxy.ts refreshes the session instead.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })
}
