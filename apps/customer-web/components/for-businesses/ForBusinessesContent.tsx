'use client'

import { ForBusinessesCinema } from './JourneyCinematic'
import { FavourSection } from './FavourSection'
import { PortalSection } from './PortalSection'
import { FinalCta } from './FinalCta'
import { merchantPortalRegisterUrl } from '@/lib/prelaunch'

export function ForBusinessesContent() {
  // Merchants register in the merchant portal, not this consumer site.
  const registerUrl = merchantPortalRegisterUrl()

  return (
    <>
      {/* ── 1-2. Hero + journey: cinematic night-street stage ── */}
      <ForBusinessesCinema registerUrl={registerUrl} />

      {/* ── 3. Everything in your favour ── */}
      <FavourSection />

      {/* ── 4. The Merchant Portal ── */}
      <PortalSection />

      {/* ── 5. Final conversion panel (owner 2026-07-17: replaces the legacy
             voucher-structure, getting-started, register-interest and final
             CTA sections) ── */}
      <FinalCta registerUrl={registerUrl} />
    </>
  )
}
