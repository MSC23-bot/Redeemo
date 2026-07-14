'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { categoryNameForKey, type CategoryKey } from '@/lib/voucher/config'
import { defaultSelectedClauseIds, tierOf, type BuilderType, type CustomTerm } from '@/lib/voucher/terms'
import type { DraftFields } from '@/lib/voucher/compose'
import { scoreVoucher } from '@/lib/voucher/scoring'
import {
  MechanicFields,
  WhatCustomersSee,
  TermsComposer,
  ScorePanel,
  PreviewCard,
  SubmitConfirmModal,
  buildScoreInput,
  useSubmitValidation,
  SubmitValidationProvider,
  SubmitErrorSummary,
} from '@/components/vouchers/shared'
import type { EffectiveVoucher, FieldError } from '@/lib/voucher/submitValidity'
import {
  emptyBuilderState,
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  clausesFor,
  composeTermsText,
  pickerIdToEnum,
  submitBag,
  type BuilderState,
} from '@/components/vouchers/builder/builderModel'

// M2 F5 / Voucher Builder prototype fidelity S2: the flagship (RMV) onboarding builder,
// rewired (2026-07-13) onto the SHARED prototype-fidelity core in
// components/vouchers/shared/* (the same MechanicFields / WhatCustomersSee /
// TermsComposer / ScorePanel / PreviewCard / SubmitConfirmModal the day-2 custom lane
// uses). One shared core, two lanes; the flagship lane keeps its governed constraints:
//
//   - Only the 5 eligible structured types reach this form (the prior TypePicker screen
//     gates TIME_LIMITED / REUSABLE out; ELIGIBLE_FLAGSHIP_TYPES + the create-flagship
//     endpoint enforce it server-side). No wrapper / schedule / cooldown UI here.
//   - Template-driven (RmvTemplate): the create-flagship endpoint seeds title /
//     description / estimatedSaving from the template; those arrive as the initial
//     seed and show as the editable starting values.
//   - allowedFields (RmvTemplate.allowedFields): a field the template does NOT permit
//     renders read-only and is never written to the PATCH (mirrors updateRmvVoucherCore's
//     RMV_FIELD_NOT_ALLOWED key check).
//   - CC-1 (owner ruling 2026-07-13): the advisory score NEVER gates Save / Submit. A
//     Too-weak SUBMIT surfaces the shared soft weak-warning dialog first (weak variant of
//     SubmitConfirmModal); "Submit anyway" proceeds through the same submit path.
//   - "Save voucher {1|2} of 2" framing (prototype A11) + the £5-floor advisory + the
//     concierge (askHelp) toggle are preserved product surfaces.

// The PATCH payload the page sends. Its shape is a governed round-trip contract: the page
// PATCHes { title, description, estimatedSaving, terms, imageUrl, merchantFields } and the
// backend (updateRmvVoucherCore) merges the WHOLE body into Voucher.merchantFields, so on
// resume the merchant's edits live INSIDE the stored bag (flattened keys + a nested draft
// bag under .merchantFields). Keys the template's allowedFields OMITS are left off (unset).
export interface BuilderSavePayload {
  title?: string
  description?: string
  estimatedSaving?: number
  terms?: string
  imageUrl?: string
  merchantFields?: Record<string, unknown>
}

// A previously-saved RMV DRAFT (or the create-flagship template defaults), FLATTENED by
// the page into one unambiguous shape (see resumeSeedFromRmv / the create-flagship seed in
// page.tsx). title / description / estimatedSaving / imageUrl are the merchant's edited
// OVERRIDES on resume (template defaults on a fresh create); `fields` is the nested draft
// bag (DraftFields + the picker context + edited flags + selected clauses + custom terms +
// askHelp). Absent `fields` = a fresh create (template defaults only, no draft yet).
export interface BuilderResumeSeed {
  title?: string | null
  description?: string | null
  estimatedSaving?: number | null
  imageUrl?: string | null
  fields?: Record<string, unknown> | null
}

