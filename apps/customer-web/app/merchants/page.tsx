import type { Metadata } from 'next'
import { MerchantHero } from '@/components/merchant-pitch/MerchantHero'
import { BenefitsGrid } from '@/components/merchant-pitch/BenefitsGrid'
import { HowMerchantsWork } from '@/components/merchant-pitch/HowMerchantsWork'
import { MerchantPricingSection } from '@/components/merchant-pitch/MerchantPricingSection'
import { MerchantSignupCta } from '@/components/merchant-pitch/MerchantSignupCta'

export const metadata: Metadata = {
  title: 'For Merchants',
  description: 'Bring local customers in at the times that suit your business. You set the offer. No commission. Every redemption verified.',
}

export default function MerchantsPage() {
  return (
    <>
      <MerchantHero />
      <BenefitsGrid />
      <HowMerchantsWork />
      <MerchantPricingSection />
      <MerchantSignupCta />
    </>
  )
}
