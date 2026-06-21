'use client'

import { useMemo, useState } from 'react'
import type { MerchantIdentityBody, OnboardingTaxonomy, TaxonomyCategory, TaxonomySubcategory } from '@/lib/api/taxonomy'
import {
  buildIdentityBody,
  canSave,
  composeDescriptor,
  cuisineApplies,
  cuisineTags,
  specialtyTags,
} from '@/components/onboarding/category/lib/identitySelection'
import { ChangeCategoryConfirm } from '@/components/onboarding/category/ChangeCategoryConfirm'

// M2 F2 (D5): the category/identity onboarding step. Progressive disclosure:
//   1. primary category (single, 11 top-level)
//   2. subcategory (single)
//   3. cuisine (multi, min 1) ONLY when the chosen subcategory has CUISINE tags
//      (derived from the backend taxonomy, NOT a hardcoded prototype list)
//   4. specialties (multi, optional)
//   5. live descriptor [cuisines, subcategory].join(' ') in a sticky footer
//
// D5: NO "Add your own" affordance (seeded tags only in M2). Save posts the exact
// { subcategoryId, primaryDescriptorTagId, specialtyTagIds } body via onSave. A
// TOP-LEVEL category change on an existing identity is confirm-guarded (the backend
// discards DRAFT flagship RMVs on a top-level change).

interface CategoryIdentityFormProps {
  taxonomy: OnboardingTaxonomy
  /** The merchant's current saved identity (for edit hydration), or null on a fresh set. */
  initialIdentity: MerchantIdentityBody | null
  /** Whether the merchant already has a saved category (gates the change confirm). */
  hasExistingIdentity: boolean
  onSave: (body: MerchantIdentityBody) => void
  saving: boolean
  saveError: string | null
  onBack: () => void
}

// Resolve a subcategory id to its TOP-LEVEL category id via the taxonomy parent map.
function topLevelOf(taxonomy: OnboardingTaxonomy, subcategoryId: string | null): string | null {
  if (!subcategoryId) return null
  for (const cat of taxonomy.categories) {
    if (cat.subcategories.some((s) => s.id === subcategoryId)) return cat.id
  }
  return null
}

