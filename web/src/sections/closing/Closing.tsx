import { siteLinks } from '@/config/site'
import { ArrowRightIcon } from '@/components/Icons'
import { SmartLink } from '@/components/SmartLink'
import { primaryButton } from '@/components/styles'
import { ClosingParticles } from './ClosingParticles'

/** Last call to action before the footer. */
export function Closing() {
  return (
    // The -z-10 layers paint in DOM order: dark base, glow, then grain and particles.
    <section aria-labelledby="closing-title" className="relative flex min-h-[75svh] flex-col justify-center py-20 md:py-24">
      {/* Runs down to the footer line, so the dark ends at a border rather than a seam. */}
      <div className="closing-base closing-fade pointer-events-none absolute inset-x-0 top-0 -bottom-section-mobile -z-10 md:-bottom-section" aria-hidden="true" />

      <div className="relative">
        {/* Anchored to the copy, so it stays behind it however the headline wraps. */}
        <div className="closing-glow pointer-events-none absolute -z-10" aria-hidden="true" />
        <div className="shell closing-reveal flex flex-col items-center text-center">
          <h2 id="closing-title" className="max-w-4xl text-display-closing text-balance text-fg">
            Your vault deserves <br className="max-md:hidden" />a second look.
          </h2>
          <p className="mt-space-lg text-[1.0625rem] leading-7 text-pretty text-muted md:text-[1.1875rem]">
            Run the checks before it reaches users.
          </p>
          <SmartLink
            className={`${primaryButton} group mt-8 h-14 min-w-44 gap-3 rounded-lg px-8 text-body-lg focus-visible:outline-offset-4`}
            href={siteLinks.runChecks}
          >
            Try now
            <ArrowRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.75 motion-reduce:transition-none" />
          </SmartLink>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 -bottom-section-mobile -z-10 overflow-hidden md:-bottom-section" aria-hidden="true">
        {/* Grain over the glow, so its gradient dithers instead of banding. */}
        <div className="ambient-grain closing-fade absolute inset-0" />
        <ClosingParticles />
      </div>
    </section>
  )
}
