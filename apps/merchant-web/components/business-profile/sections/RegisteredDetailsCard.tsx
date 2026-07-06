'use client'

// Business Profile M2: the "Registered details" card (prototype 01/03) - website,
// company number, VAT number. These are the simple-DIRECT fields (M2 F3 backend
// note: they always write direct, no admin review) - the "Saves instantly" badge
// mirrors the exact style Branches' ContactCard already uses for the identical
// copy. Read-only in M2; the Edit affordance renders disabled (writing is M3/M4).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import { Card } from '@/components/ui/card'
import { DisabledEditButton } from '@/components/business-profile/DisabledEditButton'
import type { MerchantProfile } from '@/lib/api/profile'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function RegisteredDetailsCard({ profile }: { profile: MerchantProfile }) {
  return (
    <Card className="gap-4" data-testid="business-profile-registered-details-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Registered details</h2>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(15, 122, 62, 0.10)', color: 'var(--success)' }}
          >
            Saves instantly
          </span>
          <DisabledEditButton label="Edit" testId="registered-details-edit" />
        </div>
      </div>

      <div className="space-y-3 px-6">
        <Field label="Website" value={val(profile.websiteUrl)} empty="No website added" />
        <Field label="Company number" value={val(profile.companyNumber)} empty="No company number added" />
        <Field label="VAT number" value={val(profile.vatNumber)} empty="Not VAT registered" />
      </div>
    </Card>
  )
}

function Field({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {value ? (
        <p className="text-sm text-foreground">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  )
}
