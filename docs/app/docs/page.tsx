import { redirect } from 'next/navigation'
import { getAllDocs } from '@/lib/docs'

export default function DocsIndexPage() {
  const docs = getAllDocs()
  if (docs.length === 0) redirect('/')
  redirect(`/docs/${docs[0].slug}`)
}
