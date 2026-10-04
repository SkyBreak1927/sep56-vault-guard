import type { ReactNode } from 'react'

interface SectionProps {
  id: string
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  /** Rendered beside the heading on wide screens (e.g. an environment chip or actions). */
  aside?: ReactNode
  children?: ReactNode
}

/** Small orange label that opens a page section; the amber tick marks where each section starts. */
export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-space-sm text-label-sm tracking-[0.14em] text-accent uppercase">
      <span className="h-0.5 w-6 flex-none rounded-full bg-accent" aria-hidden="true" />
      {children}
    </p>
  )
}

/** Section headline under the eyebrow. */
export function SectionHeadline({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-headline-xl-mobile text-balance text-fg md:text-headline-xl">
      {children}
    </h2>
  )
}

/** Page section: gap, then eyebrow / headline / lede. */
export function Section({ id, eyebrow, title, lede, aside, children }: SectionProps) {
  const titleId = `${id}-title`
  return (
    <section id={id} aria-labelledby={titleId} className="shell section-gap">
      <div className="flex flex-col gap-space-lg pb-space-xl">
        <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-end">
          <div className="scroll-reveal flex max-w-3xl flex-col gap-space-sm">
            <SectionEyebrow>{eyebrow}</SectionEyebrow>
            <SectionHeadline id={titleId}>{title}</SectionHeadline>
            {lede && <div className="text-body-md text-pretty text-muted">{lede}</div>}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </section>
  )
}
