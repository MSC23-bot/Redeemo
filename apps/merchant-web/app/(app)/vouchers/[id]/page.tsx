'use client'

/**
 * Day-2 Vouchers B4 + B5 + B6: the per-state voucher detail page.
 *
 * B4: reads the full custom voucher via getVoucher (React Query ['voucher', id])
 * and renders the read-only VoucherDetail for every safe state.
 *
 * B5 actions: DRAFT vouchers expose Edit (opens the builder prefilled) / Submit /
 * Delete (DRAFT-only, confirm); every voucher exposes Duplicate (client-orchestrated:
 * prefill the builder in CREATE mode with the source fields + a " (copy)" title).
 * Non-DRAFT vouchers hide Edit/Submit/Delete (the server also enforces).
 *
 * B6 concierge: a CHANGES_REQUESTED voucher's Edit opens the builder with the
 * admin-proposed corrections (merchantFields.adminProposed + adminNote) so the
 * merchant sees a proposed-vs-current diff and can apply the suggestions.
 *
 * Voucher governed flows (2026-07-07): this SAME route/page now also renders a
 * flagship (isRmv) voucher's detail. GET /vouchers/:id is CUSTOM-only (isRmv:
 * false server-side) and there is no per-id RMV read (only the list, GET
 * /vouchers/rmv) - so a flagship id is resolved by matching it against the
 * (cached) flagship list instead of adding a new backend route or a sibling
 * frontend route. A flagship voucher NEVER gets Edit/Submit/Delete; its only
 * actions are the governed VoucherGovernedMenu (Request a change / Duplicate)
 * plus the analytics section below, same as a custom voucher.
 *
 * Privacy: only safe core voucher fields are shown. Never customer PII or a PIN.
 * The UI never sends status/approvalStatus (server-set).
 */
import * as React from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ArrowLeft, Pencil, Send, Trash2 } from '@/lib/icons'
import {
  getVoucher,
  submitVoucher,
  deleteVoucher,
  listFlagshipVouchers,
  type CustomVoucherDetail,
} from '@/lib/api/voucher'
import { isEditable, deriveDisplayState } from '@/lib/voucher/displayState'
import { useVoucherCapability } from '@/lib/voucher/useVoucherCapability'
import { useInsightsCapability } from '@/lib/insights/useInsightsCapability'
import { useVoucherCategoryName } from '@/lib/voucher/useVoucherCategoryName'
import { VoucherDetail } from '@/components/vouchers/VoucherDetail'
import { ConciergeReadOnly } from '@/components/vouchers/ConciergeDiff'
import { DuplicateAction } from '@/components/vouchers/DuplicateAction'
import { DayTwoBuilder } from '@/components/vouchers/builder/DayTwoBuilder'
import { VoucherAnalytics } from '@/components/vouchers/VoucherAnalytics'
import { VoucherGovernedMenu } from '@/components/vouchers/VoucherGovernedMenu'
import { PendingVoucherEditBanner } from '@/components/vouchers/PendingVoucherEditBanner'

type Mode = 'view' | 'edit' | 'duplicate'

