'use client'

import { useEffect, useState } from 'react'

interface TocItem {
  id: string
  title: string
}

/** "On this page": the page's H2s; the one being read is highlighted as you scroll. */
export function DocsToc({ items }: { items: TocItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id)

  useEffect(() => {
    const headings = items.map((item) => document.getElementById(item.id)).filter((el): el is HTMLElement => !!el)
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        // Topmost heading in the reading band; keep the last one while between headings.
        const first = items.find((item) => visible.has(item.id))
        if (first) setCurrent(first.id)
      },
      // Band from under the sticky header down to ~40% of the viewport.
      { rootMargin: '-64px 0px -60% 0px' },
    )
    headings.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  if (!items.length) return null

  return (
    <nav aria-label="On this page" className="flex flex-col gap-space-sm">
      <p className="px-space-sm text-label-sm tracking-wider text-muted uppercase">On this page</p>
      <ul className="flex flex-col gap-px">
        {items.map((item) => {
          const active = item.id === current
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                onClick={() => setCurrent(item.id)}
                className={[
                  'flex min-h-7 items-center rounded px-space-sm py-space-xs text-body-sm no-underline transition-colors duration-150 ease-out',
                  active ? 'bg-accent/10 text-accent-hover' : 'text-muted can-hover:text-fg',
                ].join(' ')}
              >
                {item.title}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
