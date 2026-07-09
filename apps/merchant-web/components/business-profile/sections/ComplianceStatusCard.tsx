'use client'

// Business Profile M2 + B3: the "Compliance and status" card (prototype 01/03/04)
// - the verification-state block, the merchant agreement summary + "View signed
// agreement" modal trigger, and the Documents list/upload card.
//
// Documents (B3 - Merchant Documents MVP, Option 1, SHIPPED): M2 shipped an
// honest placeholder here ("Redeemo holds your documents..."); B3 replaces it
// with the real list + OWNER-only upload affordance (DocumentsCard), reusing the
// existing storage/backend patterns (D1-D4 owner decisions, 2026-07-08).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AgreementModal } from '@/components/business-profile/sections/AgreementModal'
import { DocumentsCard } from '@/components/business-profile/sections/DocumentsCard'
import { deriveStatusPill } from '@/lib/auth/lifecycle'
import { resolveVerificationBadge } from '@/lib/business-profile/verificationBadge'
import { formatDateLabel, signatureMethodPhrase } from '@/lib/business-profile/format'
import { CheckCircle2, Clock, AlertTriangle, FileText, ExternalLink } from '@/lib/icons'
import type { MerchantProfile } from '@/lib/api/profile'

const VERIFICATION_COPY: Record<string, string> = {
  success: 'Your business has passed verification and is live to customers.',
  warning: 'We are checking your documents. You will be verified once this is complete.',
  danger_suspended: 'Your business is currently suspended. Contact Redeemo for details.',
  danger_rejected: 'Your application was not approved. Contact Redeemo for details.',
}

export function ComplianceStatusCard({ profile }: { profile: MerchantProfile }) {
  const [agreementOpen, setAgreementOpen] = useState(false)

  const state = deriveStatusPill(profile)
  const badge = resolveVerificationBadge(state)
  const BadgeIcon = badge.tone === 'success' ? CheckCircle2 : badge.tone === 'danger' ? AlertTriangle : Clock
  const verificationBody =
    badge.tone === 'danger'
      ? VERIFICATION_COPY[state === 'suspended' ? 'danger_suspended' : 'danger_rejected']
      : VERIFICATION_COPY[badge.tone]

  const agreement = profile.agreement ?? null
  const acceptedDate = formatDateLabel(agreement?.acceptedAt)
  // WF3 fix: the signed-copy and the "View signed agreement" button must derive
  // from the SAME condition, or a live merchant with a genuinely-signed contract
  // (or a transient absent-data read) can show contradictory copy: the unsigned
  // sentence AND a working "view it" button at once. `isSigned` is the single
  // source of truth both affordances below key off.
  const isSigned = Boolean(agreement && acceptedDate)

  return (
    <Card className="gap-4" data-testid="business-profile-compliance-card">
      <div className="space-y-0.5 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Compliance and status</h2>
        <p className="text-sm text-muted-foreground">
          Your verification, your merchant agreement and any documents Redeemo holds, all in one place.
        </p>
      </div>

      <div className="grid gap-4 px-6 sm:grid-cols-2">
        <div
          className="space-y-1.5 rounded-[14px] p-4"
          style={{ background: badge.bg }}
          data-testid="business-profile-verification-block"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden style={{ color: badge.fg }}>
              <BadgeIcon size={17} />
            </span>
            <p className="text-sm font-semibold" style={{ color: badge.fg }}>
              {badge.label}
            </p>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {verificationBody}
          </p>
        </div>

        <div className="space-y-1.5 rounded-[14px] p-4" style={{ background: 'var(--tint)' }}>
          <div className="flex items-center gap-2">
            <FileText size={17} aria-hidden style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-semibold text-foreground">Merchant agreement</p>
          </div>
          {isSigned ? (
            <p className="text-sm text-muted-foreground">
              Accepted version {agreement!.acceptedVersion} on {acceptedDate}{' '}
              {signatureMethodPhrase(agreement!.signatureMethod)}. This is the current version.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">You have not signed the merchant agreement yet.</p>
          )}
          {isSigned ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAgreementOpen(true)}
              data-testid="view-signed-agreement"
            >
              <ExternalLink size={14} aria-hidden /> View signed agreement
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentsCard profile={profile} />

      {agreementOpen ? <AgreementModal profile={profile} onClose={() => setAgreementOpen(false)} /> : null}
    </Card>
  )
}
