import type { ComponentType, ReactNode, SVGProps } from 'react'
import { panel } from '@/components/styles'

interface CardHeadingProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Icon colour; amber unless the mark has its own (e.g. GitHub's in white). */
  iconClassName?: string
  eyebrow: string
  title: string
  children: ReactNode
}

/** Integrate card: a plain panel. */
export const integrateCard = `${panel} scroll-reveal flex flex-col gap-space-lg p-space-lg`

/** Icon, small amber label, title and one line of copy at the top of an Integrate card. */
export function CardHeading({ Icon, iconClassName = 'text-accent', eyebrow, title, children }: CardHeadingProps) {
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex items-start gap-space-md">
        <Icon className={`mt-0.5 size-7 flex-none ${iconClassName}`} />
        <div className="flex flex-col gap-space-xs">
          <p className="text-label-sm tracking-[0.14em] text-accent uppercase">{eyebrow}</p>
          <h3 className="text-headline-lg-mobile text-fg md:text-headline-lg">{title}</h3>
        </div>
      </div>
      <p className="text-body-md text-pretty text-muted">{children}</p>
    </div>
  )
}
