'use client'

import Link from 'next/link'
import { useId, useState, type SubmitEvent } from 'react'
import { fieldLabel, primaryButton, raisedField } from '@/components/styles'
import { getSupabase, siteUrl } from '@/lib/supabase'
import { useAuth } from '@/lib/useAuth'
import { AuthHeading, AuthNotice, AuthShell, NOT_CONFIGURED, inlineLink, type Notice } from './AuthShell'

/**
 * Password reset. Without a session it asks for an email and sends a reset
 * link back to this page; the link signs the user in (PASSWORD_RECOVERY), and
 * the page then asks for the new password.
 */
export function ResetPassword() {
  const { user, loading, recovery } = useAuth()
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const fieldId = useId()

  const recovering = !!user && recovery

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const supabase = getSupabase()
    if (!supabase) return setNotice(NOT_CONFIGURED)
    const value = String(new FormData(e.currentTarget).get('value') ?? '')

    setPending(true)
    setNotice(null)
    if (recovering) {
      const { error } = await supabase.auth.updateUser({ password: value })
      if (error) setNotice({ tone: 'error', text: error.message })
      else setDone(true)
    } else {
      const email = value.trim()
      if (!email) {
        setPending(false)
        return setNotice({ tone: 'error', text: 'Enter your email.' })
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl('/reset-password') })
      setNotice(
        error
          ? { tone: 'error', text: error.message }
          : { tone: 'info', text: `If ${email} has an account, a reset link is on its way.` },
      )
    }
    setPending(false)
  }

  if (done) {
    return (
      <AuthShell>
        <AuthHeading title="Password updated">
          You&apos;re signed in.{' '}
          <Link href="/" className={inlineLink}>
            Go to Aegis Vault
          </Link>
        </AuthHeading>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <AuthHeading title={recovering ? 'Choose a new password' : 'Reset your password'}>
        {recovering ? (
          'Enter a new password for your account.'
        ) : (
          <>
            Remembered it?{' '}
            <Link href="/sign-in" className={inlineLink}>
              Sign in.
            </Link>
          </>
        )}
      </AuthHeading>

      <form className="flex flex-col gap-space-md" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-space-xs">
          <label htmlFor={fieldId} className={fieldLabel}>
            {recovering ? 'New password' : 'Email'}
          </label>
          <input
            key={recovering ? 'password' : 'email'}
            id={fieldId}
            name="value"
            type={recovering ? 'password' : 'email'}
            autoComplete={recovering ? 'new-password' : 'email'}
            placeholder={recovering ? undefined : 'you@example.com'}
            minLength={recovering ? 6 : undefined}
            required
            className={`${raisedField} h-11`}
          />
        </div>
        <button type="submit" className={`${primaryButton} h-11`} disabled={pending || loading}>
          {recovering ? 'Update password' : 'Send reset link'}
        </button>
      </form>

      <AuthNotice notice={notice} />
    </AuthShell>
  )
}
