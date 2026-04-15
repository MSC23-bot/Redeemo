import type { Metadata } from 'next'
import { InsiderContent } from '@/components/insider/InsiderContent'

export const metadata: Metadata = {
  title: 'Insider',
  description: 'Local guides, member picks, and staff recommendations from the Redeemo community.',
}

export default function InsiderPage() {
  return <InsiderContent />
}
