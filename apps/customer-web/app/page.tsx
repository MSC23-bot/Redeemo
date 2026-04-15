import { HeroSection } from '@/components/landing/HeroSection'
import { VoucherTypesSection } from '@/components/landing/VoucherTypesSection'
import { TrendingPreviewSection } from '@/components/landing/TrendingPreviewSection'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { ForBusinessesBridgeSection } from '@/components/landing/ForBusinessesBridgeSection'
import { AppCtaFooterSection } from '@/components/landing/AppCtaFooterSection'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <VoucherTypesSection />
      <TrendingPreviewSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <PricingSection />
      <ForBusinessesBridgeSection />
      <AppCtaFooterSection />
    </>
  )
}
