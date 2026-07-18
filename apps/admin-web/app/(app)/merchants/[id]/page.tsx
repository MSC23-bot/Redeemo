'use client'

/**
 * Merchant 360 workspace: /merchants/[id] (slices A1 + A2).
 *
 * Converts the old flat merchant detail page into a tabbed workspace over the
 * SAME `GET /api/v1/admin/merchants/:id` payload (no backend changes):
 *
 *   - A workspace header (logo, name, lifecycle + verification pills, a branches
 *     stat, and the lifecycle action moved in from the directory flow).
 *   - A URL-addressable tab bar (`?tab=`, default Overview). Overview + Business
 *     identity render real content (A1); Branches, Documents, and Activity render
 *     the rehomed branch/document/timeline surfaces (A2). The rest are honest
 *     placeholders that name why they are not built (later slice / net-new
 *     endpoint / net-new schema / DPIA gate / provider gate).
 *
 * Gating is unchanged: the whole page fail-closes on `merchant:read`, and every
 * edit / lifecycle / branch / document / activity affordance keeps its exact
 * existing capability (`merchant:edit`, `merchant:manage-branches`,
 * `merchant:manage-documents`, `approval:read` for the timeline read). The edit,
 * lifecycle, branch, and document dialogs are the existing components, mounted at
 * page level (or self-managed by the rehomed card) keyed by the open intent; on
 * success they invalidate this merchant's detail (re-read) and the directory.
 * Backend `requireAdminCapability` stays the enforcement; the client gate is UX.
 *
 * Slice boundary: Vouchers, Redemptions, Staff, Notes, Performance, Insights, and
 * Commercial arrive in later slices (A3-A4), so their tabs render placeholders.
 */
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useMerchantDetail } from '@/lib/merchants/useMerchantDetail'
import { isEvidenceUiEnabled } from '@/lib/flags'
import { ForbiddenState } from '@/features/shared/ForbiddenState'
import { ErrorState } from '@/features/shared/ErrorState'
import { EditMerchantWebsiteDialog } from '@/features/merchants/EditMerchantWebsiteDialog'
import { EditMerchantIdentityDialog } from '@/features/merchants/EditMerchantIdentityDialog'
import { ProposeMerchantEditDialog } from '@/features/merchants/ProposeMerchantEditDialog'
import { EditCategoryDialog } from '@/features/merchants/EditCategoryDialog'
import { EditBranchDialog } from '@/features/merchants/EditBranchDialog'
import { AddBranchDialog } from '@/features/merchants/AddBranchDialog'
import { DeleteBranchConfirm } from '@/features/merchants/DeleteBranchConfirm'
import { SubmitMerchantDialog } from '@/features/merchants/SubmitMerchantDialog'
import { SuspendDialog } from '@/features/merchants/SuspendDialog'
import { ReactivateConfirm } from '@/features/merchants/ReactivateConfirm'
import { MerchantWorkspaceHeader } from '@/features/merchants/m360/MerchantWorkspaceHeader'
import { MerchantWorkspaceTabBar } from '@/features/merchants/m360/MerchantWorkspaceTabBar'
import { OverviewTab } from '@/features/merchants/m360/OverviewTab'
import { BusinessIdentityTab } from '@/features/merchants/m360/BusinessIdentityTab'
import { BranchesTab } from '@/features/merchants/m360/BranchesTab'
import { VouchersTab } from '@/features/merchants/m360/VouchersTab'
import { RedemptionsTab } from '@/features/merchants/m360/RedemptionsTab'
import { DocumentsTab } from '@/features/merchants/m360/DocumentsTab'
import { ActivityTab } from '@/features/merchants/m360/ActivityTab'
import { StaffTab } from '@/features/merchants/m360/StaffTab'
import { NotesTab } from '@/features/merchants/m360/NotesTab'
import { PlaceholderTab } from '@/features/merchants/m360/PlaceholderTab'
import { resolveM360Tab } from '@/features/merchants/m360/tabs'
import type { BranchDetail } from '@/lib/api/merchants'

