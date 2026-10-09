'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, type SubmitEvent } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { GithubIcon, GoogleIcon } from '@/components/Icons'
import { fieldLabel, primaryButton, raisedField, secondaryButton } from '@/components/styles'
import { getSupabase, siteUrl } from '@/lib/supabase'
import { rememberReturnTo, takeReturnTo, withNext } from '@/lib/returnTo'
import { useAuth } from '@/lib/useAuth'
import { AuthHeading, AuthIntro, AuthNotice, AuthShell, NOT_CONFIGURED, inlineLink, type Notice } from './AuthShell'

type Mode = 'sign-in' | 'sign-up'

const COPY: Record<Mode, { title?: string; prompt: string; switchLabel: string; switchHref: string; submit: string; pending: string; provider: string }> = {
  'sign-in': {
    prompt: 'New here?',
    switchLabel: 'Create an account.',
    switchHref: '/sign-up',
    submit: 'Sign in',
    pending: 'Signing in…',
    provider: 'Sign in with',
  },
  'sign-up': {
    title: 'Create an Aegis Vault account',
    prompt: 'Already have an account?',
    switchLabel: 'Sign in.',
    switchHref: '/sign-in',
    submit: 'Create account',
    pending: 'Creating account…',
    provider: 'Sign up with',
  },
}

/** Loose shape check (name@domain.tld); Supabase does the real validation. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Matches the password input's minLength and Supabase's default minimum. */
const MIN_SIGN_UP_PASSWORD = 6

/** Where OAuth sign-in and email confirmation links return to. */
const CALLBACK = '/auth/callback'

/** Sign-in / sign-up page: email + password, or Google / GitHub through Supabase Auth. */
export function AuthPage({ mode }: { mode: Mode }) {
  const copy = COPY[mode]
  const router = useRouter()
  const { user } = useAuth()
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState(false)
  const [next, setNext] = useState<string>()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // The submit button stays disabled until both fields could plausibly succeed.
  const canSubmit =
    EMAIL_RE.test(email.trim()) && (mode === 'sign-up' ? password.length >= MIN_SIGN_UP_PASSWORD : password.length > 0)
  const emailId = useId()
  const passwordId = useId()

  // Already signed in (or just signed in): nothing to do here.
  useEffect(() => {
    if (user) router.replace(takeReturnTo())
  }, [user, router])

  // Remember where the user came from (e.g. the download section) across sign-in.
  useEffect(() => {
    setNext(rememberReturnTo())
  }, [])

  const oauth = async (provider: Provider) => {
    const supabase = getSupabase()
    if (!supabase) return setNotice(NOT_CONFIGURED)
    setPending(true)
    setNotice(null)
    // On success the browser leaves for the provider, so only errors come back here.
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl(CALLBACK) } })
    if (error) {
      setPending(false)
      setNotice({ tone: 'error', text: error.message })
    }
  }

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const supabase = getSupabase()
    if (!supabase) return setNotice(NOT_CONFIGURED)
    // The disabled button already blocks this; guard against any other submit path.
    if (!canSubmit) return

    setPending(true)
    setNotice(null)
    if (mode === 'sign-in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      // Success redirects through the user effect above.
      if (error) setNotice({ tone: 'error', text: error.message })
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: siteUrl(CALLBACK) },
      })
      if (error) setNotice({ tone: 'error', text: error.message })
      // No session means the project requires email confirmation first.
      else if (!data.session) setNotice({ tone: 'info', text: `Check ${email.trim()} for a link to confirm your account.` })
    }
    setPending(false)
  }

  const switchLink = (
    <>
      {copy.prompt}{' '}
      <Link href={next ? withNext(copy.switchHref, next) : copy.switchHref} className={inlineLink}>
        {copy.switchLabel}
      </Link>
    </>
  )

  // Sign-in carries its title above the card; inside it only the sign-up link remains.
  const intro =
    mode === 'sign-in' ? (
      <AuthIntro title="Get more out of Aegis Vault.">Sign in to unlock more features, now and as we grow.</AuthIntro>
    ) : undefined

  return (
    <AuthShell intro={intro}>
      {copy.title ? (
        <AuthHeading title={copy.title}>{switchLink}</AuthHeading>
      ) : (
        <p className="text-center text-body-md text-muted">{switchLink}</p>
      )}

      <div className="grid grid-cols-2 gap-space-sm">
        <button type="button" className={`${secondaryButton} h-11`} disabled={pending} onClick={() => oauth('google')}>
          <GoogleIcon className="size-4" />
          <span>
            <span className="sr-only">{copy.provider} </span>Google
          </span>
        </button>
        <button type="button" className={`${secondaryButton} h-11`} disabled={pending} onClick={() => oauth('github')}>
          <GithubIcon className="size-4" />
          <span>
            <span className="sr-only">{copy.provider} </span>GitHub
          </span>
        </button>
      </div>

      <div className="flex items-center gap-space-sm text-label-sm tracking-wider text-subtle uppercase" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form className="flex flex-col gap-space-md" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-space-xs">
          <label htmlFor={emailId} className={fieldLabel}>
            Email
          </label>
          <input
            id={emailId}
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            className={`${raisedField} h-11`}
          />
        </div>
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-baseline justify-between gap-space-sm">
            <label htmlFor={passwordId} className={fieldLabel}>
              Password
            </label>
            {mode === 'sign-in' && (
              <Link href="/reset-password" className="text-body-sm text-muted underline-offset-4 can-hover:text-accent-hover can-hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            minLength={mode === 'sign-up' ? MIN_SIGN_UP_PASSWORD : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={`${raisedField} h-11`}
          />
        </div>
        <button type="submit" className={`${primaryButton} h-11`} disabled={pending || !canSubmit}>
          {pending ? copy.pending : copy.submit}
        </button>
      </form>

      <AuthNotice notice={notice} />
    </AuthShell>
  )
}
