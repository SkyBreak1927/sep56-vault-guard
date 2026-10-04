import { CHECK_DEFS, CHECK_GROUPS } from '@/config/checks'
import { siteLinks } from '@/config/site'
import { ArrowRightIcon, ShieldCheckIcon } from '@/components/Icons'
import { SmartLink } from '@/components/SmartLink'
import { fieldLabel } from '@/components/styles'

/** Checks previewed per group; the full list is one click away in the docs. */
const PREVIEW = 4

/** Shown before the first run: explains what appears here and previews the suite that will run. */
export function ReportEmptyState() {
  return (
    <div className="flex flex-col gap-space-lg rounded-lg border border-dashed border-line-strong p-space-lg lg:flex-row lg:items-center lg:gap-0 lg:p-margin">
      <div className="flex items-center gap-space-md lg:w-sm lg:flex-none lg:pr-space-xl">
        <span className="grid size-12 flex-none place-items-center rounded-md border border-line bg-surface text-muted">
          <ShieldCheckIcon className="size-6" />
        </span>
        <div className="flex flex-col gap-space-xs">
          <h3 className="text-headline-md text-fg">No report yet</h3>
          <p className="text-body-md text-pretty text-muted">Run a demo or check your vault to see results.</p>
        </div>
      </div>

      {CHECK_GROUPS.map((group) => {
        const defs = CHECK_DEFS.filter((def) => def.group === group.id)
        return (
          <div
            key={group.id}
            className="flex flex-col gap-space-sm border-t border-line pt-space-lg lg:flex-1 lg:self-stretch lg:border-t-0 lg:border-l lg:px-space-xl lg:pt-0"
          >
            <h4 className={fieldLabel}>
              {group.title} ({defs.length})
            </h4>
            <ul className="flex list-disc flex-col gap-1 pl-space-md text-body-md text-muted marker:text-subtle">
              {defs.slice(0, PREVIEW).map((def) => (
                <li key={def.id}>{def.name}</li>
              ))}
            </ul>
          </div>
        )
      })}

      <div className="border-t border-line pt-space-lg lg:flex lg:items-center lg:self-stretch lg:border-t-0 lg:border-l lg:pt-0 lg:pl-space-xl">
        <SmartLink
          href={siteLinks.docs}
          className="inline-flex items-center gap-space-sm text-label-md whitespace-nowrap text-accent no-underline transition-colors duration-150 ease-out can-hover:text-accent-hover"
        >
          View all {CHECK_DEFS.length} checks
          <ArrowRightIcon className="size-4" />
        </SmartLink>
      </div>
    </div>
  )
}
