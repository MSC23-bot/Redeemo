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
  rmvAllowedFields,
  type RmvVoucher,
} from '@/lib/api/voucher'
import { ApiError } from '@/lib/api/client'
import { resolveCategoryKey, type CategoryKey } from '@/lib/voucher/config'
import { builderTypeToEnum, enumToBuilderType } from '@/lib/voucher/typeMeta'
import type { BuilderType } from '@/lib/voucher/terms'
import { TypePicker } from '@/components/onboarding/vouchers/TypePicker'
import { BuilderForm, type BuilderSavePayload, type BuilderResumeSeed } from '@/components/onboarding/vouchers/BuilderForm'
import { parseIncompleteFields } from '@/components/vouchers/shared'
import type { FieldError } from '@/lib/voucher/submitValidity'

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
// A flagship RMV occupies a slot the moment it is created. The backend cap
// (FLAGSHIP_RMV_CAP = 2) counts DRAFT + PENDING_APPROVAL + ACTIVE, so the page must
// count the same way to stay cap-consistent: a saved-as-draft voucher still holds a
// slot. SUBMITTED (PENDING_APPROVAL / ACTIVE) drives the "1 of 2" / "2 of 2" index +
// the "both ready" terminal; DRAFT holds a slot but is still resumable.
const RMV_SUBMITTED = new Set(['PENDING_APPROVAL', 'ACTIVE'])
const RMV_DRAFT = 'DRAFT'

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
  // S5 belt-and-braces: a backend VOUCHER_INCOMPLETE response's fields[], handed to the
  // BuilderForm so it marks the same fields inline (the client gate makes this rare).
  const [submitFieldErrors, setSubmitFieldErrors] = useState<FieldError[] | null>(null)
  // Local mirror of "vouchers submitted so far" so we advance to 2 of 2 in-session
  // without waiting on a refetch.
  const [submittedCount, setSubmittedCount] = useState<number | null>(null)
  // When resuming a saved DRAFT, the seed the builder rehydrates from.
  const [resumeSeed, setResumeSeed] = useState<BuilderResumeSeed | null>(null)
  // Once we have read the RMV list and decided picker-vs-resume, this is true so a later
  // refetch (e.g. after an in-session submit) does not re-resume a stale DRAFT.
  const [resumeResolved, setResumeResolved] = useState(false)

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

  // First read of the RMV list: seed submittedCount AND decide picker-vs-resume.
  // submittedCount (PENDING_APPROVAL / ACTIVE) drives the index + terminal; slotCount
  // (submitted + drafts) is the cap-aware count. When there is still a slot to fill and
  // a DRAFT exists, RESUME it (one at a time) instead of showing the picker. This keeps
  // the page consistent with the backend cap and stops orphaned DRAFTs accumulating.
  useEffect(() => {
    const rows = rmvQuery.data
    if (!rows || resumeResolved) return

    const submitted = rows.filter((r) => RMV_SUBMITTED.has(r.status))
    const drafts = rows.filter((r) => r.status === RMV_DRAFT)
    setSubmittedCount(submitted.length)

    // Both flagships submitted -> nothing to build; the render below routes to the hub.
    if (submitted.length >= 2) {
      setResumeResolved(true)
      return
    }

    // A saved DRAFT exists -> resume the oldest one in the guided builder.
    const draft = drafts[0]
    if (draft) {
      setDraftRmvId(draft.id)
      setPickedType(enumToBuilderType(draft.type))
      setResumeSeed(resumeSeedFromRmv(draft))
      setStage('builder')
    }
    setResumeResolved(true)
  }, [rmvQuery.data, resumeResolved])

  const subId = profile.data?.primaryCategoryId ?? null
  const categoryKey: CategoryKey = resolveCategoryKey(
    topLevelNameForSub(taxonomyQuery.data?.categories ?? [], subId),
  )
  const merchantBusinessName = (profile.data as { businessName?: string } | undefined)?.businessName ?? ''

  // The current flagship index (1 or 2). Two already submitted -> the cap is reached.
  const builtCount = submittedCount ?? 0
  const voucherIndex: 1 | 2 = builtCount >= 1 ? 2 : 1

  // Cap-aware slot count (submitted + drafts), consistent with the backend cap of 2.
  // When the slots are full there is nothing left to create; the page resumes the
  // existing drafts one at a time instead of attempting another create-flagship.
  const rmvRows: RmvVoucher[] = rmvQuery.data ?? []
  const draftCount = rmvRows.filter((r) => r.status === RMV_DRAFT).length
  const slotCount = builtCount + draftCount

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
    // Cap guard: never create when the two flagship slots are already occupied. The
    // picker is only reachable with room, but guard defensively so a stale render can
    // never fire an over-cap create (the backend would reject with
    // FLAGSHIP_RMV_LIMIT_REACHED, which is still mapped below as a backstop).
    if (slotCount >= 2) return
    setPickedType(type)
    setResumeSeed(null)
    setError(null)
    setSaving(true)
    try {
      const voucher = await createFlagshipRmv(builderTypeToEnum(type))
      setDraftRmvId(voucher.id)
      // Template-seed: the create-flagship endpoint seeds title/description/
      // estimatedSaving from the RmvTemplate; carry those into the builder as the
      // editable starting values (no draft bag yet, so `fields` is null).
      setResumeSeed(templateSeedFromRmv(voucher))
      // FAIL CLOSED (allowedFields): the create response does NOT include the
      // rmvTemplate relation, so refetch the list to get the AUTHORITATIVE
      // template allowedFields for the new row. Until this lands the builder
      // renders nothing editable (rmvAllowedFields returns null for a missing
      // row); the resume effect will not re-run (resumeResolved stays true).
      await queryClient.refetchQueries({ queryKey: ['rmvVouchers'] })
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
    setSubmitFieldErrors(null)
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
      setResumeSeed(null)
      setStage('picker')

      // After the SECOND flagship, return to the hub.
      if (nextCount >= 2) {
        router.push(HUB)
      } else {
        // Re-resolve picker-vs-resume against the refreshed list so any OTHER saved
        // DRAFT is resumed for voucher 2 (rather than dumping the merchant on the picker
        // and risking a second create over the cap).
        setResumeResolved(false)
      }
    } catch (err) {
      // S5: a backend VOUCHER_INCOMPLETE marks the offending fields inline (no generic
      // banner); anything else shows the calm generic message.
      const incomplete = parseIncompleteFields(err)
      if (incomplete) {
        setSubmitFieldErrors(incomplete)
        setError(null)
      } else {
        setError(voucherErrorMessage(err))
      }
    } finally {
      setSaving(false)
    }
  }

  if (stage === 'builder' && pickedType) {
    // Governed RMV lock, FAIL CLOSED: which fields the builder may write is the
    // template's OWN allowedFields, read from the refetched list row (the create
    // response carries no rmvTemplate relation; handleContinue refetches before the
    // builder mounts). While the row/template is unknown, rmvAllowedFields returns
    // null and the builder renders nothing editable (loading state), never a
    // permissive default.
    const currentRow = rmvRows.find((r) => r.id === draftRmvId)
    return (
      <BuilderForm
        // Key on the draft id so resuming a DIFFERENT draft remounts the form and
        // re-runs its seed initialisers (the resume rehydration is mount-time).
        key={draftRmvId ?? 'new'}
        type={pickedType}
        categoryKey={categoryKey}
        merchantBusinessName={merchantBusinessName}
        voucherIndex={voucherIndex}
        saving={saving}
        saveError={error}
        submitFieldErrors={submitFieldErrors}
        initialFields={resumeSeed ?? undefined}
        allowedFields={rmvAllowedFields(currentRow)}
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

// Build the builder resume-seed from a saved DRAFT RMV row.
//
// ROUND-TRIP SHAPE (read the backend, do not guess): buildPayload PATCHes a body of
// { title, description, estimatedSaving, terms, imageUrl, merchantFields: <draft bag> }.
// updateRmvVoucherCore merges that WHOLE body into Voucher.merchantFields and writes
// NOTHING to the top-level columns; those keep the create-flagship TEMPLATE DEFAULTS.
// So for a saved DRAFT, listRmvVouchers returns:
//   row.title / row.description / row.estimatedSaving / row.imageUrl = TEMPLATE DEFAULTS
//   row.merchantFields = { title, description, estimatedSaving, terms, imageUrl,
//                          merchantFields: { builderType, ...draft, selectedClauseIds,
//                            customTerms, askHelp, titleEdited, descEdited } }
//
// The merchant's edits therefore live INSIDE row.merchantFields: the edited
// title/description/estimatedSaving/imageUrl at its TOP level (flattened keys), and the
// per-type structured draft bag one level DEEPER under merchantFields.merchantFields.
// This flattens both into the single clean seed the builder consumes, preferring the
// stored (edited) values and falling back to the top-level row defaults only when a bag
// key is absent (e.g. a DRAFT created but never edited).
// Build the builder seed from a freshly-created flagship DRAFT: the create-flagship
// endpoint seeds title / description / estimatedSaving from the RmvTemplate and writes
// an EMPTY merchantFields bag, so `fields` is null (no draft yet) and the template
// defaults become the editable starting values in the builder.
function templateSeedFromRmv(row: RmvVoucher): BuilderResumeSeed {
  const saving = typeof row.estimatedSaving === 'number'
    ? row.estimatedSaving
    : typeof row.estimatedSaving === 'string'
      ? Number(row.estimatedSaving)
      : null
  return {
    title: row.title ?? null,
    description: row.description ?? null,
    estimatedSaving: saving != null && Number.isFinite(saving) ? saving : null,
    imageUrl: row.imageUrl ?? null,
    fields: null,
  }
}

function resumeSeedFromRmv(row: RmvVoucher): BuilderResumeSeed {
  const bag: Record<string, unknown> = (row.merchantFields as Record<string, unknown> | null | undefined) ?? {}
  const bagStr = (k: string): string | null => (typeof bag[k] === 'string' ? (bag[k] as string) : null)
  const bagNum = (k: string): number | null => (typeof bag[k] === 'number' ? (bag[k] as number) : null)
  // The nested per-type structured-field bag (the inner merchantFields).
  const nested = (bag.merchantFields as Record<string, unknown> | undefined) ?? null

  const rowSaving = typeof row.estimatedSaving === 'number' ? row.estimatedSaving : null

  return {
    title: 'title' in bag ? bagStr('title') : (row.title ?? null),
    description: 'description' in bag ? bagStr('description') : (row.description ?? null),
    estimatedSaving: 'estimatedSaving' in bag ? bagNum('estimatedSaving') : rowSaving,
    imageUrl: 'imageUrl' in bag ? bagStr('imageUrl') : (row.imageUrl ?? null),
    fields: nested,
  }
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
