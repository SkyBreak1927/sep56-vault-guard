import { useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { SHOWCASE_VAULTS, VAULT_ADDRESS_RE } from '@/config/checks'
import { siteLinks } from '@/config/site'
import { ArrowRightIcon, ContractIcon, ShieldCheckIcon } from '@/components/Icons'
import { Section } from '@/components/Section'
import { Select, type SelectOption } from '@/components/Select'
import { field, fieldLabel, panel, primaryButton } from '@/components/styles'
import { WalkthroughPlayer } from './WalkthroughPlayer'

const DEFAULT_HINT = 'Stellar contract address — starts with "C", 56 characters.'
const INVALID_HINT = 'Invalid address — must start with "C" and be 56 characters long.'

// Only testnet is wired up; the others are listed so the roadmap is visible.
const NETWORKS: SelectOption[] = [
  { value: 'testnet', label: 'Testnet' },
  { value: 'mainnet', label: 'Mainnet', disabled: true, hint: 'Soon' },
  { value: 'futurenet', label: 'Futurenet', disabled: true, hint: 'Soon' },
]

const DEMO_OPTIONS: SelectOption[] = SHOWCASE_VAULTS.map((vault) => ({ value: vault.address, label: vault.label }))

interface RunFormProps {
  running: boolean
  onRun: (vault: string) => void
}

export function RunForm({ running, onRun }: RunFormProps) {
  const [demo, setDemo] = useState(SHOWCASE_VAULTS[0].address)
  const [address, setAddress] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [network, setNetwork] = useState('testnet')
  // Own-vault runs stay disabled until the visitor accepts the testnet warning.
  const [consented, setConsented] = useState(false)
  // Set when Run is pressed without consent; cleared once the box is checked.
  const [consentNeeded, setConsentNeeded] = useState(false)
  const consentBox = useRef<HTMLDivElement>(null)
  const consentInput = useRef<HTMLInputElement>(null)
  // Which button started the current run, so only that one reads "Running…".
  const [source, setSource] = useState<'demo' | 'own'>('own')
  const hintId = useId()
  const demoLabelId = useId()
  const networkLabelId = useId()
  const trimmed = address.trim()
  const valid = VAULT_ADDRESS_RE.test(trimmed)
  const demoRunning = running && source === 'demo'
  const ownRunning = running && source === 'own'

  const run = (vault: string, from: 'demo' | 'own') => {
    setSource(from)
    onRun(vault)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('results')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  /** Points the visitor at the unchecked consent box: highlight, a short shake, and focus. */
  const nudgeConsent = () => {
    setConsentNeeded(true)
    consentInput.current?.focus()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) {
      consentBox.current?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
        { duration: 320, easing: 'ease-out' },
      )
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // Report both problems at once rather than one per click.
    if (!valid) setInvalid(true)
    if (!consented) nudgeConsent()
    if (!valid || !consented) return
    run(trimmed, 'own')
  }

  return (
    <Section
      id="try-it"
      eyebrow="Try Aegis Vault"
      title="Start where you are."
      lede="Explore Aegis with a test vault, or run the checks against your own."
    >
      <div className="flex flex-col gap-space-md">
        {/* Demo controls beside the walkthrough on desktop, stacked on smaller screens. */}
        <div
          className={`${panel} scroll-reveal grid grid-cols-1 gap-space-lg p-space-lg lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:p-space-md`}
        >
          <div className="flex flex-col gap-space-lg lg:justify-center lg:p-space-md">
            <PathHeading title="Just exploring?">Watch the walkthrough or run checks on a sample vault.</PathHeading>
            <div className="flex flex-col gap-space-md">
              <div className="flex max-w-md flex-col gap-space-xs">
                <label id={demoLabelId} htmlFor="demo-select" className={fieldLabel}>
                  Demo vault
                </label>
                <Select
                  id="demo-select"
                  labelId={demoLabelId}
                  value={demo}
                  options={DEMO_OPTIONS}
                  onChange={setDemo}
                  disabled={running}
                  className="h-11"
                />
              </div>
              <div className="flex flex-col items-start gap-space-sm">
                <button
                  type="button"
                  className={`${primaryButton} h-11 px-space-lg max-md:w-full`}
                  disabled={running}
                  onClick={() => run(demo, 'demo')}
                >
                  {demoRunning ? 'Running…' : 'Run demo'}
                  {!demoRunning && <ArrowRightIcon className="size-4" />}
                </button>
                <p className="text-body-sm text-muted">No contract address required.</p>
              </div>
            </div>
          </div>

          <WalkthroughPlayer src={siteLinks.walkthroughVideo} />
        </div>

        <form
          className={`${panel} scroll-reveal flex flex-col gap-space-lg p-space-lg lg:p-margin`}
          onSubmit={submit}
          noValidate
        >
          <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-start">
            <PathHeading title="Already have a vault?" video={siteLinks.checkVideo}>
              Paste your deployed SEP-56 vault address and run the full check suite.
            </PathHeading>
            <p className="flex flex-none items-center gap-space-sm">
              <span className="font-mono text-code-sm text-muted">Environment:</span>
              <span className="inline-flex items-center gap-1.5 rounded border border-line bg-surface px-2 py-1 font-mono text-code-sm text-fg">
                <span className="size-1.5 rounded-full bg-pass motion-safe:animate-pulse" aria-hidden="true" />
                Stellar Testnet
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-space-sm">
            <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_12.5rem]">
              <div className="flex flex-col gap-space-xs">
                <label htmlFor="vault-input" className={fieldLabel}>
                  Contract address
                </label>
                <div className="relative">
                  <input
                    id="vault-input"
                    type="text"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Paste your vault contract address here"
                    className={`${field} h-11 pr-9 font-mono text-code-md ${invalid ? 'border-fail-base/60' : ''}`}
                    value={address}
                    disabled={running}
                    aria-invalid={invalid || undefined}
                    aria-describedby={hintId}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      setInvalid(false)
                    }}
                  />
                  {valid ? (
                    <ShieldCheckIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-pass" />
                  ) : (
                    <ContractIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle" />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-space-xs">
                <label id={networkLabelId} htmlFor="network-select" className={fieldLabel}>
                  Network
                </label>
                <Select
                  id="network-select"
                  labelId={networkLabelId}
                  value={network}
                  options={NETWORKS}
                  onChange={setNetwork}
                  disabled={running}
                  className="h-11"
                />
              </div>

              {/* Directly above Run: in the stacked mobile layout it follows the fields; on desktop
                  the fields and Run share a row, so it moves above that row. */}
              <ConsentNotice
                className="max-lg:mt-space-sm lg:order-first lg:col-span-3 lg:mb-space-sm"
                checked={consented}
                disabled={running}
                needed={consentNeeded}
                boxRef={consentBox}
                inputRef={consentInput}
                onChange={(checked) => {
                  setConsented(checked)
                  if (checked) setConsentNeeded(false)
                }}
              />

              {/* Without consent the button stays inactive but still takes the click (aria-disabled,
                  not disabled), so pressing it can point at the consent box instead of doing nothing. */}
              <button
                type="submit"
                className={`${primaryButton} h-11 w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-50`}
                disabled={running}
                aria-disabled={!running && !consented ? true : undefined}
              >
                {ownRunning ? 'Running…' : 'Check My Vault'}
                {!ownRunning && <ArrowRightIcon className="size-4" />}
              </button>
            </div>

            <p id={hintId} className={`text-body-sm ${invalid ? 'text-fail' : 'text-muted'}`} aria-live="polite">
              {invalid ? INVALID_HINT : DEFAULT_HINT}
            </p>
            <p className="text-body-sm text-pretty text-muted">
              The 7 conformance checks make real deposit, mint, withdraw and redeem calls on the target vault with Testnet
              funds; only the four security checks use a temporary copy.
            </p>
          </div>
        </form>
      </div>
    </Section>
  )
}

