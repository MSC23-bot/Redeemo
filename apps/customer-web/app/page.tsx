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
import { RibbonBand } from '@/components/landing/RibbonBand'
import { VoucherTypesRail } from '@/components/landing/VoucherTypesRail'
import { WhatIsRedeemoSection } from '@/components/landing/WhatIsRedeemoSection'
import { isMarketplaceLive } from '@/lib/prelaunch'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      {/* The logo's voucher-ribbon motif as the section seam (owner direction
          2026-07-07); two mounts only, restraint on purpose. The colours are
          the adjoining sections' backgrounds: the ribbon IS the break. */}
      <RibbonBand topColor="#FFF9F5" bottomColor="#FFFFFF" />
      {/* The definition: a cold visitor learns what Redeemo IS before the
          product cinema and social proof */}
      <WhatIsRedeemoSection />
      <TrendingPreviewSection />
      {/* Scroll-driven find/choose/redeem story on desktop; static sections on
          mobile, reduced-motion, and for crawlers */}
      <ScrollStory />
      {/* The voucher shelf: vertical scroll sweeps the seven voucher types
          horizontally (desktop; mobile gets the static grid via ScrollStory) */}
      <VoucherTypesRail />
      <HowItWorksSection />
      <RibbonBand flip topColor="#FAFAF8" bottomColor="#010C35" />
      {isMarketplaceLive() ? <TestimonialsSection /> : <FoundingPromiseSection />}
      <PricingSection />
      <WaitlistSection />
      <ForBusinessesBridgeSection />
      <AppCtaFooterSection />
    </>
  )
}
