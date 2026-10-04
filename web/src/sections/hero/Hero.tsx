import { siteLinks } from '@/config/site'
import { HeroFeatures } from './HeroFeatures'
import { HeroLight } from '@/components/HeroLight'
import { ArrowRightIcon, ExternalIcon } from '@/components/Icons'
import { SmartLink } from '@/components/SmartLink'
import { primaryButton } from '@/components/styles'
import { VaultSphereArt } from './VaultSphereArt'

export function Hero() {
  return (
    // Full-bleed dark band; content stays in the 1440px shell. Pulled up under the
    // sticky header (64px + 1px border) so the backdrop shows through it.
    <div
      data-hero
      className="relative isolate -mt-[calc(4rem+1px)] flex min-h-svh flex-col overflow-hidden pt-[calc(4rem+1px)]"
    >
      <HeroLight />
      <section className="shell relative z-1 flex flex-1 flex-col" aria-labelledby="hero-title">
        <div className="grid flex-1 grid-cols-1 items-center gap-space-lg pt-space-xl pb-space-sm lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-gutter lg:py-8">
          <div className="relative z-1">
            <p className="flex items-start gap-2.5 text-label-sm tracking-[0.14em] text-accent uppercase">
              {/* Pinned to the first line so it stays put when the line wraps on mobile. */}
              <span className="mt-[0.4em] size-1.5 flex-none rounded-full bg-accent" aria-hidden="true" />
              Conformance and security checks for SEP-56 vaults on Stellar.
            </p>
            <h1 id="hero-title" className="mt-space-xl text-display text-fg">
              Built for
              <br />
              safer vaults.
            </h1>
            <p className="mt-space-xl max-w-[38rem] text-[1.0625rem] leading-8 text-pretty text-muted">
              Aegis Vault helps developers test core vault functions and common security risks before their vault reaches
              users — with clear results in minutes.
            </p>

            <div className="mt-space-xl flex flex-wrap items-center gap-x-space-lg gap-y-space-sm">
              <SmartLink className={`${primaryButton} h-11 px-5 text-body-md`} href={siteLinks.runChecks}>
                Get started
                <ArrowRightIcon className="size-4" />
              </SmartLink>
              <SmartLink
                className="group inline-flex h-11 items-center gap-1.5 rounded px-1 text-body-md font-medium text-fg no-underline underline-offset-4 transition-colors duration-150 ease-out can-hover:text-accent-hover can-hover:underline"
                href={siteLinks.sep56Spec}
                missingHint="Set NEXT_PUBLIC_SEP56_SPEC_URL to link the specification"
              >
                Read SEP-56
                <ExternalIcon className="size-4 text-muted transition-colors group-hover:text-current" />
              </SmartLink>
            </div>

            <HeroFeatures />
          </div>

          <VaultSphereArt />
        </div>
      </section>
    </div>
  )
}
