import { redirect } from 'next/navigation'
import { DEFAULT_DOCS_SLUG, docsHref } from '@/docs'

export default function DocsIndex() {
  redirect(docsHref(DEFAULT_DOCS_SLUG))
}
