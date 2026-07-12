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
import { isMarketplaceLive } from '@/lib/prelaunch'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <TrendingPreviewSection />
      {/* Scroll-driven find/choose/redeem story on desktop; static sections on
          mobile, reduced-motion, and for crawlers */}
      <ScrollStory />
      <HowItWorksSection />
      {isMarketplaceLive() ? <TestimonialsSection /> : <FoundingPromiseSection />}
      <PricingSection />
      <WaitlistSection />
      <ForBusinessesBridgeSection />
      <AppCtaFooterSection />
    </>
  )
}
