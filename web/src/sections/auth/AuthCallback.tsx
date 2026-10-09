'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { authConfigured } from '@/lib/supabase'
import { takeReturnTo } from '@/lib/returnTo'
import { useAuth } from '@/lib/useAuth'
import { AuthHeading, AuthNotice, AuthShell, NOT_CONFIGURED, inlineLink, type Notice } from './AuthShell'

/** Error Supabase put on the redirect (query or hash), if any. */
function redirectError() {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  return params.get('error_description') ?? hash.get('error_description')
}

/**
 * Landing page for OAuth sign-in and email confirmation links. The Supabase
 * client exchanges the `?code=` on load; once a user appears we go back to where they started (or home).
 */
export function AuthCallback() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (user) router.replace(takeReturnTo())
  }, [user, router])

  // Loading ends once any ?code= has been exchanged; no user by then means it failed.
  const notice: Notice =
    !authConfigured ? NOT_CONFIGURED
    : user || loading ? null
    : { tone: 'error', text: redirectError() ?? 'This sign-in link is invalid or has expired.' }

  return (
    <AuthShell>
      <AuthHeading title={notice ? 'Couldn’t sign you in' : 'Signing you in…'} />
      <AuthNotice notice={notice} />
      {notice && (
        <p className="text-center text-body-md text-muted">
          <Link href="/sign-in" className={inlineLink}>
            Back to sign in
          </Link>
        </p>
      )}
    </AuthShell>
  )
}
