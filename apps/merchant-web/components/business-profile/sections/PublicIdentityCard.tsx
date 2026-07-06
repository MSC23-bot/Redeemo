'use client'

// Business Profile M2/M4: the "Public identity" card (prototype 01/03) -
// businessName, tradingName, description, logo + banner. M2 shipped this
// read-only; M4 wires the LAST Business Profile v1 edit affordance:
//
//   - An OWNER viewer (`profile.viewerCapabilities.role === 'OWNER'`) gets a live
//     Edit button that opens <PublicIdentityEditModal>, which branches on the
//     draft-vs-live lane (see that file's isDraftWindowProfile) - direct PATCH in
//     the draft window, governed edit-request lane once live.
//   - Whenever the merchant has a PENDING identity edit in review
//     (`profile.pendingEdits`), the card shows an in-review notice + Withdraw
//     action INSTEAD of the Edit button (mirrors Branches' BranchDetailsCard +
//     PendingEditsList split, kept inline here since a merchant profile only ever
//     has ONE edit-request type, unlike a branch's identity-vs-photo split).
//   - A non-owner (BRANCH_MANAGER / STAFF / absent viewerCapabilities - fail
//     closed) sees the card fully read-only: no Edit, no Withdraw, ever.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Pencil, Clock } from '@/lib/icons'
import { PublicIdentityEditModal } from '@/components/business-profile/sections/PublicIdentityEditModal'
import { useWithdrawMerchantEditRequest } from '@/lib/business-profile/useMerchantEditRequest'
import type { MerchantProfile } from '@/lib/api/profile'

function val(v: string | null | undefined): string {
  return (v ?? '').trim()
}

export function PublicIdentityCard({ profile }: { profile: MerchantProfile }) {
  const { toast } = useToast()
  const withdraw = useWithdrawMerchantEditRequest()
  const initial = profile.businessName.trim().charAt(0).toUpperCase() || '?'
  const isOwner = profile.viewerCapabilities?.role === 'OWNER'

  const [editOpen, setEditOpen] = React.useState(false)
  const [withdrawError, setWithdrawError] = React.useState<string | null>(null)

  const pendingEdit = (profile.pendingEdits ?? []).find((e) => e.status === 'PENDING')
  const hasPendingEdit = !!pendingEdit

  async function onWithdraw() {
    if (!pendingEdit) return
    setWithdrawError(null)
    try {
      await withdraw.mutateAsync(pendingEdit.id)
      toast({ message: 'Edit withdrawn.', variant: 'success' })
    } catch {
      setWithdrawError('We could not withdraw this change. Please try again.')
    }
  }

  return (
    <Card className="gap-4" data-testid="business-profile-public-identity-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6">
        <div className="space-y-0.5">
          <h2 className="font-display text-lg font-semibold text-foreground">Public identity</h2>
          <p className="text-sm text-muted-foreground">
            What customers see. Changes to these are checked by Redeemo before they go live.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Reviewed by Redeemo
          </span>
          {isOwner && !hasPendingEdit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditOpen(true)}
              data-testid="public-identity-edit"
            >
              <Pencil size={14} aria-hidden />
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-6">
        {hasPendingEdit ? (
          <div
            data-testid="public-identity-pending-edit"
            className="flex items-start justify-between gap-3 rounded-[14px] p-4"
            style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex min-w-0 items-start gap-3">
              <Clock size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">A change is already in review</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Changes awaiting Redeemo review. Your current details stay live for customers until
                  they are approved. You can withdraw before then.
                </p>
                {withdrawError ? (
                  <p role="alert" className="mt-1.5 text-sm font-medium" style={{ color: 'var(--destructive)' }}>
                    {withdrawError}
                  </p>
                ) : null}
              </div>
            </div>
            {isOwner ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onWithdraw}
                disabled={withdraw.isPending}
                data-testid="public-identity-withdraw"
              >
                {withdraw.isPending ? 'Withdrawing...' : 'Withdraw'}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name" value={val(profile.businessName)} empty="No name set" />
          <Field label="Trading name" value={val(profile.tradingName)} empty="Same as business name" />
        </div>

        <Field label="Description" value={val(profile.description)} empty="No description added" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Logo</p>
            <div className="flex items-center gap-3">
              <div
                className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border"
                style={{ background: 'var(--cream)', borderColor: 'var(--border-subtle)' }}
              >
                {profile.logoUrl ? (
                  <Image
                    src={profile.logoUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="size-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="font-display text-lg font-semibold" style={{ color: 'var(--rose)' }}>
                    {initial}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Square logo, shown on your listing and vouchers.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Banner</p>
            {profile.bannerUrl ? (
              <div
                className="relative h-14 w-full overflow-hidden rounded-[14px] border"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <Image src={profile.bannerUrl} alt="" fill sizes="100vw" className="object-cover" unoptimized />
              </div>
            ) : (
              <div
                className="flex h-14 w-full items-center rounded-[14px] px-3"
                style={{ background: 'var(--brand-gradient)' }}
              >
                <p className="text-xs font-medium text-white">Wide banner, shown at the top of your listing.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {editOpen ? <PublicIdentityEditModal profile={profile} onClose={() => setEditOpen(false)} /> : null}
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
