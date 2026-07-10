'use client'

/**
 * BusinessIdentityTab: rehomes the EXISTING read cards and edit-on-behalf
 * affordances (spec merchant-360-spec.md, Tab 2). Nothing here is forked: the
 * cards and their capability gates are moved verbatim from the old detail page,
 * and each Edit / Propose button calls back to the page, which owns the dialog
 * state and mounts the existing dialog components.
 *
 * Lanes preserved:
 *   - Business identity text (name / trading name / description): Propose lane
 *     (SUPER_ADMIN `merchant:propose-edit`, routes into the B1 review queue).
 *   - Website: direct edit (`merchant:edit`).
 *   - Business registration (VAT / company): SUPER_ADMIN `merchant:edit-identity`.
 *   - Category: SUPER_ADMIN `merchant:edit-category`, hidden when locked.
 */
import { Globe, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MerchantDetail } from '@/lib/api/merchants'

interface BusinessIdentityTabProps {
  data: MerchantDetail
  canEdit: boolean
  canEditIdentity: boolean
  canEditCategory: boolean
  canProposeEdit: boolean
  onEditWebsite: () => void
  onEditIdentity: () => void
  onEditCategory: () => void
  onProposeEdit: () => void
}

export function BusinessIdentityTab({
  data,
  canEdit,
  canEditIdentity,
  canEditCategory,
  canProposeEdit,
  onEditWebsite,
  onEditIdentity,
  onEditCategory,
  onProposeEdit,
}: BusinessIdentityTabProps) {
  const { merchant } = data

  return (
    <div className="space-y-6" data-testid="workspace-identity">
      {/* On-behalf banner: every edit shows its lane, needs a reason, and is
          written to the audit trail. */}
      <div
        className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground"
        data-testid="identity-on-behalf-banner"
      >
        You act on behalf of the merchant. Every edit shows its lane (direct, Super Admin, or
        propose for approval), needs a reason, and is written to the audit trail.
      </div>

      {/* Business identity text fields (B2.5): the SENSITIVE fields, read-only.
          The Propose affordance is SUPER_ADMIN-only and routes into the B1
          review lane (it does not mutate the merchant). When an identity edit is
          already pending, the button stays visible but disabled. */}
      <section
        className="rounded-lg border border-border bg-card p-4"
        data-testid="merchant-identity-fields-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground">Business identity</h2>
            <dl className="mt-1 grid gap-1 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">Business name:</span>
                <span data-testid="merchant-business-name-value">{merchant.businessName}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">Trading name:</span>
                <span data-testid="merchant-trading-name-value">
                  {merchant.tradingName ?? 'Not set'}
                </span>
              </div>
              <div className="flex items-start gap-2 text-foreground">
                <span className="shrink-0 text-muted-foreground">Description:</span>
                <span data-testid="merchant-description-value">
                  {merchant.description ?? 'Not set'}
                </span>
              </div>
            </dl>
            {canProposeEdit && merchant.hasPendingIdentityEdit && (
              <p
                className="mt-2 text-xs text-muted-foreground"
                data-testid="merchant-identity-pending-note"
              >
                An identity edit is already awaiting review. Action that request in the approval
                queue before proposing another.
              </p>
            )}
          </div>
          {canProposeEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onProposeEdit}
              disabled={merchant.hasPendingIdentityEdit}
              data-testid="merchant-identity-propose"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Propose changes
            </Button>
          )}
        </div>
      </section>

      {/* Website card: direct edit (merchant:edit). */}
      <section className="rounded-lg border border-border bg-card p-4" data-testid="merchant-website-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground">Website</h2>
            <p className="mt-1 flex items-center gap-2 text-foreground" data-testid="merchant-website-value">
              <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{merchant.websiteUrl ?? 'Not set'}</span>
            </p>
          </div>
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEditWebsite}
              data-testid="merchant-website-edit"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>
      </section>

      {/* Business registration card (B2.2): read-only vat/company; Edit is
          SUPER_ADMIN-only. */}
      <section className="rounded-lg border border-border bg-card p-4" data-testid="merchant-identity-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground">Business registration</h2>
            <dl className="mt-1 grid gap-1 text-sm">
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">VAT number:</span>
                <span data-testid="merchant-vat-value">{merchant.vatNumber ?? 'Not set'}</span>
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <span className="text-muted-foreground">Company number:</span>
                <span data-testid="merchant-company-value">{merchant.companyNumber ?? 'Not set'}</span>
              </div>
            </dl>
          </div>
          {canEditIdentity && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEditIdentity}
              data-testid="merchant-identity-edit"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>
      </section>

      {/* Category card (B2.3): Edit is SUPER_ADMIN-only AND hidden when locked. */}
      <section className="rounded-lg border border-border bg-card p-4" data-testid="merchant-category-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground">Category</h2>
            <p className="mt-1 text-foreground" data-testid="merchant-category-value">
              {merchant.category ?? 'Not set'}
            </p>
            {merchant.categoryLocked && (
              <p className="mt-1 text-xs text-muted-foreground" data-testid="merchant-category-locked-note">
                Category is locked while this merchant has submitted or live vouchers.
              </p>
            )}
          </div>
          {canEditCategory && !merchant.categoryLocked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEditCategory}
              data-testid="merchant-category-edit"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
