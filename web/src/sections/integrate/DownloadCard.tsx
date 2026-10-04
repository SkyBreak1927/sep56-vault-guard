'use client'

import Link from 'next/link'
import { useState, type ComponentType, type SVGProps } from 'react'
import { useAuth } from '@/lib/useAuth'
import { DOWNLOADS_READY, downloads } from '@/config/site'
import { DownloadIcon, ExternalIcon, LinuxIcon, PackageIcon, WindowsIcon } from '@/components/Icons'
import { primaryButton } from '@/components/styles'
import { CardHeading, integrateCard } from './CardHeading'

type Platform = 'windows' | 'linux'

const PLATFORMS: {
  id: Platform
  label: string
  /** Architecture and archive type of the release asset. */
  meta: string
  href: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}[] = [
  { id: 'windows', label: 'Windows', meta: 'x86_64 · .zip', href: downloads.windows, Icon: WindowsIcon },
  { id: 'linux', label: 'Linux', meta: 'x86_64 · .tar.gz', href: downloads.linux, Icon: LinuxIcon },
]

/** Prebuilt binary per platform; "(upcoming)" until the client releases them (DOWNLOADS_READY). */
export function DownloadCard() {
  const [platform, setPlatform] = useState<Platform>('windows')
  const current = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0]
  const { user } = useAuth()

  return (
    <article className={integrateCard}>
      <CardHeading Icon={PackageIcon} iconClassName="text-fg" eyebrow="Ready to run" title="Download">
        Get the ready-to-use version for Windows or Linux.
      </CardHeading>

      {/* Grows to fill the card, so the download button sits right under the choice. */}
      <div role="group" aria-label="Platform" className="grid flex-1 grid-cols-2 gap-space-sm">
        {PLATFORMS.map((p) => {
          const selected = p.id === platform
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setPlatform(p.id)}
              className={`flex min-h-24 cursor-pointer flex-col items-start justify-between gap-space-md rounded border p-space-md text-left transition-colors duration-150 ease-out ${
                selected
                  ? 'border-accent bg-accent/10 text-fg'
                  : 'border-line bg-canvas text-muted can-hover:border-line-strong can-hover:text-fg'
              }`}
            >
              <p.Icon className={`size-6 ${selected ? 'text-accent' : ''}`} />
              <span className="flex flex-col gap-0.5">
                <span className="text-body-md font-medium">{p.label}</span>
                <span className="font-mono text-code-sm text-muted">{p.meta}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-space-md">
        {/* ponytail: UX gate only; the release files stay public on GitHub. A real gate needs private hosting + a server check. */}
        {DOWNLOADS_READY && !user ? (
          <Link className={`${primaryButton} h-11 px-5 text-body-md`} href="/sign-in">
            <DownloadIcon className="size-4" />
            Sign in to download
          </Link>
        ) : DOWNLOADS_READY ? (
          <a className={`${primaryButton} h-11 px-5 text-body-md`} href={current.href}>
            <DownloadIcon className="size-4" />
            Download for {current.label}
          </a>
        ) : (
          <button type="button" className={`${primaryButton} h-11 px-5 text-body-md`} disabled>
            <DownloadIcon className="size-4" />
            Download for {current.label} (upcoming)
          </button>
        )}
        {DOWNLOADS_READY && (
          <a
            className="inline-flex min-h-11 items-center gap-1 text-label-md text-accent no-underline underline-offset-4 can-hover:text-accent-hover can-hover:underline"
            href={downloads.allReleases}
            target="_blank"
            rel="noopener noreferrer"
          >
            All releases
            <ExternalIcon className="size-4" />
          </a>
        )}
      </div>
    </article>
  )
}
