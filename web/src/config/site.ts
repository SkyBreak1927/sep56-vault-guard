/**
 * Destinations used by the header, hero, sections and footer.
 *
 * In-page anchors default to section ids on this page. External URLs default
 * to the destinations given in the landing-page brief and can be overridden
 * through environment variables (`NEXT_PUBLIC_*`, see `.env.example`); a link
 * with no destination renders as an inert placeholder, never an invented URL.
 */
const optional = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined)

const REPO_URL = 'https://github.com/SkyBreak1927/sep56-vault-guard'

export interface NavLink {
  label: string
  href: string | undefined
  /** Third-party destination (marked with ↗ in the footer). */
  offsite?: boolean
}

export const siteLinks = {
  whyItMatters: optional(process.env.NEXT_PUBLIC_LINK_WHY_IT_MATTERS) ?? '#why-it-matters',
  tryIt: optional(process.env.NEXT_PUBLIC_LINK_TRY_IT) ?? '#try-it',
  integrate: '#integrate',
  github: optional(process.env.NEXT_PUBLIC_GITHUB_URL) ?? REPO_URL,
  sep56Spec:
    optional(process.env.NEXT_PUBLIC_SEP56_SPEC_URL) ??
    'https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0056.md',
  runChecks: optional(process.env.NEXT_PUBLIC_RUN_CHECKS_URL) ?? '#try-it',
  sep41Spec:
    optional(process.env.NEXT_PUBLIC_SEP41_SPEC_URL) ??
    'https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md',
  docs: optional(process.env.NEXT_PUBLIC_DOCS_URL) ?? `${REPO_URL}/blob/main/VAULT_CHECKS.md`,
  x: 'https://x.com/Aegis_Vault',
  youtube: 'https://www.youtube.com/@Aegis_Vault',
  /**
   * Walkthrough video beside "Just exploring?" (an .mp4 URL). Placeholder for now:
   * Blender's Sintel trailer (CC BY 3.0); swap in the real walkthrough here.
   */
  walkthroughVideo: 'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4',
  /** YouTube walkthrough for "Already have a vault?"; hidden until set. */
  checkVideo: optional(process.env.NEXT_PUBLIC_CHECK_VIDEO_URL),
} as const

/** Files in the GitHub repository. */
const repoPath = (path: string) => `${siteLinks.github.replace(/\/$/, '')}/${path}`

/**
 * Prebuilt CLI binaries (see .github/workflows/release.yml), pinned to one
 * release. The client has not cleared them for the site yet, so the download
 * buttons read "(upcoming)" until DOWNLOADS_READY is flipped.
 */
export const DOWNLOADS_READY = false
const CLI_VERSION = 'v0.2.0'

const asset = (file: string) => repoPath(`releases/download/${CLI_VERSION}/${file}`)

export const downloads = {
  windows: asset('sep56-vault-guard-windows-x86_64.zip'),
  linux: asset('sep56-vault-guard-linux-x86_64.tar.gz'),
  allReleases: repoPath('releases'),
}

/** README section the Build from Source card points to. */
export const buildGuide = repoPath('blob/main/README.md#build-from-source')

export const footerNav: { title: string; links: NavLink[] }[] = [
  {
    title: 'Protocol standards',
    links: [
      { label: 'SEP-0056 Specification', href: siteLinks.sep56Spec, offsite: true },
      { label: 'SEP-0041 Token Interface', href: siteLinks.sep41Spec, offsite: true },
    ],
  },
  {
    title: 'Security & checking',
    links: [
      { label: 'Findings & scope', href: repoPath('blob/main/SECURITY.md') },
      { label: 'Docs', href: siteLinks.docs },
    ],
  },
]

export const primaryNav: NavLink[] = [
  { label: 'Why', href: siteLinks.whyItMatters },
  { label: 'Try Now', href: siteLinks.tryIt },
  { label: 'Integrate', href: siteLinks.integrate },
]
