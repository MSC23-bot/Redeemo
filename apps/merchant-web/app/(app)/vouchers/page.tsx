'use client'

/**
 * Day-2 Vouchers B3: the merchant Vouchers module list page. Flagship vouchers
 * pinned/locked at the top (read-only); custom (RCV) vouchers grouped + filtered
 * by their derived display state (Live / In review / Draft / Finished). The
 * "Create a voucher" action opens the decoupled day-2 builder; a row click routes
 * to /vouchers/[id]. Owner-only management is gated through the single
 * useVoucherCapability seam (v1: always true).
 *
 * Privacy: this surface renders only safe core voucher fields. It never receives
 * or renders customer PII or a redemption PIN.
 */
import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { listCustomVouchers, listFlagshipVouchers, type PendingVoucherEdit } from '@/lib/api/voucher'
import { useVoucherCapability } from '@/lib/voucher/useVoucherCapability'
import { useVoucherCategoryName } from '@/lib/voucher/useVoucherCategoryName'
import { VouchersList } from '@/components/vouchers/VouchersList'
import type { VoucherCardData } from '@/components/vouchers/VoucherCard'
import { VoucherGovernedMenu } from '@/components/vouchers/VoucherGovernedMenu'
import { DayTwoBuilder } from '@/components/vouchers/builder/DayTwoBuilder'

export default function VouchersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canManage } = useVoucherCapability()
  const categoryName = useVoucherCategoryName()
  // Shell wave: /vouchers?create=1 (the topbar Quick Action) opens the builder -
  // but only for a viewer who can manage vouchers. The deep-link must also work
  // SAME-PAGE (Quick Action fired while already on /vouchers keeps the page
  // mounted), so the effect below reacts to the param APPEARING after mount.
  // Cancel strips the param (router.replace below); because the effect only
  // fires on a wantCreate transition to true, a cancelled builder does not
  // reopen until the param transitions again.
  const wantCreate = searchParams?.get('create') === '1'
  const [creating, setCreating] = React.useState(wantCreate)
  React.useEffect(() => {
    if (wantCreate) setCreating(true)
  }, [wantCreate])
  const allowCreating = creating && canManage

  const custom = useQuery({
    queryKey: ['vouchers'],
    queryFn: listCustomVouchers,
    staleTime: 30_000,
  })
  const flagship = useQuery({
    queryKey: ['flagshipVouchers'],
    queryFn: listFlagshipVouchers,
    staleTime: 30_000,
  })

  const customRows: VoucherCardData[] = (custom.data ?? []).map(toCardData)
  const flagshipRows: VoucherCardData[] = (flagship.data ?? []).map((r) => ({ ...toCardData(r), isRmv: true }))

  if (allowCreating) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold text-foreground">Create a voucher</h1>
          <p className="text-sm text-muted-foreground">
            Build a custom offer. Save it as a draft, or submit it for review.
          </p>
        </header>
        <Card className="p-6">
          <DayTwoBuilder
            categoryName={categoryName}
            onCancel={() => {
              setCreating(false)
              // Strip a ?create=1 deep-link seed so refresh/back does not
              // reopen the builder the user just cancelled (CodeRabbit #364).
              router.replace('/vouchers')
            }}
            onDone={({ id }) => {
              setCreating(false)
              // push (not replace) is deliberate: Back from the new voucher's
              // detail returns to /vouchers?create=1 and reopens the builder -
              // browser-normal deep-link semantics for a completed create.
              router.push(`/vouchers/${id}`)
            }}
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">Vouchers</h1>
          <p className="text-sm text-muted-foreground">
            Manage your flagship and custom vouchers. Submit a custom voucher for review and it
            goes live once approved and your business is live.
          </p>
        </div>
      </header>

      {custom.isLoading || flagship.isLoading ? (
        <Card>
          <div role="status" aria-live="polite" className="px-6 text-sm text-muted-foreground">
            Loading your vouchers...
          </div>
        </Card>
      ) : custom.isError ? (
        <Card>
          <div role="alert" className="space-y-3 px-6">
            <p className="text-sm text-foreground">We could not load your vouchers.</p>
            <Button variant="secondary" onClick={() => custom.refetch()}>
              Try again
            </Button>
          </div>
        </Card>
      ) : (
        <VouchersList
          flagship={flagshipRows}
          custom={customRows}
          canCreate={canManage}
          onCreate={() => setCreating(true)}
          onOpen={(id) => router.push(`/vouchers/${id}`)}
          renderActions={(v) => (
            <VoucherGovernedMenu
              voucher={v}
              canManage={canManage}
              // Duplicate/Edit live on the detail page's builder mode; a
              // ?duplicate=1 deep-link (mirrors this page's own ?create=1
              // pattern) opens it there directly instead of requiring a
              // second click once the merchant lands on the detail page.
              onDuplicate={() => router.push(`/vouchers/${v.id}?duplicate=1`)}
            />
          )}
        />
      )}
    </div>
  )
}

function toCardData(r: {
  id: string
  title: string
  type: string
  status: string
  approvalStatus: string
  estimatedSaving: number
  redemptionCount: number
  isRmv?: boolean
  description?: string | null
  terms?: string | null
  pendingEdit?: PendingVoucherEdit | null
}): VoucherCardData {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    approvalStatus: r.approvalStatus,
    estimatedSaving: r.estimatedSaving,
    redemptionCount: r.redemptionCount,
    isRmv: r.isRmv,
    description: r.description,
    terms: r.terms,
    pendingEdit: r.pendingEdit,
  }
}
