import { PageAmbience } from '@/components/Ambience'
import { Closing } from '@/sections/closing/Closing'
import { SiteFooter } from '@/sections/footer/SiteFooter'
import { NavBar } from '@/sections/header/NavBar'
import { Hero } from '@/sections/hero/Hero'
import { Integrate } from '@/sections/integrate/Integrate'
import { VaultChecker } from '@/sections/vault-checker/VaultChecker'
import { WhyItMatters } from '@/sections/why-it-matters/WhyItMatters'

export default function Home() {
  return (
    // One stacking context for the page, so every section's backdrop sits behind all
    // content; clipped so glows reaching past the page never add scroll.
    <div id="top" className="relative isolate overflow-clip">
      <PageAmbience />
      <NavBar />
      <main>
        <Hero />
        <WhyItMatters />
        <VaultChecker />
        <Integrate />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
