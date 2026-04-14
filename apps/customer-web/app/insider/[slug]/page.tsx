import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = { title: 'Insider Post' }

// All dynamic post routes 404 until a CMS API is connected.
// When CMS is available: fetch post by slug, render full article layout.
export default function InsiderPostPage() {
  notFound()
}
