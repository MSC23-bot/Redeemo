'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSession } from '@/lib/auth/session'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'
import { getOnboardingTaxonomy } from '@/lib/api/taxonomy'
import {
  createFlagshipRmv,
  updateRmvVoucher,
  submitRmvVoucher,
  listRmvVouchers,
} from '@/lib/api/voucher'
import { ApiError } from '@/lib/api/client'
import { resolveCategoryKey, type CategoryKey } from '@/lib/voucher/config'
import { builderTypeToEnum } from '@/lib/voucher/typeMeta'
import type { BuilderType } from '@/lib/voucher/terms'
import { TypePicker } from '@/components/onboarding/vouchers/TypePicker'
import { BuilderForm, type BuilderSavePayload } from '@/components/onboarding/vouchers/BuilderForm'

// M2 F5: the flagship voucher builder onboarding page. Wires the two-step flow:
//   Step 1 picker -> POST create-flagship (DRAFT RMV) -> Step 2 guided builder ->
//   PATCH updateRmvVoucher (merchantFields + composed title/desc/estimatedSaving/
//   terms/imageUrl) -> POST submitRmvVoucher.
// Tracks "voucher 1 of 2" / "2 of 2" from the count of already-submitted flagship RMVs
// (PENDING_APPROVAL / ACTIVE). On submitting the 2nd, returns to the hub.
//
// CC-1 (LOCKED): the score is ADVISORY. The builder leaves Save + Submit enabled even
// for a Too-weak voucher; this page never blocks submit on the score either.
// CC-3 (LOCKED): only the 5 eligible types reach create-flagship; the backend
// additionally rejects ineligible types with VOUCHER_TYPE_NOT_ELIGIBLE.

const HUB = '/'
const RMV_SUBMITTED = new Set(['PENDING_APPROVAL', 'ACTIVE'])

type Stage = 'picker' | 'builder'

function voucherErrorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined
  switch (code) {
    case 'VOUCHER_TYPE_NOT_ELIGIBLE':
      return 'That voucher type is not available as a flagship. Pick one of the five eligible types.'
    case 'FLAGSHIP_RMV_LIMIT_REACHED':
      return 'You already have your two flagship vouchers. You can edit them from the setup hub.'
    case 'NO_RMV_TEMPLATE':
      return 'We could not set up that voucher type for your category. Please try a different type.'
    case 'SAVING_INVALID':
      return 'Add an estimated saving above zero before you save.'
    default:
      return 'We could not save your voucher just now. Please try again.'
  }
}

