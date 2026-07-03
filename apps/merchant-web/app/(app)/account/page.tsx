import type { Metadata } from 'next'
import { ComingSoonModule } from '@/components/shell/ComingSoonModule'

export const metadata: Metadata = { title: 'My account · Redeemo for Business' }

// Honest placeholder (roadmap: My Account is a separate NOT-STARTED module).
export default function MyAccountPage() {
  return (
    <ComingSoonModule
      eyebrow="Your account"
      badge="Being built"
      title="My account"
      intro="Your personal sign-in details will be managed here: email, phone, password and signed-in devices. This area is being built and will open soon."
      footnote="If you need to change your password today, sign out and use Forgot password on the sign-in screen."
    />
  )
}
