import { redirect } from 'next/navigation'

/**
 * Authenticated landing.
 *
 * The operator's work surface is the approval queue, so the bare authenticated
 * root has no content of its own: it redirects straight to /queue. (The M1
 * "you are signed in" placeholder is retired.) Capability gating lives on the
 * destination page; a no-approval:read admin lands on /queue and sees its own
 * access-denied state rather than a dead landing.
 */
export default function DashboardPage() {
  redirect('/queue')
}