export default function VoucherDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const id = params?.id ?? ''
  const { canManage } = useVoucherCapability()
  // Per-voucher analytics is business-analytics data (same class as the Insights
  // module), so the section is shown ONLY to a viewer with canViewInsights (OWNER /
  // BRANCH_MANAGER). A STAFF viewer simply does not see it; the rest of the detail
  // page is unchanged. Fail closed while the capability is loading. The backend
  // independently enforces the same policy.
  const { canViewInsights } = useInsightsCapability()
  const categoryName = useVoucherCategoryName()

  const [mode, setMode] = React.useState<Mode>('view')
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  // Voucher governed flows: try the flagship list first (see the module doc
  // comment above). This query is CHEAP in the common case - the merchant
  // usually arrives here from /vouchers, where ['flagshipVouchers'] is already
  // warm in the cache (staleTime 30s), so this is a cache hit, not a second
  // network round trip.
  const flagshipList = useQuery({
    queryKey: ['flagshipVouchers'],
    queryFn: listFlagshipVouchers,
    staleTime: 30_000,
  })
  const flagshipSettled = flagshipList.isSuccess || flagshipList.isError
  const flagshipRow = flagshipList.data?.find((v) => v.id === id) ?? null
  const isFlagship = !!flagshipRow

  const query = useQuery({
    queryKey: ['voucher', id],
    queryFn: () => getVoucher(id),
    enabled: !!id && flagshipSettled && !isFlagship,
    staleTime: 30_000,
  })

  // Unify: a flagship row (list-row shape) is adapted into the CustomVoucherDetail
  // shape VoucherDetail/the builder already know how to render (merchantFields /
  // availabilityWindows / imageUrl are detail-only fields the flagship LIST read
  // does not carry, so they are explicitly nulled rather than guessed).
  const voucher: CustomVoucherDetail | undefined = isFlagship
    ? flagshipRow
      ? { ...flagshipRow, merchantFields: null, availabilityWindows: null, imageUrl: null }
      : undefined
    : query.data

  // A ?duplicate=1 deep-link (from the Vouchers list kebab) opens the builder in
  // duplicate mode directly, mirroring the list page's own ?create=1 pattern. A
  // ref (not a `voucher` dependency) guards this to firing exactly ONCE: `voucher`
  // is a freshly-derived object every render (spread/adapter), so depending on it
  // directly would re-trigger duplicate mode on every later refetch, silently
  // undoing a "Back to voucher" click.
  const wantDuplicate = searchParams?.get('duplicate') === '1'
  const duplicateHandledRef = React.useRef(false)
  const hasVoucher = !!voucher
  React.useEffect(() => {
    if (wantDuplicate && hasVoucher && !duplicateHandledRef.current) {
      duplicateHandledRef.current = true
      setMode('duplicate')
    }
  }, [wantDuplicate, hasVoucher])

  const submit = useMutation({
    mutationFn: () => submitVoucher(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vouchers'] })
      void qc.invalidateQueries({ queryKey: ['voucher', id] })
      router.push('/vouchers')
    },
    onError: () => setActionError('We could not submit this voucher just now. Please try again.'),
  })

  const remove = useMutation({
    mutationFn: () => deleteVoucher(id),
    onSuccess: () => {
      setConfirmingDelete(false)
      void qc.invalidateQueries({ queryKey: ['vouchers'] })
      router.push('/vouchers')
    },
    onError: () => {
      setConfirmingDelete(false)
      setActionError('We could not delete this voucher just now. Please try again.')
    },
  })

  // Edit / Duplicate builder mode.
  if ((mode === 'edit' || mode === 'duplicate') && voucher) {
    const isDuplicate = mode === 'duplicate'
    const proposed = voucher.merchantFields?.adminProposed ?? null
    const note = voucher.merchantFields?.adminNote ?? null
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setMode('view')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
        >
          <ArrowLeft size={16} /> Back to voucher
        </button>
        <header>
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {isDuplicate ? 'Duplicate voucher' : 'Edit voucher'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isDuplicate
              ? 'A fresh draft prefilled from this voucher. Save it or submit it for review.'
              : 'Make your changes, then save as a draft or submit for review.'}
          </p>
        </header>
        <Card className="p-6">
          <DayTwoBuilder
            categoryName={categoryName}
            // Edit PATCHes the existing draft; Duplicate creates a new one (no voucherId).
            voucherId={isDuplicate ? undefined : voucher.id}
            initialType={voucher.type}
            initialFields={voucher.merchantFields ?? null}
            initialTitle={isDuplicate ? `${voucher.title} (copy)` : voucher.title}
            initialDescription={voucher.description ?? null}
            initialTerms={voucher.terms ?? null}
            initialSaving={voucher.estimatedSaving}
            initialWindows={voucher.availabilityWindows ?? null}
            initialCooldown={voucher.cooldownSeconds ?? null}
            initialImageUrl={voucher.imageUrl ?? null}
            initialExpiryDate={voucher.expiryDate ?? null}
            // The concierge diff only applies to an in-place edit, not a duplicate.
            initialAdminProposed={isDuplicate ? null : proposed}
            initialAdminNote={isDuplicate ? null : note}
            onCancel={() => setMode('view')}
            onDone={({ id: savedId }) => {
              setMode('view')
              if (isDuplicate) {
                router.push(`/vouchers/${savedId}`)
              } else {
                void query.refetch()
              }
            }}
          />
        </Card>
      </div>
    )
  }

  // Combined loading/error across the flagship-lookup query + the (conditionally
  // enabled) custom-read query, so the page shows ONE calm state regardless of
  // which path resolves the voucher.
  const isLoading = flagshipList.isLoading || (flagshipSettled && !isFlagship && query.isLoading)
  const hasError =
    flagshipList.isError || (flagshipSettled && !isFlagship && query.isError) || (flagshipSettled && !isLoading && !voucher)

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push('/vouchers')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
      >
        <ArrowLeft size={16} /> Back to vouchers
      </button>

      {isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading this voucher...
          </div>
        </Card>
      ) : hasError || !voucher ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load this voucher.</p>
            <Button
              variant="secondary"
              onClick={() => {
                void flagshipList.refetch()
                void query.refetch()
              }}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {actionError ? (
            <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
              {actionError}
            </div>
          ) : null}
          <VoucherDetail
            voucher={voucher}
            flagship={isFlagship}
            actions={
              canManage ? (
                isFlagship ? (
                  <VoucherGovernedMenu
                    voucher={voucher}
                    canManage={canManage}
                    showViewRedemptions={false}
                    onDuplicate={() => setMode('duplicate')}
                  />
                ) : (
                  <>
                    <DetailActions
                      voucher={voucher}
                      submitting={submit.isPending}
                      onEdit={() => setMode('edit')}
                      onSubmit={() => submit.mutate()}
                      onDelete={() => setConfirmingDelete(true)}
                      onDuplicate={() => setMode('duplicate')}
                    />
                    {/* Governed-only items (Request to end / Withdraw submission);
                        Duplicate/View-redemptions already render above/in the aside. */}
                    <VoucherGovernedMenu
                      voucher={voucher}
                      canManage={canManage}
                      showDuplicate={false}
                      showViewRedemptions={false}
                      onDuplicate={() => setMode('duplicate')}
                    />
                  </>
                )
              ) : null
            }
            // Voucher governed flows: an open (PENDING) request takes over this
            // slot (either kind, flagship CHANGE or custom END); otherwise a
            // CHANGES_REQUESTED custom voucher keeps the existing B-3 concierge
            // note + proposed-vs-current diff (Apply stays in the Edit builder).
            changesBanner={
              voucher.pendingEdit?.status === 'PENDING' ? (
                <PendingVoucherEditBanner voucher={voucher} canManage={canManage} />
              ) : deriveDisplayState(voucher) === 'changes-requested' ? (
                <ConciergeReadOnly
                  proposed={voucher.merchantFields?.adminProposed ?? null}
                  note={voucher.merchantFields?.adminNote ?? null}
                  current={{
                    title: voucher.title,
                    description: voucher.description ?? undefined,
                    terms: voucher.terms ?? undefined,
                    estimatedSaving: voucher.estimatedSaving,
                    availabilityWindows: voucher.availabilityWindows ?? undefined,
                    cooldownSeconds: voucher.cooldownSeconds ?? undefined,
                  }}
                />
              ) : null
            }
          />
          {/* Slice E: per-voucher analytics (read-only), gated to canViewInsights
              viewers (STAFF never sees it). Its own query, so a slow or failing (or
              raced 403) stats fetch never blocks the detail render above. Works for
              a flagship voucher too (the backend endpoint is isRmv-agnostic). */}
          {canViewInsights ? <VoucherAnalytics voucherId={voucher.id} /> : null}
        </>
      )}

      {confirmingDelete && voucher ? (
        <Dialog
          label="Delete this draft voucher"
          onClose={() => setConfirmingDelete(false)}
          panelTestId="delete-voucher-dialog"
        >
          <h2 className="font-display text-xl font-semibold text-[#010C35]">Delete this draft?</h2>
          <p className="mt-2 text-sm text-[#4B5366]">
            This permanently deletes the draft &ldquo;{voucher.title}&rdquo;. This cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? 'Deleting...' : 'Delete voucher'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

// The state-gated action set. DRAFT (incl changes-requested) exposes Edit / Submit /
// Delete; every state exposes Duplicate. Mirrors the backend EDITABLE_STATUSES=['DRAFT'].
function DetailActions({
  voucher,
  submitting,
  onEdit,
  onSubmit,
  onDelete,
  onDuplicate,
}: {
  voucher: CustomVoucherDetail
  submitting: boolean
  onEdit: () => void
  onSubmit: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  const editable = isEditable(voucher.status)
  return (
    <>
      {editable ? (
        <>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil size={15} /> Edit
          </Button>
          <Button variant="gradient" size="sm" onClick={onSubmit} disabled={submitting}>
            <Send size={15} /> {submitting ? 'Submitting...' : 'Submit for review'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 size={15} /> Delete
          </Button>
        </>
      ) : null}
      <DuplicateAction onDuplicate={onDuplicate} />
    </>
  )
}