/**
 * Mandatory warning above the own-vault Run button. The copy is a product claim
 * agreed with the backend owner: don't reword it without their sign-off.
 */
function ConsentNotice({
  className = '',
  checked,
  disabled,
  needed,
  boxRef,
  inputRef,
  onChange,
}: {
  className?: string
  checked: boolean
  disabled: boolean
  /** Run was pressed without consent: highlight the box and say why. */
  needed: boolean
  boxRef: Ref<HTMLDivElement>
  inputRef: Ref<HTMLInputElement>
  onChange: (checked: boolean) => void
}) {
  const headingId = useId()
  const neededId = useId()
  const tone = needed ? 'border-warn bg-warn/10' : 'border-warn/30 bg-warn/5'
  return (
    <div
      ref={boxRef}
      role="group"
      aria-labelledby={headingId}
      className={`flex flex-col gap-space-sm rounded border p-space-md transition-colors duration-150 ease-out ${tone} ${className}`}
    >
      <h4 id={headingId} className="text-label-md font-semibold text-fg">
        Before you run this
      </h4>
      <p className="text-body-sm text-pretty text-muted">
        Seven of the eleven checks interact with the vault you enter — they deposit, mint, withdraw, and redeem using
        Testnet funds, which changes that vault&apos;s state. The four security checks run against a temporary copy
        instead.
      </p>
      <p className="text-body-sm text-pretty text-fg">
        This runs on Stellar Testnet only. Never enter a Mainnet vault address.
      </p>
      <label className="flex min-h-11 cursor-pointer items-start gap-space-sm py-space-xs text-body-sm md:min-h-0 md:py-0 text-fg has-disabled:cursor-not-allowed has-disabled:opacity-60">
        <input
          ref={inputRef}
          type="checkbox"
          className="mt-0.5 size-4 flex-none cursor-pointer accent-accent disabled:cursor-not-allowed"
          checked={checked}
          disabled={disabled}
          aria-invalid={needed || undefined}
          aria-describedby={needed ? neededId : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          I understand this check deposits and withdraws Testnet funds on the vault I enter, and I have the right to
          test it.
        </span>
      </label>
      <p id={neededId} aria-live="polite" className="text-body-sm font-medium text-warn empty:hidden">
        {needed ? 'Check this box to continue.' : ''}
      </p>
    </div>
  )
}

/** YouTube watch / short / embed URL → privacy-enhanced embed URL, or undefined if it isn't one. */
function youtubeEmbed(url: string | undefined) {
  if (!url) return undefined
  const id = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1]
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : undefined
}

/** Title and copy for one way in, plus its walkthrough video once one is configured. */
function PathHeading({ title, video, children }: { title: string; video?: string; children: ReactNode }) {
  const embed = youtubeEmbed(video)
  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-col gap-space-sm">
        <h3 className="text-headline-lg-mobile text-fg md:text-headline-lg">{title}</h3>
        <p className="text-body-md text-pretty text-muted md:text-body-lg">{children}</p>
      </div>
      {embed && (
        <iframe
          src={embed}
          title={`${title} — walkthrough video`}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full max-w-xl rounded border border-line bg-canvas"
        />
      )}
    </div>
  )
}
