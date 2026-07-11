/**
 * SelfApprovedBadge — "Self-approved" transparency badge (Team & Roles S4,
 * spec 2026-07-10-admin-capability-grants-field-role.md §5.3).
 *
 * Renders on a merchant go-live row wherever the row's `selfOnboarded` flag
 * is true: the approving admin also created the merchant's draft (a granted
 * `approval:action` holder approving their own onboarding). Self-approval is
 * ALLOWED (owner-locked), so this is pure, ungated DISPLAY — visible to
 * EVERYONE who can already see the row it decorates. It is NOT a capability
 * gate; the SUPER_ADMIN-only surface is the separate `SelfApprovedFilter`
 * NARROWING control, not this badge.
 *
 * Reuses the shared Badge's neutral tone (no new colour, no new visual
 * language). Copy is locked to exactly "Self-approved": no emoji, no em-dash.
 */
import { Badge } from './Badge'

export function SelfApprovedBadge() {
  return (
    <span data-testid="self-approved-badge">
      <Badge tone="neutral">Self-approved</Badge>
    </span>
  )
}
