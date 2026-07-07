import { HeroSection } from '@/components/landing/HeroSection'
import { ScrollStory } from '@/components/landing/ScrollStory'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { TrendingPreviewSection } from '@/components/landing/TrendingPreviewSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { FoundingPromiseSection } from '@/components/landing/FoundingPromiseSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { WaitlistSection } from '@/components/landing/WaitlistSection'
import { ForBusinessesBridgeSection } from '@/components/landing/ForBusinessesBridgeSection'
import { AppCtaFooterSection } from '@/components/landing/AppCtaFooterSection'
import { VoucherRibbon } from '@/components/landing/VoucherRibbon'
import { isMarketplaceLive } from '@/lib/prelaunch'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      {/* The logo's voucher-ribbon motif flowing between sections (owner
          direction 2026-07-07); two mounts only, restraint on purpose */}
      <VoucherRibbon />
      <TrendingPreviewSection />
      {/* Scroll-driven find/choose/redeem story on desktop; static sections on
          mobile, reduced-motion, and for crawlers */}
      <ScrollStory />
      <HowItWorksSection />
      <VoucherRibbon flip />
      {isMarketplaceLive() ? <TestimonialsSection /> : <FoundingPromiseSection />}
      <PricingSection />
      <WaitlistSection />
      <ForBusinessesBridgeSection />
      <AppCtaFooterSection />
    </>
  )
}
