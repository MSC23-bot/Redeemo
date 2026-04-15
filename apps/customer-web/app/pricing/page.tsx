import type { Metadata } from 'next'
import { PricingContent } from '@/components/pricing/PricingContent'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Browse every merchant and voucher at no cost. Subscribe when you find somewhere worth visiting. From £6.99 a month.',
}

export default function PricingPage() {
  return <PricingContent />
}
