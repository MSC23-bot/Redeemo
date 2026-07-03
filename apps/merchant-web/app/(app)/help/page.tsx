import type { Metadata } from 'next'
import { ComingSoonModule } from '@/components/shell/ComingSoonModule'

export const metadata: Metadata = { title: 'Help & support · Redeemo for Business' }

// Honest placeholder (roadmap: Help & Support is gated on the support
// operating-model decision). No fabricated contact channels: support inboxes are
// not live yet (email sending is dark pre-launch), so this page promises nothing
// it cannot deliver.
export default function HelpPage() {
  return (
    <ComingSoonModule
      eyebrow="Support"
      badge="Being built"
      title="Help & support"
      intro="Guides, answers and a direct line to the Redeemo team will live here. This area is being built and will open soon."
      footnote="In the meantime, your Redeemo contact can help with anything urgent."
    />
  )
}
