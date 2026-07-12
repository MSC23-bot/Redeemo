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
import { VoucherTypesRail } from '@/components/landing/VoucherTypesRail'
import { WhatIsRedeemoSection } from '@/components/landing/WhatIsRedeemoSection'
import { LaunchLocalityToast } from '@/components/landing/LaunchLocalityToast'
import { isMarketplaceLive } from '@/lib/prelaunch'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      {/* The definition: a cold visitor learns what Redeemo IS before the
          product cinema and social proof. Break ribbons removed (owner
          2026-07-12): the ribbon lives in the live 3D scenes and side peeks */}
      <WhatIsRedeemoSection />
      <TrendingPreviewSection />
      {/* Scroll-driven find/choose/redeem story on desktop; static sections on
          mobile, reduced-motion, and for crawlers */}
      <ScrollStory />
      {/* The voucher shelf: vertical scroll sweeps the seven voucher types
          horizontally (desktop; mobile gets the static grid via ScrollStory) */}
      <VoucherTypesRail />
      <HowItWorksSection />
      {isMarketplaceLive() ? <TestimonialsSection /> : <FoundingPromiseSection />}
      <PricingSection />
      <WaitlistSection />
      <ForBusinessesBridgeSection />
      <AppCtaFooterSection />
      {/* Quiet rollout note: starts in Huddersfield; dismissible, session-scoped */}
      <LaunchLocalityToast />
    </>
  )
}
