import type { Metadata } from 'next'
import { PricingContent } from '@/components/pricing/PricingContent'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Browse free, no card needed. Join from £6.99/month to use member vouchers at quality local places, and save when you visit. Cancel anytime.',
}

export default function PricingPage() {
  return <PricingContent />
}
