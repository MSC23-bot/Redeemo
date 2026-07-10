'use client'

/**
 * Merchant 360 workspace: /merchants/[id] (slice A1).
 *
 * Converts the old flat merchant detail page into a tabbed workspace over the
 * SAME `GET /api/v1/admin/merchants/:id` payload (no backend changes in A1):
 *
 *   - A workspace header (logo, name, lifecycle + verification pills, a branches
 *     stat, and the lifecycle action moved in from the directory flow).
 *   - A URL-addressable tab bar (`?tab=`, default Overview). Two tabs render real
 *     content in A1 (Overview, Business identity); the rest are honest
 *     placeholders that name why they are not built (later slice / net-new
 *     endpoint / net-new schema / DPIA gate / provider gate).
 *
 * Gating is unchanged: the whole page fail-closes on `merchant:read`, and every
 * edit / lifecycle affordance keeps its exact existing capability. The edit and
 * lifecycle dialogs are the existing components, mounted at page level keyed by
 * the open intent; on success they invalidate this merchant's detail (re-read)
 * and the directory. Backend `requireAdminCapability` stays the enforcement; the
 * client gate is UX.
 *
 * Slice boundary: Branches, Documents, Vouchers, Redemptions, Activity, Staff,
 * Notes, Performance, Insights, and Commercial arrive in later slices (A2-A4),
 * so their tabs render placeholders here rather than the shipped branch/document
 * management, which is temporarily reachable only after those slices land.
 */
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { useMerchantDetail } from '@/lib/merchants/useMerchantDetail'
import { EditMerchantWebsiteDialog } from '@/features/merchants/EditMerchantWebsiteDialog'
import { EditMerchantIdentityDialog } from '@/features/merchants/EditMerchantIdentityDialog'
import { ProposeMerchantEditDialog } from '@/features/merchants/ProposeMerchantEditDialog'
import { EditCategoryDialog } from '@/features/merchants/EditCategoryDialog'
import { SubmitMerchantDialog } from '@/features/merchants/SubmitMerchantDialog'
import { SuspendDialog } from '@/features/merchants/SuspendDialog'
import { ReactivateConfirm } from '@/features/merchants/ReactivateConfirm'
import { MerchantWorkspaceHeader } from '@/features/merchants/m360/MerchantWorkspaceHeader'
import { MerchantWorkspaceTabBar } from '@/features/merchants/m360/MerchantWorkspaceTabBar'
import { OverviewTab } from '@/features/merchants/m360/OverviewTab'
import { BusinessIdentityTab } from '@/features/merchants/m360/BusinessIdentityTab'
import { PlaceholderTab } from '@/features/merchants/m360/PlaceholderTab'
import { resolveM360Tab } from '@/features/merchants/m360/tabs'

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

// ── Dialog intents ──────────────────────────────────────────────────────────────

type OpenDialog =
  | { kind: 'website' }
  | { kind: 'identity' }
  | { kind: 'propose-edit' }
  | { kind: 'category' }
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
  // Lifecycle (suspend/reactivate) gates on merchant:suspend, exactly as the
  // directory flow does.
  const canLifecycle = can('merchant:suspend')

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

      {isLoading ? (
        <LoadingState />
      ) : isError || !data ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <MerchantWorkspaceHeader
            businessName={data.merchant.businessName}
            tradingName={data.merchant.tradingName}
            category={data.merchant.category}
            status={data.merchant.status}
            verificationStatus={data.merchant.verificationStatus}
            logoUrl={data.merchant.logoUrl}
            branchCount={data.branches.length}
            canLifecycle={canLifecycle}
            onSuspend={() => setDialog({ kind: 'suspend' })}
            onReactivate={() => setDialog({ kind: 'reactivate' })}
          />

          <MerchantWorkspaceTabBar activeTab={activeTab} />

          {activeTab === 'overview' && (
            <OverviewTab
              data={data}
              canSubmit={canSubmit}
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

          {activeTab !== 'overview' && activeTab !== 'identity' && (
            <PlaceholderTab tabKey={activeTab} />
          )}
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
