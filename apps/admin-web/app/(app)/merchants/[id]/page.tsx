'use client'

/**
 * Merchant detail page: /merchants/[id] (Option B B2.1).
 *
 * Gated on the `merchant:read` capability (matching the directory + the read
 * route). Shows the merchant record and its branches read-only; the Edit
 * affordances (website card Edit + per-branch Edit) additionally gate on
 * `merchant:edit`, so a read-only admin browses the detail without edit buttons.
 *
 * The two edit dialogs (website + branch) are mounted at page level keyed by the
 * open intent + selected branch. On success they invalidate this merchant's
 * detail (the hook re-reads the new value) and the directory list.
 *
 * Backend `requireAdminCapability` stays the enforcement; the client gate is UX.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Globe,
  Mail,
  Phone,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useMerchantDetail } from '@/lib/merchants/useMerchantDetail'
import { Badge } from '@/features/shared/Badge'
import { Button } from '@/components/ui/button'
import { EditMerchantWebsiteDialog } from '@/features/merchants/EditMerchantWebsiteDialog'
import { EditBranchDialog } from '@/features/merchants/EditBranchDialog'
import { EditMerchantIdentityDialog } from '@/features/merchants/EditMerchantIdentityDialog'
import { ProposeMerchantEditDialog } from '@/features/merchants/ProposeMerchantEditDialog'
import { EditCategoryDialog } from '@/features/merchants/EditCategoryDialog'
import { AddBranchDialog } from '@/features/merchants/AddBranchDialog'
import { DeleteBranchConfirm } from '@/features/merchants/DeleteBranchConfirm'
import type { BadgeTone } from '@/features/shared/Badge'
import type { BranchDetail } from '@/lib/api/merchants'

// ── Badge label/tone helpers (mirror MerchantsTable) ──────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    PENDING_APPROVAL: 'Pending approval',
    REGISTERED: 'Registered',
    INACTIVE: 'Inactive',
    DELETED: 'Deleted',
  }
  return map[status] ?? status
}

function statusTone(status: string): BadgeTone {
  if (status === 'ACTIVE') return 'success'
  if (status === 'SUSPENDED') return 'danger'
  if (status === 'PENDING_APPROVAL') return 'warn'
  return 'neutral'
}

function verificationLabel(status: string): string {
  if (status === 'VERIFIED') return 'Verified'
  if (status === 'REJECTED') return 'Rejected'
  if (status === 'PENDING') return 'Pending'
  if (status === 'NOT_SUBMITTED') return 'Not submitted'
  return status
}

function verificationTone(status: string): BadgeTone {
  if (status === 'VERIFIED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING') return 'warn'
  return 'neutral'
}

// ── States ────────────────────────────────────────────────────────────────────

function ForbiddenState() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center" data-testid="merchant-detail-forbidden">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mb-2 text-lg font-semibold text-foreground">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view merchant details. Contact your administrator.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="merchant-detail-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
      data-testid="merchant-detail-error"
    >
      <AlertCircle className="mx-auto mb-3 size-6 text-destructive" aria-hidden="true" />
      <p className="mb-4 text-sm text-destructive">
        Could not load this merchant. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm font-medium text-primary hover:underline"
      >
        Retry
      </button>
    </div>
  )
}

// ── Branch card ───────────────────────────────────────────────────────────────

function addressSummary(branch: BranchDetail): string {
  return [branch.addressLine1, branch.addressLine2, branch.city, branch.postcode]
    .filter((part) => part != null && part !== '')
    .join(', ')
}

function BranchCard({
  branch,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
}: {
  branch: BranchDetail
  canEdit: boolean
  onEdit: (branch: BranchDetail) => void
  // B2.4: per-branch delete affordance, gated on merchant:manage-branches and
  // hidden on the main branch (the backend BRANCH_IS_MAIN guard is the enforcement).
  canDelete: boolean
  onDelete: (branch: BranchDetail) => void
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid={`branch-card-${branch.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-foreground">{branch.name}</h3>
            {branch.isMainBranch && <Badge tone="info">Main</Badge>}
            <Badge tone={branch.isActive ? 'success' : 'neutral'}>
              {branch.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{addressSummary(branch) || 'No address on file'}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {branch.localityName ? `${branch.localityName} · ` : ''}
            {branch.locationConfidence}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(branch)}
              data-testid={`branch-edit-${branch.id}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
          {canDelete && !branch.isMainBranch && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDelete(branch)}
              data-testid={`branch-delete-${branch.id}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Contact rows */}
      <dl className="mt-3 grid gap-1.5 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span data-testid={`branch-phone-${branch.id}`}>{branch.phone ?? 'Not set'}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span data-testid={`branch-email-${branch.id}`}>{branch.email ?? 'Not set'}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span data-testid={`branch-website-${branch.id}`}>{branch.websiteUrl ?? 'Not set'}</span>
        </div>
      </dl>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type OpenDialog =
  | { kind: 'website' }
  | { kind: 'identity' }
  | { kind: 'propose-edit' }
  | { kind: 'category' }
  | { kind: 'branch'; branch: BranchDetail }
  | { kind: 'add-branch' }
  | { kind: 'delete-branch'; branch: BranchDetail }
  | null