interface BuilderFormProps {
  type: BuilderType
  categoryKey: CategoryKey
  merchantBusinessName: string
  voucherIndex: 1 | 2
  saving: boolean
  saveError: string | null
  onSave: (payload: BuilderSavePayload) => void
  onSubmit: (payload: BuilderSavePayload) => void
  onBack: () => void
  /** When present, seeds the form from a previously-saved DRAFT or the template defaults. */
  initialFields?: BuilderResumeSeed
  /** S5 belt-and-braces: a backend VOUCHER_INCOMPLETE response's fields[] (the parent page
   * owns the submit API call, so it parses the error and hands the fields down). Mapped
   * onto the same inline marks + focus the client gate uses. */
  submitFieldErrors?: FieldError[] | null
  /** The voucher's OWN RmvTemplate.allowedFields set. FAIL CLOSED: null/undefined means
   * the permissions are UNKNOWN (the post-create refetch has not landed yet), in which
   * case NOTHING renders editable and Save/Submit are disabled behind a loading note.
   * A field the template omits renders read-only and is never sent on the PATCH. */
  allowedFields?: string[] | null
}

// Pull the DraftFields-shaped keys out of the nested draft bag (the inverse of the
// buildPayload spread). Only known DraftFields keys are lifted; the bag's own meta keys
// (builderType, categoryKey, selectedClauseIds, customTerms, askHelp, the edited flags)
// are rehydrated separately.
function draftFromBag(type: BuilderType, merchantBusinessName: string, bag: Record<string, unknown> | null | undefined): DraftFields {
  const base: DraftFields = {
    type,
    merchantBusinessName,
    discountKind: type === 'discount' ? 'percent' : undefined,
    freeNeedsPurchase: type === 'freebie' ? false : undefined,
  }
  if (!bag) return base
  const str = (k: string): string | undefined => (typeof bag[k] === 'string' ? (bag[k] as string) : undefined)
  const numF = (k: string): number | undefined => (typeof bag[k] === 'number' ? (bag[k] as number) : undefined)
  const list = Array.isArray(bag.packageList) ? (bag.packageList as unknown[]).filter((x): x is string => typeof x === 'string') : undefined
  return {
    ...base,
    bogoBuy: str('bogoBuy'),
    bogoBuyFullPrice: numF('bogoBuyFullPrice'),
    bogoFree: str('bogoFree'),
    bogoFreePrice: numF('bogoFreePrice'),
    spendAmount: numF('spendAmount'),
    spendSave: numF('spendSave'),
    discountKind: bag.discountKind === 'fixed' || bag.discountKind === 'percent' ? bag.discountKind : base.discountKind,
    discAmount: numF('discAmount'),
    discPercent: numF('discPercent'),
    discTypicalOrder: numF('discTypicalOrder'),
    discMin: numF('discMin'),
    freeItem: str('freeItem'),
    freeWorth: numF('freeWorth'),
    freeNeedsPurchase: typeof bag.freeNeedsPurchase === 'boolean' ? (bag.freeNeedsPurchase as boolean) : base.freeNeedsPurchase,
    freeQualify: str('freeQualify'),
    packageItems: str('packageItems'),
    packagePrice: numF('packagePrice'),
    packageNormal: numF('packageNormal'),
    packageMode: bag.packageMode === 'list' || bag.packageMode === 'describe' ? bag.packageMode : undefined,
    packageList: list,
  }
}

