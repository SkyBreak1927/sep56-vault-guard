import { buildGuide, siteLinks } from "@/config/site";
import { SectionAmbience } from "@/components/Ambience";
import { CopyButton } from "@/components/CopyButton";
import { ExternalIcon, GithubIcon } from "@/components/Icons";
import { Section } from "@/components/Section";
import { secondaryButton } from "@/components/styles";
import { CardHeading, integrateCard } from "./CardHeading";
import { DownloadCard } from "./DownloadCard";

const BUILD_COMMANDS = [
  `git clone ${siteLinks.github}.git`,
  "cd sep56-vault-guard",
  "cargo build --release -p sep56-vault-guard",
];

const textLink =
  "inline-flex min-h-11 items-center gap-1 text-label-md text-accent no-underline underline-offset-4 can-hover:text-accent-hover can-hover:underline";

/** Running the CLI locally: download a release or build from source. */
export function Integrate() {
  return (
    // Content height only, so the final CTA follows at the normal section gap.
    <div className="relative">
      <SectionAmbience glow="integrate-glow" grid="integrate-grid" />
      <Section
        id="integrate"
        eyebrow="Integrate"
        title="Keep us close while you build."
        lede="Run it locally and check your vault throughout development."
      >
        <div className="grid grid-cols-1 gap-grid lg:grid-cols-2">
          <DownloadCard />

          <article className={integrateCard}>
            <CardHeading
              Icon={GithubIcon}
              iconClassName="text-fg"
              eyebrow="For developers"
              title="Build from Source"
            >
              Clone the code from GitHub and build it on your machine.
            </CardHeading>

            <div className="overflow-hidden rounded border border-line bg-canvas">
              <div className="flex items-center justify-between border-b border-line px-space-md py-space-xs">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-fail/80" />
                  <span className="size-2.5 rounded-full bg-warn/80" />
                  <span className="size-2.5 rounded-full bg-pass/80" />
                </span>
                <CopyButton
                  value={BUILD_COMMANDS.join("\n")}
                  label="Copy"
                  showLabel
                />
              </div>
              <pre className="overflow-x-auto px-space-md py-space-md font-mono text-code-md text-fg">
                {BUILD_COMMANDS.map((line) => (
                  <div key={line}>
                    <span
                      className="text-subtle select-none"
                      aria-hidden="true"
                    >
                      ${" "}
                    </span>
                    {line}
                  </div>
                ))}
              </pre>
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-space-md">
              <a
                className={textLink}
                href={buildGuide}
                target="_blank"
                rel="noopener noreferrer"
              >
                Build guide
                <ExternalIcon className="size-4" />
              </a>
            </div>
          </article>
        </div>
      </Section>
    </div>
  );
}
