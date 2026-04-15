import type { Metadata } from 'next'
import { HowItWorksContent } from '@/components/how-it-works/HowItWorksContent'

export const metadata: Metadata = {
  title: 'How It Works',
  description:
    'Browse for free. Subscribe when you are ready. Show your phone in the venue. That is it.',
}

export default function HowItWorksPage() {
  return <HowItWorksContent />
}
