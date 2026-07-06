'use client'

// Business Profile M2: the "Compliance and status" card (prototype 01/03/04) - the
// verification-state block, the merchant agreement summary + "View signed
// agreement" modal trigger, and an HONEST Documents placeholder.
//
// Documents (§BP-DOC, DEFERRED): the reference screenshots show a full
// upload/replace/view document list. That is explicitly OUT of M2 scope per the
// build brief - M2 does not invent a document list or wire any upload/request UI.
// This card instead shows the same calm, honest placeholder line the brief
// specifies. Do NOT add upload/list affordances here without a dedicated
// §BP-DOC slice.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AgreementModal } from '@/components/business-profile/sections/AgreementModal'
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
          {agreement && acceptedDate ? (
            <p className="text-sm text-muted-foreground">
              Accepted version {agreement.acceptedVersion} on {acceptedDate}{' '}
              {signatureMethodPhrase(agreement.signatureMethod)}. This is the current version.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">You have not signed the merchant agreement yet.</p>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setAgreementOpen(true)}
            data-testid="view-signed-agreement"
          >
            <ExternalLink size={14} aria-hidden /> View signed agreement
          </Button>
        </div>
      </div>

      <div className="space-y-3 border-t border-border px-6 pt-4">
        <div className="flex items-start gap-2.5">
          <FileText size={16} aria-hidden style={{ color: 'var(--text-tertiary)', marginTop: 2 }} />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">Documents</p>
            <p className="text-sm text-muted-foreground" data-testid="documents-placeholder">
              Redeemo holds your documents. We will ask here if we need something specific.
            </p>
          </div>
        </div>
      </div>

      {agreementOpen ? <AgreementModal profile={profile} onClose={() => setAgreementOpen(false)} /> : null}
    </Card>
  )
}