export default function MerchantDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const { ready, can } = useSession()
  const canRead = ready && can('merchant:read')
  const canEdit = can('merchant:edit')
  // B2.2: identity edits are SUPER_ADMIN-only (merchant:edit-identity), a higher
  // bar than the merchant:edit website/branch edits.
  const canEditIdentity = can('merchant:edit-identity')
  // B2.3: category edits are SUPER_ADMIN-only (merchant:edit-category).
  const canEditCategory = can('merchant:edit-category')
  // B2.4: branch create/delete are SUPER_ADMIN-only (merchant:manage-branches).
  const canManageBranches = can('merchant:manage-branches')
  // B2.5: proposing sensitive identity edits is SUPER_ADMIN-only
  // (merchant:propose-edit). Routes into the B1 review lane, not a direct edit.
  const canProposeEdit = can('merchant:propose-edit')

  const { data, isLoading, isError, refetch } = useMerchantDetail(id, canRead)

  const [dialog, setDialog] = useState<OpenDialog>(null)

  if (!ready) {
    return <LoadingState />
  }
  if (!can('merchant:read')) {
    return <ForbiddenState />
  }

  function closeDialog() {
    setDialog(null)
  }
  function onDialogSuccess() {
    setDialog(null)
    void refetch()
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb / back link */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/merchants"
          className="flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Back to merchants directory"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span>Merchants</span>
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-foreground">
          {data?.merchant.businessName ?? 'Merchant'}
        </span>
      </nav>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          {/* Read-only header */}
          <header className="rounded-lg border border-border bg-card p-6" data-testid="merchant-detail-header">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-foreground">
                  {data.merchant.businessName}
                </h1>
                {data.merchant.tradingName && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Trading as {data.merchant.tradingName}
                  </p>
                )}
                {data.merchant.category && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{data.merchant.category}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(data.merchant.status)}>
                  {statusLabel(data.merchant.status)}
                </Badge>
                <Badge tone={verificationTone(data.merchant.verificationStatus)}>
                  {verificationLabel(data.merchant.verificationStatus)}
                </Badge>
              </div>
            </div>
          </header>

          {/* Business identity card (B2.5): the SENSITIVE identity text fields,
              read-only. The Propose affordance is SUPER_ADMIN-only and routes
              into the B1 review lane (it does not mutate the merchant). When an
              identity edit is already pending, the button stays visible but
              disabled with a pointer to the approval queue. */}
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
                    <span data-testid="merchant-business-name-value">{data.merchant.businessName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="text-muted-foreground">Trading name:</span>
                    <span data-testid="merchant-trading-name-value">
                      {data.merchant.tradingName ?? 'Not set'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-foreground">
                    <span className="shrink-0 text-muted-foreground">Description:</span>
                    <span data-testid="merchant-description-value">
                      {data.merchant.description ?? 'Not set'}
                    </span>
                  </div>
                </dl>
                {canProposeEdit && data.merchant.hasPendingIdentityEdit && (
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
                  onClick={() => setDialog({ kind: 'propose-edit' })}
                  disabled={data.merchant.hasPendingIdentityEdit}
                  data-testid="merchant-identity-propose"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Propose changes
                </Button>
              )}
            </div>
          </section>

          {/* Website card */}
          <section
            className="rounded-lg border border-border bg-card p-4"
            data-testid="merchant-website-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-muted-foreground">Website</h2>
                <p
                  className="mt-1 flex items-center gap-2 text-foreground"
                  data-testid="merchant-website-value"
                >
                  <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>{data.merchant.websiteUrl ?? 'Not set'}</span>
                </p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'website' })}
                  data-testid="merchant-website-edit"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Button>
              )}
            </div>
          </section>

          {/* Business registration card (B2.2): read-only vat/company for every
              merchant:read admin; the Edit affordance is SUPER_ADMIN-only. */}
          <section
            className="rounded-lg border border-border bg-card p-4"
            data-testid="merchant-identity-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-muted-foreground">Business registration</h2>
                <dl className="mt-1 grid gap-1 text-sm">
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="text-muted-foreground">VAT number:</span>
                    <span data-testid="merchant-vat-value">{data.merchant.vatNumber ?? 'Not set'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="text-muted-foreground">Company number:</span>
                    <span data-testid="merchant-company-value">{data.merchant.companyNumber ?? 'Not set'}</span>
                  </div>
                </dl>
              </div>
              {canEditIdentity && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'identity' })}
                  data-testid="merchant-identity-edit"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Button>
              )}
            </div>
          </section>

          {/* Category card (B2.3): the current category for every merchant:read
              admin; the Edit affordance is SUPER_ADMIN-only AND hidden when the
              category is locked (the merchant has submitted/live vouchers). */}
          <section
            className="rounded-lg border border-border bg-card p-4"
            data-testid="merchant-category-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium text-muted-foreground">Category</h2>
                <p className="mt-1 text-foreground" data-testid="merchant-category-value">
                  {data.merchant.category ?? 'Not set'}
                </p>
                {data.merchant.categoryLocked && (
                  <p className="mt-1 text-xs text-muted-foreground" data-testid="merchant-category-locked-note">
                    Category is locked while this merchant has submitted or live vouchers.
                  </p>
                )}
              </div>
              {canEditCategory && !data.merchant.categoryLocked && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'category' })}
                  data-testid="merchant-category-edit"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit
                </Button>
              )}
            </div>
          </section>

          {/* Branches */}
          <section className="space-y-3" data-testid="merchant-branches-section">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Branches ({data.branches.length})
              </h2>
              {canManageBranches && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'add-branch' })}
                  data-testid="merchant-add-branch"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add branch
                </Button>
              )}
            </div>
            {data.branches.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">This merchant has no branches yet.</p>
              </div>
            ) : (
              data.branches.map((branch) => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  canEdit={canEdit}
                  onEdit={(b) => setDialog({ kind: 'branch', branch: b })}
                  canDelete={canManageBranches}
                  onDelete={(b) => setDialog({ kind: 'delete-branch', branch: b })}
                />
              ))
            )}
          </section>
        </>
      )}

      {/* Dialogs */}
      {dialog?.kind === 'website' && data && (
        <EditMerchantWebsiteDialog
          merchantId={data.merchant.id}
          currentWebsiteUrl={data.merchant.websiteUrl}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'identity' && data && (
        <EditMerchantIdentityDialog
          merchantId={data.merchant.id}
          currentVatNumber={data.merchant.vatNumber}
          currentCompanyNumber={data.merchant.companyNumber}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'propose-edit' && data && (
        <ProposeMerchantEditDialog
          merchantId={data.merchant.id}
          current={{
            businessName: data.merchant.businessName,
            tradingName: data.merchant.tradingName,
            description: data.merchant.description,
          }}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'category' && data && (
        <EditCategoryDialog
          merchantId={data.merchant.id}
          currentCategoryId={data.merchant.primaryCategoryId}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'branch' && data && (
        <EditBranchDialog
          branchId={dialog.branch.id}
          merchantId={data.merchant.id}
          current={{
            phone: dialog.branch.phone,
            email: dialog.branch.email,
            websiteUrl: dialog.branch.websiteUrl,
            isActive: dialog.branch.isActive,
          }}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'add-branch' && data && (
        <AddBranchDialog
          merchantId={data.merchant.id}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'delete-branch' && data && (
        <DeleteBranchConfirm
          branchId={dialog.branch.id}
          branchName={dialog.branch.name}
          merchantId={data.merchant.id}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}