export function CategoryIdentityForm({
  taxonomy,
  initialIdentity,
  hasExistingIdentity,
  onSave,
  saving,
  saveError,
  onBack,
}: CategoryIdentityFormProps) {
  // Hydrate the initial selection from the saved identity (edit), if present.
  const initialCategoryId = topLevelOf(taxonomy, initialIdentity?.subcategoryId ?? null)
  const [categoryId, setCategoryId] = useState<string | null>(initialCategoryId)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(initialIdentity?.subcategoryId ?? null)
  // Selected cuisine ids: the descriptor first (when set), then any cuisine-typed
  // specialty ids that rode in the MerchantTag set. Derived once from initialIdentity.
  const [selectedCuisineIds, setSelectedCuisineIds] = useState<string[]>(() =>
    hydrateInitialCuisines(taxonomy, initialIdentity),
  )
  const [selectedSpecialtyIds, setSelectedSpecialtyIds] = useState<string[]>(() =>
    hydrateInitialSpecialties(taxonomy, initialIdentity),
  )
  const [confirmOpen, setConfirmOpen] = useState(false)

  const category: TaxonomyCategory | null = useMemo(
    () => taxonomy.categories.find((c) => c.id === categoryId) ?? null,
    [taxonomy, categoryId],
  )
  const subcategory: TaxonomySubcategory | null = useMemo(
    () => category?.subcategories.find((s) => s.id === subcategoryId) ?? null,
    [category, subcategoryId],
  )

  const cuisines = subcategory ? cuisineTags(subcategory) : []
  const specialties = subcategory ? specialtyTags(subcategory) : []
  const showCuisine = cuisineApplies(subcategory)
  const showSpecialties = !!subcategory && specialties.length > 0

  const descriptor = composeDescriptor({ subcategory, selectedCuisineIds })
  const saveEnabled = canSave({ categoryId, subcategory, selectedCuisineIds }) && !saving

  // Prototype reset semantics: changing the top-level category clears the
  // subcategory + both tag sets; changing the subcategory clears both tag sets.
  function pickCategory(id: string) {
    if (id === categoryId) return
    setCategoryId(id)
    setSubcategoryId(null)
    setSelectedCuisineIds([])
    setSelectedSpecialtyIds([])
  }
  function pickSubcategory(id: string) {
    if (id === subcategoryId) return
    setSubcategoryId(id)
    setSelectedCuisineIds([])
    setSelectedSpecialtyIds([])
  }
  function toggleCuisine(id: string) {
    setSelectedCuisineIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleSpecialty(id: string) {
    setSelectedSpecialtyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function doSave() {
    if (!subcategory) return
    onSave(buildIdentityBody({ subcategory, selectedCuisineIds, selectedSpecialtyIds }))
  }

  // A TOP-LEVEL category change on an existing identity is confirm-guarded. A
  // first-set, OR a change that keeps the same top-level category, saves directly.
  function handleSave() {
    if (!subcategory) return
    const initialTop = topLevelOf(taxonomy, initialIdentity?.subcategoryId ?? null)
    const isTopLevelChange = hasExistingIdentity && !!initialTop && initialTop !== categoryId
    if (isTopLevelChange) {
      setConfirmOpen(true)
      return
    }
    doSave()
  }

  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF6F1_100%)] text-[#010C35]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-3.5 border-b border-[#EEF1F4] bg-white/90 px-5 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-[38px] items-center gap-1.5 rounded-[10px] border border-[#E5E7EB] bg-white pl-2.5 pr-3 text-[13px] font-bold text-[#455373] transition-colors hover:bg-[#F8F9FA]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to dashboard
        </button>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-[20px] bg-[#FEF0EE] px-3 text-[12px] font-extrabold uppercase tracking-wider text-[#E84A00]">
          <span className="size-1.5 rounded-full bg-[#E84A00]" aria-hidden="true" />
          Setup step 2 of 6
        </span>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-[1080px] flex-1 px-7 pb-36 pt-9">
        <div className="max-w-[760px]">
          <h1 className="font-display text-[36px] font-semibold leading-[1.1] tracking-tight text-[#010C35]">
            Choose your category
          </h1>
          <p className="mt-3.5 max-w-[56ch] text-[16px] leading-relaxed text-[#566079]">
            This is your business identity. It shapes your flagship vouchers and where customers find you.
          </p>
        </div>

        {/* STEP 1: primary category */}
        <section className="mt-9">
          <StepHeading n={1} title="Pick a primary category" />
          <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
            {taxonomy.categories.map((c) => {
              const selected = c.id === categoryId
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickCategory(c.id)}
                  aria-pressed={selected}
                  className="flex flex-col items-start gap-3 rounded-[16px] border-[1.5px] p-[18px_18px_16px] text-left transition-[transform,box-shadow,border-color] hover:-translate-y-px"
                  style={{
                    background: selected ? 'linear-gradient(165deg,#FFF6F1,#FEEDE7)' : '#fff',
                    borderColor: selected ? '#E20C04' : '#E5E7EB',
                    boxShadow: selected ? '0 14px 30px -18px rgba(226,12,4,0.35)' : '0 1px 2px rgba(1,12,53,0.04)',
                  }}
                >
                  <span className="text-[14.5px] font-bold leading-tight tracking-tight text-[#010C35]">{c.name}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* STEP 2: subcategory */}
        {category ? (
          <section className="mt-10">
            <StepHeading n={2} title={`Pick the one that best fits ${category.name}`} />
            <p className="ml-[34px] mt-0 text-[14px] text-[#6B7390]">Single select.</p>
            <div className="ml-[34px] mt-4 flex flex-wrap gap-2.5">
              {category.subcategories.map((s) => {
                const selected = s.id === subcategoryId
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pickSubcategory(s.id)}
                    aria-pressed={selected}
                    className="inline-flex items-center rounded-full border-[1.5px] px-4 py-2.5 text-[14px] transition-[background,color,border-color]"
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
          </section>
        ) : null}

        {/* STEP 3a: cuisine (only when the subcategory has CUISINE tags) */}
        {subcategory && showCuisine ? (
          <section className="mt-10">
            <StepHeading n={3} title="Choose your cuisine" />
            <p className="ml-[34px] mt-0 max-w-[60ch] text-[14px] text-[#6B7390]">
              Multi select, at least one. Cuisine is core to who you are; we use it to describe you and to match you
              with the right customers.
            </p>
            <div className="ml-[34px] mt-4 flex flex-wrap gap-2.5">
              {cuisines.map((t) => {
                const selected = selectedCuisineIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleCuisine(t.id)}
                    aria-pressed={selected}
                    className="inline-flex items-center rounded-full border-[1.5px] px-3.5 py-2 text-[13.5px] transition-[background,color,border-color]"
                    style={{
                      fontWeight: selected ? 700 : 600,
                      background: selected ? 'linear-gradient(135deg,#FFF6F1,#FEEDE7)' : '#fff',
                      color: selected ? '#E20C04' : '#010C35',
                      borderColor: selected ? '#E20C04' : '#E5E7EB',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}

        {/* STEP 3b: specialties (optional) */}
        {subcategory && showSpecialties ? (
          <section className="mt-10">
            <div className="mb-1.5 flex items-baseline gap-2.5">
              <span
                aria-hidden="true"
                className="inline-flex size-6 items-center justify-center rounded-full border-[1.5px] border-[#E5E7EB] bg-white text-[12px] font-extrabold text-[#010C35]"
              >
                {'★'}
              </span>
              <h2 className="font-display text-[20px] font-semibold text-[#010C35]">
                What you are known for
                <span className="ml-1.5 text-[14px] font-normal text-[#8089A4]">Optional</span>
              </h2>
            </div>
            <p className="ml-[34px] mt-0 max-w-[60ch] text-[14px] text-[#6B7390]">
              A few specialties help customers find you when they search.
            </p>
            <div className="ml-[34px] mt-4 flex flex-wrap gap-2.5">
              {specialties.map((t) => {
                const selected = selectedSpecialtyIds.includes(t.id)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleSpecialty(t.id)}
                    aria-pressed={selected}
                    className="inline-flex items-center rounded-full border-[1.5px] px-3.5 py-2 text-[13.5px] transition-[background,border-color]"
                    style={{
                      fontWeight: selected ? 700 : 600,
                      background: selected ? '#F1F3F8' : '#fff',
                      color: '#010C35',
                      borderColor: selected ? '#010C35' : '#E5E7EB',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}

        {saveError ? (
          <div
            role="alert"
            className="mt-6 max-w-[760px] rounded-[14px] border border-[#F4CFC9] bg-[#FEECEC] px-4 py-3 text-[13.5px] font-medium text-[#B91C1C]"
          >
            {saveError}
          </div>
        ) : null}
      </main>

      {/* Sticky footer: descriptor + Save */}
      <footer className="sticky bottom-0 border-t border-[#EFE7E2] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-[18px] px-7 py-[18px]">
          <div className="min-w-[240px] flex-1">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#8089A4]">
              Customers will see you as
            </div>
            {descriptor ? (
              <div data-testid="category-descriptor" className="mt-0.5 font-display text-[22px] font-semibold leading-tight text-[#010C35]">
                {descriptor}
              </div>
            ) : (
              <div className="mt-0.5 font-display text-[22px] font-semibold leading-tight text-[#C9CFDA]">
                Pick a category to see your descriptor
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!saveEnabled}
            className="h-13 rounded-[13px] px-7 text-[15.5px] font-extrabold text-white transition-transform enabled:hover:-translate-y-px disabled:cursor-not-allowed"
            style={{
              height: 52,
              background: saveEnabled
                ? 'linear-gradient(135deg,#E20C04 0%,#E84A00 100%)'
                : '#EBD9D3',
              boxShadow: saveEnabled ? '0 14px 30px -12px rgba(226,12,4,0.6)' : 'none',
            }}
          >
            {saving ? 'Saving...' : 'Save and continue'}
          </button>
        </div>
      </footer>

      {confirmOpen ? (
        <ChangeCategoryConfirm
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false)
            doSave()
          }}
        />
      ) : null}
    </div>
  )
}

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3.5 flex items-baseline gap-2.5">
      <span
        aria-hidden="true"
        className="inline-flex size-6 items-center justify-center rounded-full bg-[#010C35] text-[12px] font-extrabold text-white"
      >
        {n}
      </span>
      <h2 className="font-display text-[20px] font-semibold text-[#010C35]">{title}</h2>
    </div>
  )
}

// Hydrate the initial cuisine selection from a saved identity: the descriptor tag
// (if it is a CUISINE tag on the subcategory) plus any specialtyTagIds that are
// actually CUISINE tags on the subcategory (multi-cuisine selections were folded
// into the MerchantTag set by buildIdentityBody).
function hydrateInitialCuisines(taxonomy: OnboardingTaxonomy, identity: MerchantIdentityBody | null): string[] {
  if (!identity) return []
  const sub = findSubcategory(taxonomy, identity.subcategoryId)
  if (!sub) return []
  const cuisineIds = new Set(cuisineTags(sub).map((t) => t.id))
  const result: string[] = []
  if (identity.primaryDescriptorTagId && cuisineIds.has(identity.primaryDescriptorTagId)) {
    result.push(identity.primaryDescriptorTagId)
  }
  for (const id of identity.specialtyTagIds) {
    if (cuisineIds.has(id) && !result.includes(id)) result.push(id)
  }
  return result
}

// Hydrate the initial specialty selection: the specialtyTagIds that are SPECIALTY
// tags on the subcategory (the cuisine-typed ones are handled above).
function hydrateInitialSpecialties(taxonomy: OnboardingTaxonomy, identity: MerchantIdentityBody | null): string[] {
  if (!identity) return []
  const sub = findSubcategory(taxonomy, identity.subcategoryId)
  if (!sub) return []
  const specialtyIds = new Set(specialtyTags(sub).map((t) => t.id))
  return identity.specialtyTagIds.filter((id) => specialtyIds.has(id))
}

function findSubcategory(taxonomy: OnboardingTaxonomy, subcategoryId: string): TaxonomySubcategory | null {
  for (const cat of taxonomy.categories) {
    const sub = cat.subcategories.find((s) => s.id === subcategoryId)
    if (sub) return sub
  }
  return null
}
