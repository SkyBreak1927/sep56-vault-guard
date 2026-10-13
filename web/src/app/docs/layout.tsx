import type { Metadata } from 'next'
import { docsNav, docsSearchIndex } from '@/docs'
import { DocsHeader } from '@/sections/docs/DocsHeader'
import { DocsNav, TestnetOnly } from '@/sections/docs/DocsNav'

export const metadata: Metadata = {
  title: { template: '%s · Aegis Vault Docs', default: 'Aegis Vault Docs' },
}

/** Docs frame: sticky header, sidebar (a drawer below lg), then each page with its own "On this page". */
export default function DocsLayout({ children }: LayoutProps<'/docs'>) {
  return (
    <div className="flex min-h-svh flex-col">
      <DocsHeader nav={docsNav} search={docsSearchIndex()} />
      <div className="shell flex flex-1 gap-space-xl">
        <aside className="sticky top-16 hidden max-h-[calc(100svh-4rem)] w-60 flex-none flex-col gap-space-xl self-start overflow-y-auto border-r border-line py-space-xl pr-space-md lg:flex">
          <DocsNav nav={docsNav} />
          <div className="mt-auto">
            <TestnetOnly />
          </div>
        </aside>
        {children}
      </div>
    </div>
  )
}
