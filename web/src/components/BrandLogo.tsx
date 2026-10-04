import Link from 'next/link'
import logo from '@/assets/logo-dark.svg'

/**
 * Logo used by the header, footer and auth pages: the official dark-background Aegis
 * Vault lockup (mark + wordmark, client Drive folder).
 */
export function BrandLogo({ href = '#top' }: { href?: string }) {
  return (
    <Link className="inline-flex w-fit flex-none items-center no-underline" href={href} aria-label="Aegis Vault home">
      {/* Plain <img>: the static import already carries the basePath, and an SVG gains nothing from next/image. */}
      <img src={logo.src} width={logo.width} height={logo.height} alt="" className="block h-7 w-auto md:h-8" />
    </Link>
  )
}
