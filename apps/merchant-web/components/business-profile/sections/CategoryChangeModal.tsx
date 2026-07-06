'use client'

// Business Profile M3: the "Change category" flow off the Business category card.
// OWNER-only (gated by the card itself before this mounts). Reuses the onboarding
// category picker's visual language (category grid -> subcategory pills, taxonomy-
// driven) but is intentionally SIMPLER than CategoryIdentityForm: the day-2 change
// path (`setMerchantCategoryCore` / `handleCategoryChange`) only ever writes
// `primaryCategoryId` (the subcategory id) - it does NOT touch
// `primaryDescriptorTagId` or the specialty MerchantTag set (that full identity
// write, `setMerchantIdentityCore`, is onboarding-draft-window-only and throws
// IDENTITY_EDIT_REQUIRES_DRAFT once the merchant is live). So there is no
// cuisine/specialty step here.
//
// Three-step flow, driven entirely by the backend's response shape (no client-side
// prediction of which branch will fire):
//   1. 'pick'    - category + subcategory grid. Save posts { primaryCategoryId }.
//   2. 'confirm' - shown when the backend replies { requiresConfirmation, message }
//                  (an actual CHANGE, not a first-time set). Confirm re-posts with
//                  { primaryCategoryId, confirm: true }.
//   3. 'blocked' - shown when the backend throws CATEGORY_CHANGE_BLOCKED (a
//                  mandatory voucher has already been submitted/activated). The
//                  user CANNOT proceed from here; only Close is offered.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from '@/lib/icons'
import { useUpdateMerchantProfile } from '@/lib/business-profile/useUpdateMerchantProfile'
import { ApiError } from '@/lib/api/client'
import { isCategoryChangeConfirmation, type MerchantProfile } from '@/lib/api/profile'
import type { OnboardingTaxonomy, TaxonomyCategory } from '@/lib/api/taxonomy'

type Step = 'pick' | 'confirm' | 'blocked'

const errorBoxStyle: React.CSSProperties = {
  borderColor: '#FBCED0',
  background: '#FEECEC',
  color: 'var(--destructive)',
}

function topLevelOf(taxonomy: OnboardingTaxonomy, subcategoryId: string | null): string | null {
  if (!subcategoryId) return null
  for (const cat of taxonomy.categories) {
    if (cat.subcategories.some((s) => s.id === subcategoryId)) return cat.id
  }
  return null
}

