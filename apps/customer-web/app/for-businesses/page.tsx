import type { Metadata } from 'next'
import { ForBusinessesContent } from '@/components/for-businesses/ForBusinessesContent'

export const metadata: Metadata = {
  title: 'List your business on Redeemo',
  description:
    'Reach local customers without paying commission. Set your own offer, choose when it runs, and track every redemption.',
}

export default function ForBusinessesPage() {
  return <ForBusinessesContent />
}