// Seed the builder state from the resume/template seed. `seed.fields` (the nested draft
// bag) is present when RESUMING a saved DRAFT; absent on a FRESH create (template
// defaults only). The title/description overrides come from the flattened seed keys:
// on resume, only when the stored edited-flag is set; on a fresh create, the template
// defaults seed the editable starting values.
function seedToState(type: BuilderType, merchantBusinessName: string, seed: BuilderResumeSeed | undefined): BuilderState {
  const base = emptyBuilderState(type)
  const bag = seed?.fields ?? null
  const hasBag = bag != null
  const draft = draftFromBag(type, merchantBusinessName, bag)

  const savedIds = hasBag && Array.isArray(bag!.selectedClauseIds)
    ? (bag!.selectedClauseIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : null
  const savedCustoms = hasBag && Array.isArray(bag!.customTerms)
    ? (bag!.customTerms as Array<{ text?: unknown; tier?: unknown }>)
        .filter((c): c is { text: string; tier?: unknown } => !!c && typeof c.text === 'string')
        .map((c) => ({
          text: c.text,
          tier: c.tier === 'restrictive' || c.tier === 'caution' || c.tier === 'fair' ? (c.tier as CustomTerm['tier']) : tierOf(c.text),
        }))
    : null

  const seedTitleEdited = hasBag && bag!.titleEdited === true
  const seedDescEdited = hasBag && bag!.descEdited === true

  // Title / description override:
  //  - resume: only when the merchant actually edited it (stored edited flag) - otherwise
  //    leave it composing from the rehydrated fields (never re-seed over the merchant's
  //    own selections: the prototype's edit-mode re-seed bug is deliberately NOT ported).
  //  - fresh create: the template default seeds the editable starting value.
  const titleOverride = hasBag
    ? seedTitleEdited
      ? seed?.title ?? undefined
      : undefined
    : seed?.title ?? undefined
  const descriptionOverride = hasBag
    ? seedDescEdited
      ? seed?.description ?? undefined
      : undefined
    : seed?.description ?? undefined

  return {
    ...base,
    fields: draft,
    titleOverride,
    descriptionOverride,
    // The onboarding lane never rehydrates a manual saving override: BOGO derives from
    // the free-item price in the bag, the other four types are always derived. (Matches
    // the pre-S2 behaviour; keeps the round-trip bag shape unchanged.)
    savingOverride: undefined,
    // Onboarding defaults (NOT the day-2 BOGO override in emptyBuilderState): a fresh
    // start uses the shared per-type defaults; a resume restores the saved selections.
    selectedClauseIds: savedIds ?? defaultSelectedClauseIds(type),
    customTerms: savedCustoms ?? [],
    imageUrl: seed?.imageUrl ?? undefined,
    savedImageUrl: undefined,
    askHelp: hasBag ? bag!.askHelp === true : false,
  }
}

export function BuilderForm({
  type,
  categoryKey,
  merchantBusinessName,
  voucherIndex,
  saving,
  saveError,
  onSave,
  onSubmit,
  onBack,
  initialFields,
  submitFieldErrors = null,
  allowedFields = null,
}: BuilderFormProps) {
  const [state, setState] = useState<BuilderState>(() => seedToState(type, merchantBusinessName, initialFields))
  const [confirmOpen, setConfirmOpen] = useState(false)

  // S5 (owner 2026-07-13): SUBMIT fails closed until the offer is complete; Save as draft
  // is never gated. The pure matrix lives in lib/voucher/submitValidity.
  const computeEffective = useCallback((): EffectiveVoucher => ({
    type: pickerIdToEnum(state),
    title: effectiveTitle(state),
    estimatedSaving: effectiveSaving(state),
    merchantFields: submitBag(state),
    // Flagship RMVs are only ever the six base structured types (never a wrapper), so the
    // window rule never applies; windowsKnown is trivially true.
    windowCount: 0,
    windowsKnown: true,
    cooldownSeconds: null,
  }), [state])
  const validation = useSubmitValidation(computeEffective)

  // Belt-and-braces: a backend VOUCHER_INCOMPLETE (parent owns the submit call) marks the
  // same fields inline + focuses the first.
  useEffect(() => {
    if (submitFieldErrors && submitFieldErrors.length > 0) validation.applyServerErrors(submitFieldErrors)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitFieldErrors])

  // FAIL CLOSED: while the template permissions are unknown, NO key is allowed (every
  // surface renders read-only and the CTAs stay disabled behind the loading note below).
  const permissionsKnown = Array.isArray(allowedFields)
  const allow = (key: string) => permissionsKnown && (allowedFields as string[]).includes(key)
  const categoryName = categoryNameForKey(categoryKey)
  const clauses = clausesFor(state, categoryKey)

  // ── state setters (mirror the day-2 builder) ─────────────────────────────────
  function patchFields(patch: Partial<DraftFields>) {
    setState((prev) => ({ ...prev, fields: { ...prev.fields, ...patch } }))
  }
  function setTitle(v: string) {
    setState((prev) => ({ ...prev, titleOverride: v }))
  }
  function resetTitle() {
    setState((prev) => ({ ...prev, titleOverride: undefined }))
  }
  function setDescription(v: string) {
    setState((prev) => ({ ...prev, descriptionOverride: v }))
  }
  function resetDescription() {
    setState((prev) => ({ ...prev, descriptionOverride: undefined }))
  }
  function setSaving(v: number | undefined) {
    setState((prev) => ({ ...prev, savingOverride: typeof v === 'number' && v > 0 ? v : undefined }))
  }
  function resetSaving() {
    setState((prev) => ({ ...prev, savingOverride: undefined }))
  }
  function setImageUrl(url: string | null | undefined) {
    setState((prev) => ({ ...prev, imageUrl: url ?? undefined }))
  }
  function toggleClause(id: string) {
    setState((prev) => {
      const next = new Set(prev.selectedClauseIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, selectedClauseIds: [...next] }
    })
  }
  function addCustomTerm(term: CustomTerm) {
    setState((prev) => ({ ...prev, customTerms: [...prev.customTerms, term] }))
  }
  function removeCustomTerm(index: number) {
    setState((prev) => ({ ...prev, customTerms: prev.customTerms.filter((_, i) => i !== index) }))
  }
  function setAskHelp(v: boolean) {
    setState((prev) => ({ ...prev, askHelp: v }))
  }

  // Build the PATCH payload, honouring the template's allowedFields (a disallowed key is
  // omitted so the backend never rejects the PATCH with RMV_FIELD_NOT_ALLOWED). The
  // merchantFields bag reproduces the governed round-trip shape (DraftFields spread +
  // picker context + selections + edited flags) so the page's resume flatten keeps working.
  function buildPayload(): BuilderSavePayload {
    const titleEdited = state.titleOverride != null && state.titleOverride.trim().length > 0
    const descEdited = state.descriptionOverride != null && state.descriptionOverride.trim().length > 0
    const bag: Record<string, unknown> = {
      builderType: type,
      categoryKey,
      ...state.fields,
      selectedClauseIds: state.selectedClauseIds,
      customTerms: state.customTerms,
      askHelp: state.askHelp,
      titleEdited,
      descEdited,
    }
    const payload: BuilderSavePayload = {}
    if (allow('title')) payload.title = effectiveTitle(state)
    if (allow('description')) payload.description = effectiveDescription(state)
    if (allow('estimatedSaving')) payload.estimatedSaving = effectiveSaving(state)
    if (allow('terms')) payload.terms = composeTermsText(state, categoryKey)
    if (allow('imageUrl')) payload.imageUrl = state.imageUrl ?? undefined
    if (allow('merchantFields')) payload.merchantFields = bag
    return payload
  }

  // Weak-submit warning (owner ruling 2026-07-13): the SAME fact set the ScorePanel
  // renders decides whether a submit opens the soft weak-warning first. Advisory only:
  // nothing is disabled and no API call happens before confirmation.
  const scoreInput = buildScoreInput(state, categoryName)
  const submitIsWeak = scoreInput != null && scoreVoucher(scoreInput).calKey === 'weak'

  function handleSubmit() {
    // S5: fail closed on completeness. An incomplete offer marks its fields + focuses the
    // first problem, and never opens the weak modal or calls the submit API.
    if (!validation.attemptSubmit()) return
    if (submitIsWeak) {
      setConfirmOpen(true)
      return
    }
    onSubmit(buildPayload())
  }

  const submitLabel = `Save voucher ${voucherIndex} of 2`

  return (
    <div ref={validation.containerRef} className="flex flex-col gap-6">
      <SubmitValidationProvider errorFor={validation.errorFor}>
      {/* Prototype flagship-mode framing (A11 / FULL.html buildHeading + stepLabel,
          ~L12695-12708): the wizard step chip "Voucher N of 2 · Step 2 of 2" (middle
          dot per the prototype; never an em-dash) + the flagship heading, verbatim. */}
      <header className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold" style={{ background: '#FEF0EE', color: '#E84A00' }}>
          Voucher {voucherIndex} of 2 · Step 2 of 2
        </span>
        <h1 className="font-display text-2xl font-semibold text-[#010C35]">Build Your Flagship Voucher</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* FAIL-CLOSED loading state: the template permissions have not arrived yet
              (the post-create refetch is in flight). Nothing is editable and the CTAs
              stay disabled until the authoritative allowedFields land. */}
          {!permissionsKnown ? (
            <div role="status" aria-live="polite" className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FA] p-3 text-sm text-[#4B5366]">
              Checking what you can edit on this voucher...
            </div>
          ) : null}

          {/* Per-type structured fields (the offer mechanics land in merchantFields). */}
          {allow('merchantFields') ? (
            <Card className="border-[#E5E7EB] p-5">
              <MechanicFields state={state} categoryKey={categoryKey} mechanic={type} onFields={patchFields} />
            </Card>
          ) : null}

          {/* What customers will see (photo / title / description / estimated saving),
              each editable only when the template's allowedFields permits it. */}
          <WhatCustomersSee
            state={state}
            isEdit={false}
            onTitle={setTitle}
            onResetTitle={resetTitle}
            onDescription={setDescription}
            onResetDescription={resetDescription}
            onSaving={setSaving}
            onResetSaving={resetSaving}
            onImageUrl={setImageUrl}
            editable={{
              photo: allow('imageUrl'),
              title: allow('title'),
              description: allow('description'),
              saving: allow('estimatedSaving'),
            }}
          />

          {/* Terms checklist + custom terms. */}
          {allow('terms') ? (
            <TermsComposer
              clauses={clauses}
              selectedIds={new Set(state.selectedClauseIds)}
              onToggle={toggleClause}
              customs={state.customTerms}
              onAddCustom={addCustomTerm}
              onRemoveCustom={removeCustomTerm}
            />
          ) : null}

          {/* Concierge (askHelp) toggle. Persists INSIDE the merchantFields bag, so it is
              only editable when the template allows the merchantFields key (fail closed
              while permissions are unknown). */}
          {allow('merchantFields') ? (
            <Card className="border-[#E5E7EB] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#010C35]">Ask the Redeemo team to help with this offer</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
                    Turn this on if you would like our team to help build or improve this voucher with you. You always approve it before it goes live.
                  </p>
                </div>
                <Switch checked={state.askHelp} onCheckedChange={setAskHelp} label="Ask the Redeemo team to help with this offer" />
              </div>
              {state.askHelp ? (
                <span className="mt-3 inline-flex items-center rounded-full bg-[#FEF6F5] px-3 py-1 text-xs font-semibold text-[#E84A00]">
                  Flagged for the Redeemo team
                </span>
              ) : null}
            </Card>
          ) : null}

          {saveError ? (
            <p role="alert" className="rounded-[12px] bg-[#FEECEC] p-3 text-sm font-medium text-[#B91C1C]">
              {saveError}
            </p>
          ) : null}

          {/* S5: what still needs correcting before this flagship voucher can be submitted. */}
          <SubmitErrorSummary errors={validation.errors} />

          {/* Footer. CC-1: NEITHER button is disabled by the score. A Too-weak submit
              opens the soft weak-warning first; Save as draft always persists. The
              buttons ARE disabled while the template permissions are unknown (fail
              closed: never PATCH with an unverified key set). */}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEAE6] pt-4">
            <Button variant="secondary" onClick={onBack} disabled={saving}>
              Back
            </Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => onSave(buildPayload())} disabled={saving || !permissionsKnown}>
                Save as draft
              </Button>
              <Button variant="gradient" onClick={handleSubmit} disabled={saving || !permissionsKnown}>
                {saving ? 'Saving...' : submitLabel}
              </Button>
            </div>
          </footer>
        </div>

        {/* Right: live score + preview (shared core). */}
        <aside className="flex w-full flex-col gap-4">
          <ScorePanel state={state} categoryName={categoryName} />
          <PreviewCard state={state} categoryName={categoryName} merchantName={merchantBusinessName} />
        </aside>
      </div>

      {confirmOpen ? (
        <SubmitConfirmModal
          weak
          title={effectiveTitle(state)}
          saving={effectiveSaving(state)}
          merchantName={merchantBusinessName}
          pending={saving}
          onConfirm={() => onSubmit(buildPayload())}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}
      </SubmitValidationProvider>
    </div>
  )
}