export function CategoryChangeModal({
  profile,
  taxonomy,
  onClose,
}: {
  profile: MerchantProfile
  taxonomy: OnboardingTaxonomy
  onClose: () => void
}) {
  const update = useUpdateMerchantProfile()
  const currentSubcategoryId = profile.primaryCategoryId ?? null

  const [categoryId, setCategoryId] = React.useState<string | null>(() => topLevelOf(taxonomy, currentSubcategoryId))
  const [subcategoryId, setSubcategoryId] = React.useState<string | null>(currentSubcategoryId)
  const [step, setStep] = React.useState<Step>('pick')
  const [confirmMessage, setConfirmMessage] = React.useState<string | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const category: TaxonomyCategory | null = React.useMemo(
    () => taxonomy.categories.find((c) => c.id === categoryId) ?? null,
    [taxonomy, categoryId],
  )

  function pickCategory(id: string) {
    if (id === categoryId) return
    setCategoryId(id)
    setSubcategoryId(null)
    setSaveError(null)
  }

  function pickSubcategory(id: string) {
    setSubcategoryId(id)
    setSaveError(null)
  }

  const unchanged = subcategoryId !== null && subcategoryId === currentSubcategoryId
  const saveEnabled = !!subcategoryId && !unchanged && !update.isPending

  async function submit(confirm: boolean) {
    if (!subcategoryId) return
    setSaveError(null)
    try {
      const result = await update.mutateAsync(
        confirm ? { primaryCategoryId: subcategoryId, confirm: true } : { primaryCategoryId: subcategoryId },
      )
      if (isCategoryChangeConfirmation(result)) {
        setConfirmMessage(result.message)
        setStep('confirm')
        return
      }
      onClose()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'CATEGORY_CHANGE_BLOCKED') {
        setStep('blocked')
        return
      }
      setSaveError('We could not change your category. Please try again.')
    }
  }

  if (step === 'blocked') {
    return (
      <Dialog
        label="Category is locked"
        onClose={onClose}
        panelTestId="category-change-blocked-panel"
        scrimTestId="category-change-blocked-scrim"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-[#F3DFC0] bg-[#FEF6EC] text-[#B45309]"
          >
            <AlertTriangle size={20} aria-hidden />
          </span>
          <h3 className="font-display text-[19px] font-semibold tracking-tight text-[#010C35]">
            Category is locked
          </h3>
        </div>
        <p
          data-testid="category-change-blocked-message"
          className="mt-3.5 text-[13.5px] leading-relaxed text-[#566079]"
        >
          Your category is locked once your starter vouchers have been submitted or are live. Contact Redeemo
          support if this needs to change.
        </p>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </Dialog>
    )
  }

  if (step === 'confirm') {
    return (
      <Dialog
        label="Confirm category change"
        onClose={onClose}
        panelTestId="category-change-confirm-panel"
        scrimTestId="category-change-confirm-scrim"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-[#F3DFC0] bg-[#FEF6EC] text-[#B45309]"
          >
            <AlertTriangle size={20} aria-hidden />
          </span>
          <h3 className="font-display text-[19px] font-semibold tracking-tight text-[#010C35]">
            Confirm category change
          </h3>
        </div>
        <p
          data-testid="category-change-confirm-message"
          className="mt-3.5 text-[13.5px] leading-relaxed text-[#566079]"
        >
          {confirmMessage}
        </p>

        {saveError ? (
          <p
            role="alert"
            className="mt-3.5 rounded-[10px] border px-3 py-2 text-sm font-medium"
            style={errorBoxStyle}
          >
            {saveError}
          </p>
        ) : null}

        <div className="mt-5 flex gap-3">
          <Button type="button" variant="secondary" onClick={() => setStep('pick')} disabled={update.isPending}>
            Keep my category
          </Button>
          <Button
            type="button"
            onClick={() => submit(true)}
            disabled={update.isPending}
            data-testid="category-change-confirm-submit"
          >
            {update.isPending ? 'Saving...' : 'Confirm change'}
          </Button>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      label="Change your business category"
      onClose={onClose}
      panelTestId="category-change-panel"
      scrimTestId="category-change-scrim"
    >
      <h3 className="font-display text-[19px] font-semibold tracking-tight text-[#010C35]">
        Change your business category
      </h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[#566079]">
        Pick a new category. Changing it can affect your starter vouchers.
      </p>

      <div className="mt-4 max-h-[50vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8089A4]">Category</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
            {taxonomy.categories.map((c) => {
              const selected = c.id === categoryId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCategory(c.id)}
                  aria-pressed={selected}
                  className="rounded-[12px] border-[1.5px] px-3 py-2.5 text-left text-[13.5px] font-semibold transition-colors"
                  style={{
                    background: selected ? '#FFF6F1' : '#fff',
                    borderColor: selected ? '#E20C04' : '#E5E7EB',
                    color: '#010C35',
                  }}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        </div>

        {category ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8089A4]">Subcategory</p>
            <div className="flex flex-wrap gap-2">
              {category.subcategories.map((s) => {
                const selected = s.id === subcategoryId
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pickSubcategory(s.id)}
                    aria-pressed={selected}
                    className="inline-flex items-center rounded-full border-[1.5px] px-3.5 py-2 text-[13.5px]"
                    style={{
                      fontWeight: selected ? 700 : 600,
                      background: selected ? '#010C35' : '#fff',
                      color: selected ? '#fff' : '#010C35',
                      borderColor: selected ? '#010C35' : '#E5E7EB',
                    }}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {saveError ? (
        <p role="alert" className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium" style={errorBoxStyle}>
          {saveError}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={() => submit(false)} disabled={!saveEnabled} data-testid="category-change-save">
          {update.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Dialog>
  )
}
