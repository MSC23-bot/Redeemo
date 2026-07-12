import { HeroSection } from '@/components/landing/HeroSection'
import { AppJourneySection } from '@/components/landing/AppJourneySection'
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
      {/* The app journey: five chapters through the real customer app
          (Discovery, Merchant profile, Voucher detail, Redemption, Savings) */}
      <AppJourneySection />
      {/* The voucher shelf: vertical scroll sweeps the seven voucher types
          horizontally (desktop; mobile gets the static grid via ScrollStory) */}
      {/* How-it-works section removed from the landing page (owner
          2026-07-13: redundant against the journey cinema); the standalone
          /how-it-works page remains for the hero's secondary CTA */}
      <VoucherTypesRail />
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
