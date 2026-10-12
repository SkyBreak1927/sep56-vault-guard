import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { allDocsPages, getDocsPage } from '@/docs'
import { DocsArticle } from '@/sections/docs/DocsArticle'

// Only the pages in src/docs exist; any other slug is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return allDocsPages().map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: PageProps<'/docs/[slug]'>): Promise<Metadata> {
  const page = getDocsPage((await params).slug)
  return page ? { title: page.title, description: page.lead } : {}
}

export default async function DocsSlugPage({ params }: PageProps<'/docs/[slug]'>) {
  const page = getDocsPage((await params).slug)
  if (!page) notFound()
  return <DocsArticle page={page} />
}
