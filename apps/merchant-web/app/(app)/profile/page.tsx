import type { Metadata } from 'next'
import { ComingSoonModule } from '@/components/shell/ComingSoonModule'

export const metadata: Metadata = { title: 'Business profile · Redeemo for Business' }

// Honest placeholder (roadmap: Business-profile day-2 settings is a separate
// NOT-STARTED module). This route exists so the sidebar + account menu never
// point at a dead link; it makes no working-feature claims.
export default function BusinessProfilePage() {
  return (
    <ComingSoonModule
      eyebrow="Your business"
      badge="Being built"
      title="Business profile"
      intro="Manage your public profile, business details and documents from here. This area is being built and will open soon."
      footnote="Until it opens, your onboarding profile stays as submitted. Contact Redeemo if something needs correcting urgently."
    />
  )
}
