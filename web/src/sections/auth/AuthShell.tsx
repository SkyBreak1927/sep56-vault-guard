import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandLogo } from '@/components/BrandLogo'
import { HeroLight } from '@/components/HeroLight'
import { panel } from '@/components/styles'

/** Page frame shared by the auth pages: logo header, optional intro, centred card, checker link. */
export function AuthShell({ intro, children }: { intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-svh flex-col">
      <HeroLight center={{ x: '50%', y: '40%' }} />

      <header className="shell relative z-1 flex h-16 items-center">
        <BrandLogo href="/" />
      </header>

      <main className="relative z-1 flex flex-1 flex-col items-center justify-center gap-space-lg px-margin-mobile py-space-xl md:px-margin">
        {intro}
        <div className={`${panel} flex w-full max-w-md flex-col gap-space-lg p-space-lg md:p-space-xl`}>{children}</div>

        <p className="max-w-md text-center text-body-sm text-pretty text-subtle">
          No account needed to run the check suite.{' '}
          <Link href="/#try-it" className="text-muted underline underline-offset-4 can-hover:text-accent-hover">
            Try the checker
          </Link>
        </p>
      </main>
    </div>
  )
}

export type Notice = { tone: 'info' | 'error'; text: ReactNode } | null

/** Result line under an auth form; errors use the fail status colours. */
export function AuthNotice({ notice }: { notice: Notice }) {
  const tone = notice?.tone === 'error' ? 'border-fail-base/20 bg-fail-base/10 text-fail' : 'border-line bg-canvas text-muted'
  return (
    <p aria-live="polite" className={`rounded border p-space-md text-body-sm text-pretty ${tone} ${notice ? '' : 'hidden'}`}>
      {notice?.text}
    </p>
  )
}

export const NOT_CONFIGURED: Notice = {
  tone: 'error',
  text: 'Sign-in isn’t configured on this deployment yet.',
}

/** Heading block at the top of an auth card. */
export function AuthHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-space-xs text-center">
      <h1 className="text-headline-lg-mobile text-balance text-fg md:text-headline-lg">{title}</h1>
      {children && <p className="text-body-md text-muted">{children}</p>}
    </div>
  )
}

/** Page title and subtitle above the auth card. */
export function AuthIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex max-w-md flex-col gap-space-sm text-center">
      <h1 className="text-headline-xl-mobile text-balance text-fg md:text-headline-xl">{title}</h1>
      <p className="text-body-md text-pretty text-muted md:text-body-lg">{children}</p>
    </div>
  )
}

export const inlineLink = 'text-fg underline-offset-4 can-hover:text-accent-hover can-hover:underline'