export default function VouchersPage() {
  const session = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const profile = useMerchantProfile(session.isAuthenticated)

  const [stage, setStage] = useState<Stage>('picker')
  const [pickedType, setPickedType] = useState<BuilderType | null>(null)
  const [draftRmvId, setDraftRmvId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Local mirror of "vouchers submitted so far" so we advance to 2 of 2 in-session
  // without waiting on a refetch.
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)

  // Resolve the merchant's TOP-LEVEL category NAME from the taxonomy (the merchant's
  // primaryCategoryId is the SUBCATEGORY id), then map it to the S0 config key.
  const taxonomyQuery = useQuery({
    queryKey: ['onboardingTaxonomy'],
    queryFn: getOnboardingTaxonomy,
    enabled: session.isAuthenticated,
    staleTime: 60_000,
  })

  // Count the merchant's already-submitted flagship RMVs (drives "1 of 2" / "2 of 2").
  const rmvQuery = useQuery({
    queryKey: ['rmvVouchers'],
    queryFn: listRmvVouchers,
    enabled: session.isAuthenticated,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (rmvQuery.data && submittedCount === null) {
      setSubmittedCount(rmvQuery.data.filter((r) => RMV_SUBMITTED.has(r.status)).length)
    }
  }, [rmvQuery.data, submittedCount])

  const subId = profile.data?.primaryCategoryId ?? null
  const categoryKey: CategoryKey = resolveCategoryKey(
    topLevelNameForSub(taxonomyQuery.data?.categories ?? [], subId),
  )
  const merchantBusinessName = (profile.data as { businessName?: string } | undefined)?.businessName ?? ''

  // The current flagship index (1 or 2). Two already submitted -> the cap is reached.
  const builtCount = submittedCount ?? 0
  const voucherIndex: 1 | 2 = builtCount >= 1 ? 2 : 1

  if (profile.isError) {
    return (
      <div className="space-y-6" role="alert">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">We could not load your vouchers</CardTitle>
            <CardDescription>There was a problem reaching Redeemo. Check your connection and try again.</CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => profile.refetch?.()}>Try again</Button>
      </div>
    )
  }

  if (profile.isLoading || !profile.data || taxonomyQuery.isLoading || rmvQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading your vouchers...
      </div>
    )
  }

  // Both flagship vouchers already exist -> nothing to build; back to the hub.
  if (builtCount >= 2) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-semibold text-foreground">Both flagship vouchers are ready</h1>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">You are all set on vouchers</CardTitle>
            <CardDescription>You can edit your flagship vouchers from the setup hub.</CardDescription>
          </CardHeader>
        </Card>
        <Button onClick={() => router.push(HUB)}>Back to setup</Button>
      </div>
    )
  }

  async function handleContinue(type: BuilderType) {
    setPickedType(type)
    setError(null)
    setSaving(true)
    try {
      const voucher = await createFlagshipRmv(builderTypeToEnum(type))
      setDraftRmvId(voucher.id)
      setStage('builder')
    } catch (err) {
      setError(voucherErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function persist(payload: BuilderSavePayload, submit: boolean) {
    if (!draftRmvId) return
    setError(null)
    setSaving(true)
    try {
      await updateRmvVoucher(draftRmvId, {
        title: payload.title,
        description: payload.description,
        estimatedSaving: payload.estimatedSaving,
        terms: payload.terms,
        imageUrl: payload.imageUrl,
        merchantFields: payload.merchantFields,
      })

      if (!submit) {
        await queryClient.invalidateQueries({ queryKey: ['rmvVouchers'] })
        router.push(HUB)
        return
      }

      await submitRmvVoucher(draftRmvId)
      const nextCount = builtCount + 1
      setSubmittedCount(nextCount)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rmvVouchers'] }),
        queryClient.invalidateQueries({ queryKey: ['onboardingChecklist'] }),
      ])

      // Reset for the next voucher.
      setDraftRmvId(null)
      setPickedType(null)
      setStage('picker')

      // After the SECOND flagship, return to the hub.
      if (nextCount >= 2) router.push(HUB)
    } catch (err) {
      setError(voucherErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (stage === 'builder' && pickedType) {
    return (
      <BuilderForm
        type={pickedType}
        categoryKey={categoryKey}
        merchantBusinessName={merchantBusinessName}
        voucherIndex={voucherIndex}
        saving={saving}
        saveError={error}
        onSave={(p) => persist(p, false)}
        onSubmit={(p) => persist(p, true)}
        onBack={() => {
          setStage('picker')
          setError(null)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-[12px] bg-[#FEECEC] p-3 text-sm font-medium text-[#B91C1C]">
          {error}
        </p>
      ) : null}
      <TypePicker
        categoryKey={categoryKey}
        voucherIndex={voucherIndex}
        onContinue={handleContinue}
        onBack={() => router.push(HUB)}
      />
    </div>
  )
}

// Walk the taxonomy to find the TOP-LEVEL category NAME that owns a given subcategory
// id. Returns null when not found (the config map then falls back to neutral).
function topLevelNameForSub(
  categories: Array<{ name: string; subcategories: Array<{ id: string }> }>,
  subId: string | null,
): string | null {
  if (!subId) return null
  for (const cat of categories) {
    if (cat.subcategories.some((s) => s.id === subId)) return cat.name
  }
  return null
}
