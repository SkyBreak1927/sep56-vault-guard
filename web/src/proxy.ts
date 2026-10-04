import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { key, url } from './lib/supabase'

/** Refreshes the Supabase session cookies on each page request, so server code sees a live session. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v))
      },
    },
  })
  // Validates the JWT and rotates expired tokens through setAll.
  await supabase.auth.getClaims()
  return response
}

export const config = {
  // Pages only: skip Next assets and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|mp4)$).*)'],
}
