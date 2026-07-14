import { HeroSection } from '@/components/landing/HeroSection'
import { AppJourneySection } from '@/components/landing/AppJourneySection'
import { TrendingPreviewSection } from '@/components/landing/TrendingPreviewSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { AppCtaFooterSection } from '@/components/landing/AppCtaFooterSection'
import { VoucherTypesRail } from '@/components/landing/VoucherTypesRail'
import { WhatIsRedeemoSection } from '@/components/landing/WhatIsRedeemoSection'
import { WelcomeOfferPopup } from '@/components/landing/WelcomeOfferPopup'
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
      {/* How-it-works section removed from the landing page (owner
          2026-07-13: redundant against the journey cinema); the standalone
          /how-it-works page remains for the hero's secondary CTA */}
      {/* Carries the navy background, red glow and live 3D ribbon (Redeemo
          Standard retired: it repeated the landing page; owner 2026-07-13) */}
      <VoucherTypesRail />
      {isMarketplaceLive() && <TestimonialsSection />}
      <PricingSection />
      {/* The bottom of the page used to stack three cards (waitlist ticket,
          business bridge, app panel: owner 2026-07-13, too much): the
          founding offer now greets visitors as the WelcomeOfferPopup, and
          the business invitation lives inside the footer */}
      <AppCtaFooterSection />
      {/* The founding-offer ticket as a once-per-session welcome dialog,
          with the 3D ribbon in its backdrop; carries the rollout note that
          the old locality toast used to show */}
      <WelcomeOfferPopup />
    </>
  )
}
