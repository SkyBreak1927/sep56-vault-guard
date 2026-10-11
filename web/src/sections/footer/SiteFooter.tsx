import { footerNav, siteLinks } from '@/config/site'
import { BrandLogo } from '@/components/BrandLogo'
import { ExternalIcon, XIcon, YoutubeIcon } from '@/components/Icons'
import { SmartLink } from '@/components/SmartLink'

const socials = [
  { label: 'Aegis Vault on X', href: siteLinks.x, Icon: XIcon },
  { label: 'Aegis Vault on YouTube', href: siteLinks.youtube, Icon: YoutubeIcon },
]

export function SiteFooter() {
  return (
    <footer className="mt-section-mobile border-t border-line md:mt-section">
      <div className="shell grid grid-cols-1 gap-space-xl py-space-xl md:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
        <div className="flex max-w-md flex-col gap-space-md">
          <BrandLogo />
          <p className="text-body-md text-pretty text-muted">Conformance and security checks for SEP-56 vaults on Stellar.</p>
          <ul aria-label="Social" className="flex gap-space-xs">
            {socials.map(({ label, href, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid size-9 place-items-center rounded text-muted transition-colors duration-150 ease-out can-hover:bg-interactive can-hover:text-fg pointer-coarse:size-11"
                >
                  <Icon className="size-[18px]" />
                  <span className="sr-only">{label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {footerNav.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-space-md">
            <h2 className="text-label-sm tracking-wider text-muted uppercase">{column.title}</h2>
            <ul className="flex flex-col gap-space-sm">
              {column.links.map((link) => (
                <li key={link.label}>
                  <SmartLink
                    className="inline-flex items-center gap-1.5 text-body-md text-muted no-underline transition-colors duration-150 ease-out can-hover:text-fg"
                    href={link.href}
                    missingHint={`${link.label} link not configured`}
                  >
                    {link.label}
                    {link.offsite && <ExternalIcon className="size-3.5 flex-none" />}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="shell flex flex-wrap justify-between gap-x-space-lg gap-y-space-xs py-space-lg text-body-sm text-muted">
          <span>© 2026 Aegis Vault</span>
          <span>Not a substitute for a professional security review.</span>
        </div>
      </div>
    </footer>
  )
}
