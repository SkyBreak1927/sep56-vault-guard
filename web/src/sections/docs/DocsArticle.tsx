import type { DocsPage } from '@/docs'
import { DocsBlocks } from './DocsBlocks'
import { DocsToc } from './DocsToc'
import { InlineText } from './InlineText'

/** One docs page: badge, title, lead, sections; "On this page" beside it on wide screens. */
export function DocsArticle({ page }: { page: DocsPage }) {
  return (
    <div className="flex min-w-0 flex-1 gap-space-xl">
      <main className="min-w-0 flex-1 py-space-xl">
        <article className="mx-auto flex max-w-3xl flex-col">
          <header className="flex flex-col gap-space-sm border-b border-line pb-space-lg">
            {page.tag && (
              <span className="inline-flex h-[22px] w-fit items-center rounded border border-accent/30 bg-accent/10 px-2 text-label-sm text-accent-hover">
                {page.tag}
              </span>
            )}
            <h1 className="text-headline-xl-mobile text-balance text-fg md:text-headline-xl">{page.title}</h1>
            <p className="text-body-lg text-pretty text-muted">
              <InlineText text={page.lead} />
            </p>
          </header>

          {page.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id} className="flex flex-col gap-space-md pt-space-xl">
              <h2
                id={section.id}
                className="scroll-mt-space-lg border-l-2 border-accent pl-space-sm text-headline-lg-mobile text-fg md:text-headline-lg"
              >
                <a href={`#${section.id}`} className="text-inherit no-underline">
                  {section.title}
                </a>
              </h2>
              {section.intro && (
                <p className="text-body-md text-pretty text-muted">
                  <InlineText text={section.intro} />
                </p>
              )}
              <DocsBlocks blocks={section.blocks} />
            </section>
          ))}
        </article>
      </main>

      <aside className="sticky top-16 hidden max-h-[calc(100svh-4rem)] w-52 flex-none self-start overflow-y-auto py-space-xl xl:block">
        <DocsToc items={page.sections.map(({ id, title }) => ({ id, title }))} />
      </aside>
    </div>
  )
}
