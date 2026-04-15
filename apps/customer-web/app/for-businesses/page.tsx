import type { Metadata } from 'next'
import { ForBusinessesContent } from '@/components/for-businesses/ForBusinessesContent'

export const metadata: Metadata = {
  title: 'List your business on Redeemo',
  description:
    'Bring in new customers. Keep your margins. List your business on Redeemo for free. No commission. No listing fees.',
}

export default function ForBusinessesPage() {
  return <ForBusinessesContent />
}
