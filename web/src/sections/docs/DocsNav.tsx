'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useId, useState } from 'react'
import { ChevronDownIcon } from '@/components/Icons'
import { docsHref, type DocsNavGroup } from '@/docs'

function NavGroup({ group, pathname, onNavigate }: { group: DocsNavGroup; pathname: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState(true)
  const listId = useId()

  return (
    <li className="flex flex-col gap-space-xs">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-8 cursor-pointer items-center justify-between rounded px-space-sm text-label-sm tracking-wider text-muted uppercase transition-colors duration-150 ease-out can-hover:text-fg max-lg:min-h-11"
      >
        {group.title}
        <ChevronDownIcon
          className={`size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <ul id={listId} className={`flex flex-col gap-px ${open ? '' : 'hidden'}`}>
        {group.items.map((item) => {
          const href = 'slug' in item ? docsHref(item.slug) : item.href
          const active = 'slug' in item && pathname === href
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={[
                  'flex min-h-8 items-center rounded px-space-sm text-body-md no-underline transition-colors duration-150 ease-out max-lg:min-h-11',
                  active ? 'bg-accent/10 font-medium text-accent-hover' : 'text-muted can-hover:bg-raised can-hover:text-fg',
                ].join(' ')}
              >
                {item.title}
              </Link>
            </li>
          )
        })}
      </ul>
    </li>
  )
}

/** Docs sidebar navigation: collapsible groups, current page marked with aria-current. */
export function DocsNav({ nav, onNavigate }: { nav: DocsNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Docs">
      <ul className="flex flex-col gap-space-lg">
        {nav.map((group) => (
          <NavGroup key={group.title} group={group} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  )
}

/** Small line at the foot of the sidebar. */
export function TestnetOnly() {
  return (
    <p className="flex items-center gap-space-sm px-space-sm font-mono text-code-sm text-muted">
      <span className="size-1.5 flex-none rounded-full bg-pending" aria-hidden="true" />
      Stellar Testnet only
    </p>
  )
}
