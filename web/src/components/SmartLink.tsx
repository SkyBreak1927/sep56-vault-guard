import type { AnchorHTMLAttributes, ReactNode } from 'react'

interface SmartLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string | undefined
  children: ReactNode
  /** Shown as a tooltip when the destination has not been configured. */
  missingHint?: string
}

const isExternal = (href: string) => /^https?:\/\//i.test(href)

/**
 * Anchor that opens external URLs in a new tab and degrades to an inert,
 * visibly-styled placeholder when its destination is not configured.
 */
export function SmartLink({ href, children, missingHint, className, ...rest }: SmartLinkProps) {
  if (!href) {
    return (
      <span
        className={className}
        data-unconfigured=""
        title={missingHint ?? 'Link not configured'}
      >
        {children}
      </span>
    )
  }

  const externalProps = isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return (
    <a href={href} className={className} {...externalProps} {...rest}>
      {children}
    </a>
  )
}
