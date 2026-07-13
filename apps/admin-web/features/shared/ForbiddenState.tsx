'use client'

/**
 * ForbiddenState: the ONE shared permission-denied surface for apps/admin-web.
 *
 * Honesty-copy sweep (prototype-fidelity audit item #13, 2026-07-13). Before
 * this sweep every gated page/section carried its own hand-copied
 * "ForbiddenState" with generic "Access denied ... Contact your
 * administrator" copy: it named neither the missing capability nor the
 * viewer's role, and its red/alert styling was visually indistinguishable
 * from a fetch failure. That is the opposite of the honesty contract the
 * merged module specs establish:
 *   - docs/superpowers/specs/2026-07-10-admin-panel-module-specs/
 *     approval-queue-spec.md §A.1 (qDenied) / §A.2 (rvDenied): grey card,
 *     lock icon, names the capability, "Nothing is broken; ask an admin".
 *   - .../merchant-360-spec.md §(d): "Permission-denied copy always names
 *     the capability + role."
 *   - .../leads-onboarding-spec.md §A2 (pipDenied) / §A4 (assistedCapDenied):
 *     role-interpolated copy, "Ask a Super Admin if you need it."
 *   - .../cross-module-notes.md §4: "permission-denied-with-capability+role"
 *     is listed as a shared construct to "build once, reuse"; §5 lists the
 *     per-screen state switcher as prototype-only (this component replaces
 *     it with the real, role-aware render).
 *
 * Canonicalisation: the spec files above phrase the reassurance clause
 * slightly differently across modules ("ask an admin" vs "ask a Super
 * Admin"; role named vs not). Per cross-module-notes §4 this is ONE shared
 * construct, so this component normalises on a single body sentence that
 * keeps every element every spec quote requires: the capability, the
 * viewer's ACTUAL role, "Nothing is broken", and a concrete next step (only
 * a Super Admin can grant capabilities via Team & Roles, so that is the
 * accurate ask everywhere).
 *
 * `capability` must be the SAME literal the call site's own `can(...)` check
 * uses, never a capability that does not actually gate the surface. Some
 * spec copy names an aspirational capability that does not exist in the
 * capability mirror (e.g. `approval:review`, `merchant:assisted-onboard`);
 * call sites pass the REAL capability they check instead (see the per-call-
 * site comments where this applies).
 *
 * Two render shapes:
 *   - `variant: 'page'` (default): the full-page centred treatment for a
 *     whole gated route.
 *   - `variant: 'section'`: a dashed-border inline panel for a single
 *     denied tab/section inside an otherwise-visible workspace (e.g. a
 *     Merchant 360 tab the viewer cannot read while the rest of the
 *     workspace renders normally).
 */
import { Lock } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import type { AdminCapability } from '@/lib/auth/session'

interface ForbiddenStatePageProps {
  variant?: 'page'
  /** A full sentence naming what is inaccessible, e.g. "You do not have
   *  access to the approval queue." or "You cannot create merchant drafts." */
  heading: string
  capability: AdminCapability
  testId: string
}

interface ForbiddenStateSectionProps {
  variant: 'section'
  /** The section/tab's own short name, e.g. "Activity", "Redemptions". */
  heading: string
  /** What the section covers, completing "You do not have access to
   *  {subject}.", e.g. "this merchant's activity". */
  subject: string
  capability: AdminCapability
  testId: string
}

type ForbiddenStateProps = ForbiddenStatePageProps | ForbiddenStateSectionProps

function bodyCopy(capability: AdminCapability, roleLabel: string, subject?: string): string {
  const core = `This needs the ${capability} capability, which your role (${roleLabel}) does not hold. Nothing is broken; ask a Super Admin if you need access.`
  return subject ? `You do not have access to ${subject}. ${core}` : core
}

export function ForbiddenState(props: ForbiddenStateProps) {
  const { role } = useSession()
  const roleLabel = role ?? 'unassigned'

  if (props.variant === 'section') {
    const body = bodyCopy(props.capability, roleLabel, props.subject)
    return (
      <section
        className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center"
        data-testid={props.testId}
      >
        <Lock className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">{props.heading}</h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">{body}</p>
      </section>
    )
  }

  const body = bodyCopy(props.capability, roleLabel)
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid={props.testId}>
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">{props.heading}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
