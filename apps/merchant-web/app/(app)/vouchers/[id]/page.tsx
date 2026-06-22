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
 * Privacy: only safe core voucher fields are shown. Never customer PII or a PIN.
 * The UI never sends status/approvalStatus (server-set).
 */
import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ArrowLeft, Pencil, Send, Trash2 } from '@/lib/icons'
import {
  getVoucher,
  submitVoucher,
  deleteVoucher,
  type CustomVoucherDetail,
} from '@/lib/api/voucher'
import { isEditable, deriveDisplayState } from '@/lib/voucher/displayState'
import { useVoucherCapability } from '@/lib/voucher/useVoucherCapability'
import { useVoucherCategoryName } from '@/lib/voucher/useVoucherCategoryName'
import { VoucherDetail } from '@/components/vouchers/VoucherDetail'
import { ConciergeReadOnly } from '@/components/vouchers/ConciergeDiff'
import { DuplicateAction } from '@/components/vouchers/DuplicateAction'
import { DayTwoBuilder } from '@/components/vouchers/builder/DayTwoBuilder'

type Mode = 'view' | 'edit' | 'duplicate'

export default function VoucherDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const id = params?.id ?? ''
  const { canManage } = useVoucherCapability()
  const categoryName = useVoucherCategoryName()

  const [mode, setMode] = React.useState<Mode>('view')
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const query = useQuery({
    queryKey: ['voucher', id],
    queryFn: () => getVoucher(id),
    enabled: !!id,
    staleTime: 30_000,
  })

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

  const voucher = query.data

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

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => router.push('/vouchers')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
      >
        <ArrowLeft size={16} /> Back to vouchers
      </button>

      {query.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading this voucher...
          </div>
        </Card>
      ) : query.isError || !voucher ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load this voucher.</p>
            <Button variant="secondary" onClick={() => query.refetch()}>
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
            actions={
              canManage ? (
                <DetailActions
                  voucher={voucher}
                  submitting={submit.isPending}
                  onEdit={() => setMode('edit')}
                  onSubmit={() => submit.mutate()}
                  onDelete={() => setConfirmingDelete(true)}
                  onDuplicate={() => setMode('duplicate')}
                />
              ) : null
            }
            // B-3: a CHANGES_REQUESTED voucher surfaces the concierge note +
            // proposed-vs-current diff read-only on the detail page itself. The
            // Apply action stays in the Edit builder.
            changesBanner={
              deriveDisplayState(voucher) === 'changes-requested' ? (
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
  const state = deriveDisplayState(voucher)
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
      {/* state is surfaced for future state-specific actions; referenced to keep the
          render explicit about which states reach here. */}
      <span data-action-state={state} className="sr-only" />
    </>
  )
}