// ── States ────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20" data-testid="merchant-detail-loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

// ── Dialog intents ──────────────────────────────────────────────────────────────

type OpenDialog =
  | { kind: 'website' }
  | { kind: 'identity' }
  | { kind: 'propose-edit' }
  | { kind: 'category' }
  | { kind: 'branch'; branch: BranchDetail }
  | { kind: 'add-branch' }
  | { kind: 'delete-branch'; branch: BranchDetail }
  | { kind: 'submit' }
  | { kind: 'suspend' }
  | { kind: 'reactivate' }
  | null

// ── Workspace ───────────────────────────────────────────────────────────────────

function MerchantWorkspace() {
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const searchParams = useSearchParams()
  const activeTab = resolveM360Tab(searchParams.get('tab'))

  const { ready, can } = useSession()
  const canRead = ready && can('merchant:read')
  const canEdit = can('merchant:edit')
  const canEditIdentity = can('merchant:edit-identity')
  const canEditCategory = can('merchant:edit-category')
  const canProposeEdit = can('merchant:propose-edit')
  const canSubmit = can('merchant:submit')
  // Branch create/delete are SUPER_ADMIN-only (merchant:manage-branches);
  // per-branch direct edit gates on merchant:edit (canEdit above).
  const canManageBranches = can('merchant:manage-branches')
  // Document upload/delete on behalf are SUPER_ADMIN-only
  // (merchant:manage-documents); view is gated on merchant:read (the page).
  const canManageDocuments = can('merchant:manage-documents')
  // The activity timeline read is enforced on approval:read by the backend, so
  // the Activity tab fail-closes on that capability (a merchant:read-only admin
  // must not fire the request).
  const canReadActivity = can('approval:read')
  // The per-merchant Redemptions tab reads the D67 list, enforced on
  // redemption:read by the backend, so it fail-closes on that capability (a
  // merchant:read-only admin must not fire the request).
  const canReadRedemptions = can('redemption:read')
  // RMV flagship co-build (edit + submit on behalf) gates on
  // merchant:manage-vouchers (OPERATIONS+); the list view itself is the page's
  // merchant:read gate.
  const canManageVouchers = can('merchant:manage-vouchers')
  // Lifecycle (suspend/reactivate) gates on merchant:suspend, exactly as the
  // directory flow does.
  const canLifecycle = can('merchant:suspend')
  // D65 lane-2: the Overview signing-evidence read (view detail + download the
  // server-proxied signed PDF) gates on contract:view-evidence (OPERATIONS +
  // SUPER_ADMIN). Loaded on an explicit click only; the backend
  // requireAdminCapability is the enforcement.
  //
  // RELEASE GATE (fail closed, ahead of the capability check so SUPER_ADMIN's
  // capability short-circuit cannot bypass it): the whole feature stays DORMANT
  // until NEXT_PUBLIC_EVIDENCE_UI_ENABLED === 'true'. Default/unset/invalid => OFF,
  // so this source merges to `main` (which auto-deploys the admin web) without
  // exposing controls that would call backend routes / D65 columns not yet live.
  const canViewEvidence = isEvidenceUiEnabled() && can('contract:view-evidence')

  const { data, isLoading, isError, refetch } = useMerchantDetail(id, canRead)

  const [dialog, setDialog] = useState<OpenDialog>(null)

  if (!ready) {
    return <LoadingState />
  }
  if (!can('merchant:read')) {
    return (
      <ForbiddenState
        heading="You do not have access to this merchant."
        capability="merchant:read"
        testId="merchant-detail-forbidden"
      />
    )
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

      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState subject="this merchant" onRetry={refetch} testId="merchant-detail-error" />
      ) : (
        <>
          <MerchantWorkspaceHeader
            businessName={data.merchant.businessName}
            tradingName={data.merchant.tradingName}
            category={data.merchant.category}
            status={data.merchant.status}
            verificationStatus={data.merchant.verificationStatus}
            logoUrl={data.merchant.logoUrl}
            branchCount={data.merchant.headerCounts?.branches ?? data.branches.length}
            activeVouchers={data.merchant.headerCounts?.activeVouchers}
            totalRedemptions={data.merchant.headerCounts?.totalRedemptions}
            canLifecycle={canLifecycle}
            onSuspend={() => setDialog({ kind: 'suspend' })}
            onReactivate={() => setDialog({ kind: 'reactivate' })}
          />

          <MerchantWorkspaceTabBar activeTab={activeTab} />

          {activeTab === 'overview' && (
            <OverviewTab
              data={data}
              canSubmit={canSubmit}
              canViewEvidence={canViewEvidence}
              onSubmitForReview={() => setDialog({ kind: 'submit' })}
            />
          )}

          {activeTab === 'identity' && (
            <BusinessIdentityTab
              data={data}
              canEdit={canEdit}
              canEditIdentity={canEditIdentity}
              canEditCategory={canEditCategory}
              canProposeEdit={canProposeEdit}
              onEditWebsite={() => setDialog({ kind: 'website' })}
              onEditIdentity={() => setDialog({ kind: 'identity' })}
              onEditCategory={() => setDialog({ kind: 'category' })}
              onProposeEdit={() => setDialog({ kind: 'propose-edit' })}
            />
          )}

          {activeTab === 'branches' && (
            <BranchesTab
              data={data}
              canEdit={canEdit}
              canManageBranches={canManageBranches}
              onAddBranch={() => setDialog({ kind: 'add-branch' })}
              onEditBranch={(branch) => setDialog({ kind: 'branch', branch })}
              onDeleteBranch={(branch) => setDialog({ kind: 'delete-branch', branch })}
            />
          )}

          {activeTab === 'vouchers' && (
            <VouchersTab merchantId={data.merchant.id} canManageVouchers={canManageVouchers} />
          )}

          {activeTab === 'redemptions' && (
            <RedemptionsTab merchantId={data.merchant.id} canReadRedemptions={canReadRedemptions} />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab merchantId={data.merchant.id} canManageDocuments={canManageDocuments} />
          )}

          {activeTab === 'activity' && (
            <ActivityTab merchantId={data.merchant.id} canReadActivity={canReadActivity} />
          )}

          {activeTab === 'staff' && <StaffTab merchantId={data.merchant.id} />}

          {activeTab === 'notes' && <NotesTab merchantId={data.merchant.id} />}

          {activeTab !== 'overview' &&
            activeTab !== 'identity' &&
            activeTab !== 'branches' &&
            activeTab !== 'vouchers' &&
            activeTab !== 'redemptions' &&
            activeTab !== 'documents' &&
            activeTab !== 'activity' &&
            activeTab !== 'staff' &&
            activeTab !== 'notes' && <PlaceholderTab tabKey={activeTab} />}
        </>
      )}

      {/* Dialogs (existing components, unforked) */}
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
      {dialog?.kind === 'submit' && data && (
        <SubmitMerchantDialog
          merchantId={data.merchant.id}
          isResubmit={data.merchant.onboardingStep === 'NEEDS_CHANGES'}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'suspend' && data && (
        <SuspendDialog
          merchantId={data.merchant.id}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'reactivate' && data && (
        <ReactivateConfirm
          merchantId={data.merchant.id}
          onSuccess={onDialogSuccess}
          onCancel={closeDialog}
        />
      )}
    </div>
  )
}

// useSearchParams() (read for the `?tab=` addressable tab) requires a Suspense
// boundary at build time, or `next build` fails to prerender this route.
export default function MerchantDetailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MerchantWorkspace />
    </Suspense>
  )
}
