import { HeroSection } from '@/components/landing/HeroSection'
import { VoucherTypesSection } from '@/components/landing/VoucherTypesSection'
import { TrendingPreviewSection } from '@/components/landing/TrendingPreviewSection'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { FoundingPromiseSection } from '@/components/landing/FoundingPromiseSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { WaitlistSection } from '@/components/landing/WaitlistSection'
import { ForBusinessesBridgeSection } from '@/components/landing/ForBusinessesBridgeSection'
import { AppCtaFooterSection } from '@/components/landing/AppCtaFooterSection'
import { isMarketplaceLive } from '@/lib/prelaunch'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <VoucherTypesSection />
      <TrendingPreviewSection />
      <HowItWorksSection />
      {isMarketplaceLive() ? <TestimonialsSection /> : <FoundingPromiseSection />}
      <PricingSection />
      <WaitlistSection />
      <ForBusinessesBridgeSection />
      <AppCtaFooterSection />
    </>
  )
}
