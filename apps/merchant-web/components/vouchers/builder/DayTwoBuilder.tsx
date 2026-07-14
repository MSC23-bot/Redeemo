'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { resolveCategoryKey } from '@/lib/voucher/config'
import type { DraftFields } from '@/lib/voucher/compose'
import type { BuilderType } from '@/lib/voucher/terms'
import {
  createVoucher,
  updateVoucher,
  submitVoucher,
  type AvailabilityWindow,
  type AdminProposed,
} from '@/lib/api/voucher'
import { ConciergeDiff } from '../ConciergeDiff'
import { tierOf, type CustomTerm } from '@/lib/voucher/terms'
import {
  TypePicker,
  BaseMechanicPicker,
  MechanicFields,
  ScheduleFields,
  CooldownFields,
  WhatCustomersSee,
  TermsComposer,
  ScorePanel,
  PreviewCard,
  SubmitConfirmModal,
  buildScoreInput,
} from '../shared'
import { scoreVoucher } from '@/lib/voucher/scoring'
import {
  emptyBuilderState,
  withBaseMechanic,
  fromDetail,
  toCreatePayload,
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  clausesFor,
  composeTermsText,
  baseMechanicOf,
  hasStructuredFields,
  isWrapperPickerId,
  type BuilderState,
  type DayTwoPickerId,
} from './builderModel'

// Day-2 (custom / RCV) voucher builder, rewired (2026-07-13 S1) onto the shared
// prototype-fidelity core in components/vouchers/shared/*. Handles all 8 backend types
// including the TIME_LIMITED / REUSABLE wrapper model (Step 1 base mechanic + Step 2
// schedule / interval). Reuses the validated pure logic in lib/voucher/*.
//
// The 12 locks (CURRENT-IMPLEMENTATION section 3) are preserved: DRAFT-only PATCH +
// nullable-clear (builderModel contracts untouched), capability gating stays on the
// page, no admin-owned merchantFields keys settable, 16KB/50-key bag guard server-side,
// availabilityWindows/cooldown type-gating in toCreatePayload, no PII in the preview.
//
// CC-1 (owner ruling 2026-07-13): the advisory score never gates Save/Submit; the
// footer buttons are never disabled on score (only on the in-flight mutation). A Too
// weak verdict at Submit time is required to surface a SOFT warning dialog first
// (weak variant of SubmitConfirmModal); "Submit anyway" then proceeds through the
// exact same submit path as the normal confirm.

export interface DayTwoBuilderProps {
  /** The merchant's top-level category NAME (drives the suggestion chips). */
  categoryName: string | null
  /** Optional merchant display name for the preview card (no customer PII). */
  merchantName?: string | null
  /** Called after a successful save/submit (the parent typically closes + refetches). */
  onDone: (result: { id: string }) => void
  onCancel: () => void
  /** Edit mode: the existing draft id. When set, save PATCHes instead of POSTing. */
  voucherId?: string
  /** Edit/duplicate prefill: the voucher type enum. */
  initialType?: string
  /** Edit/duplicate prefill: the persisted builder DraftFields + flags. */
  initialFields?: Record<string, unknown> | null
  /** Edit prefill: top-level overrides. */
  initialTitle?: string | null
  initialDescription?: string | null
  initialTerms?: string | null
  initialSaving?: number | null
  initialWindows?: AvailabilityWindow[] | null
  initialCooldown?: number | null
  /** Edit/duplicate prefill: the saved voucher photo + end date (preserved on
   * save unless the user changes them). */
  initialImageUrl?: string | null
  initialExpiryDate?: string | null
  /** B6 concierge: the admin-proposed corrections + note (CHANGES_REQUESTED only). */
  initialAdminProposed?: AdminProposed | null
  initialAdminNote?: string | null
}

// The edit/duplicate prefill. Delegates to the single fromDetail rehydrator (B-11).
function seedState(props: DayTwoBuilderProps): BuilderState | null {
  if (!props.initialType) return null
  return fromDetail({
    type: props.initialType,
    title: props.initialTitle,
    description: props.initialDescription,
    terms: props.initialTerms,
    estimatedSaving: props.initialSaving,
    cooldownSeconds: props.initialCooldown,
    availabilityWindows: props.initialWindows,
    imageUrl: props.initialImageUrl,
    expiryDate: props.initialExpiryDate,
    merchantFields: props.initialFields,
  })
}

export function DayTwoBuilder(props: DayTwoBuilderProps) {
  const { categoryName, merchantName, onDone, onCancel, voucherId } = props
  const qc = useQueryClient()
  const categoryKey = resolveCategoryKey(categoryName)

  const [state, setState] = React.useState<BuilderState | null>(() => seedState(props))
  const [error, setError] = React.useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const save = useMutation({
    mutationFn: async (action: 'draft' | 'submit') => {
      if (!state) throw new Error('No voucher type selected')
      const payload = toCreatePayload(state, categoryKey)
      const saved = voucherId ? await updateVoucher(voucherId, payload) : await createVoucher(payload)
      const id = (saved as { id: string }).id
      if (action === 'submit') {
        await submitVoucher(id)
      }
      return { id }
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['vouchers'] })
      void qc.invalidateQueries({ queryKey: ['voucher', result.id] })
      setConfirmOpen(false)
      onDone(result)
    },
    onError: () => {
      setConfirmOpen(false)
      setError('We could not save your voucher just now. Please try again.')
    },
  })

  function pickType(id: DayTwoPickerId) {
    setState(emptyBuilderState(id))
    setError(null)
  }
  function pickBaseMechanic(mechanic: BuilderType) {
    setState((prev) => (prev ? withBaseMechanic(prev, mechanic) : prev))
  }
  function patchFields(patch: Partial<DraftFields>) {
    setState((prev) => (prev ? { ...prev, fields: { ...prev.fields, ...patch } } : prev))
  }
  function setWindows(windows: AvailabilityWindow[]) {
    setState((prev) => (prev ? { ...prev, availabilityWindows: windows, windowsLoaded: true } : prev))
  }
  function setCooldown(seconds: number) {
    setState((prev) => (prev ? { ...prev, cooldownSeconds: seconds } : prev))
  }
  function setTitle(v: string) {
    setState((prev) => (prev ? { ...prev, titleOverride: v } : prev))
  }
  function resetTitle() {
    setState((prev) => (prev ? { ...prev, titleOverride: undefined } : prev))
  }
  function setDescription(v: string) {
    setState((prev) => (prev ? { ...prev, descriptionOverride: v } : prev))
  }
  function resetDescription() {
    setState((prev) => (prev ? { ...prev, descriptionOverride: undefined } : prev))
  }
  function setSaving(v: number | undefined) {
    setState((prev) => (prev ? { ...prev, savingOverride: typeof v === 'number' && v > 0 ? v : undefined } : prev))
  }
  function resetSaving() {
    setState((prev) => (prev ? { ...prev, savingOverride: undefined } : prev))
  }
  function toggleClause(id: string) {
    setState((prev) => {
      if (!prev) return prev
      const next = new Set(prev.selectedClauseIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, selectedClauseIds: [...next] }
    })
  }
  function addCustomTerm(term: CustomTerm) {
    setState((prev) => (prev ? { ...prev, customTerms: [...prev.customTerms, term] } : prev))
  }
  function removeCustomTerm(index: number) {
    setState((prev) => (prev ? { ...prev, customTerms: prev.customTerms.filter((_, i) => i !== index) } : prev))
  }
  function setImageUrl(url: string | null | undefined) {
    setState((prev) => (prev ? { ...prev, imageUrl: url } : prev))
  }
  function setExpiryDate(v: string | null | undefined) {
    setState((prev) => (prev ? { ...prev, expiryDate: v } : prev))
  }
  function setAskHelp(v: boolean) {
    setState((prev) => (prev ? { ...prev, askHelp: v } : prev))
  }

  // B6: apply the admin-proposed corrections into the form state.
  function applyAdminProposed(proposed: AdminProposed) {
    setState((prev) => {
      if (!prev) return prev
      const next: BuilderState = { ...prev }
      if (typeof proposed.title === 'string') next.titleOverride = proposed.title
      if (typeof proposed.description === 'string') next.descriptionOverride = proposed.description
      if (typeof proposed.terms === 'string') {
        if (hasStructuredFields(prev)) {
          next.selectedClauseIds = []
          next.customTerms = proposed.terms
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((text) => ({ text, tier: tierOf(text) }))
        } else {
          next.terms = proposed.terms
        }
      }
      if (typeof proposed.estimatedSaving === 'number') next.savingOverride = proposed.estimatedSaving
      if (Array.isArray(proposed.availabilityWindows)) {
        next.availabilityWindows = proposed.availabilityWindows
        next.windowsLoaded = true
      }
      if (typeof proposed.cooldownSeconds === 'number') next.cooldownSeconds = proposed.cooldownSeconds
      return next
    })
  }

  // Type picker (no type chosen yet).
  if (!state) {
    return (
      <div className="space-y-5">
        {props.initialAdminProposed || props.initialAdminNote ? (
          <ConciergeDiff proposed={props.initialAdminProposed ?? null} note={props.initialAdminNote ?? null} current={{}} onApply={() => {}} />
        ) : null}
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold text-[#010C35]">Create a voucher</h2>
          <p className="text-sm text-[#6B7390]">Pick the kind of offer you want to create.</p>
        </div>
        <TypePicker value={null} onChange={pickType} />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const wrapper = isWrapperPickerId(state.pickerId)
  const base = baseMechanicOf(state)
  // Seeded = editing / duplicating an existing voucher. A legacy wrapper (no stored
  // base mechanic) still shows Step 2 + the "What customers will see" card so the
  // merchant can manage its photo / schedule / end date; a FRESH wrapper create gates
  // those on picking a base mechanic first (prototype Step-1-first flow).
  const seeded = !!props.initialType
  const showWrapperBody = base != null || seeded
  const showBuild = wrapper ? showWrapperBody : true
  const clauses = clausesFor(state, categoryKey)

  const currentForDiff = {
    title: effectiveTitle(state),
    description: effectiveDescription(state),
    terms: showBuild ? composeTermsText(state, categoryKey) : state.terms,
    estimatedSaving: effectiveSaving(state),
  }

  // Weak-submit warning (owner ruling 2026-07-13): the SAME fact set the ScorePanel
  // renders decides whether the Submit confirm opens in its weak-warning variant.
  // Advisory only; nothing is disabled and no API call happens before confirmation.
  const scoreInput = buildScoreInput(state, categoryName)
  const submitIsWeak = scoreInput != null && scoreVoucher(scoreInput).calKey === 'weak'

  return (
    <div className="space-y-5">
      {props.initialAdminProposed || props.initialAdminNote ? (
        <ConciergeDiff proposed={props.initialAdminProposed ?? null} note={props.initialAdminNote ?? null} current={currentForDiff} onApply={applyAdminProposed} />
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-[#010C35]">Build your voucher</h2>
        <Button variant="ghost" size="sm" onClick={() => pickType(state.pickerId)}>
          Change voucher type
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Wrapper Step 1: base mechanic picker. */}
          {wrapper ? (
            <BaseMechanicPicker wrapper={state.pickerId as 'time' | 'reusable'} value={state.baseMechanic ?? null} onChange={pickBaseMechanic} />
          ) : null}

          {/* Structured field group (5 mechanics), shown for structured types and
              for a wrapper once its base is chosen. */}
          {base != null ? <MechanicFields state={state} categoryKey={categoryKey} mechanic={base} onFields={patchFields} /> : null}

          {/* Wrapper Step 2: schedule (TIME_LIMITED) / cooldown (REUSABLE). */}
          {state.pickerId === 'time' && showWrapperBody ? (
            <ScheduleFields state={state} onWindows={setWindows} onExpiryDate={setExpiryDate} hasSavedEndDate={!!voucherId && !!state.savedExpiryDate} />
          ) : null}
          {state.pickerId === 'reusable' && showWrapperBody ? (
            <CooldownFields state={state} onCooldown={setCooldown} />
          ) : null}

          {showBuild ? (
            <>
              <WhatCustomersSee
                state={state}
                isEdit={!!voucherId}
                onTitle={setTitle}
                onResetTitle={resetTitle}
                onDescription={setDescription}
                onResetDescription={resetDescription}
                onSaving={setSaving}
                onResetSaving={resetSaving}
                onImageUrl={setImageUrl}
              />

              <TermsComposer
                clauses={clauses}
                selectedIds={new Set(state.selectedClauseIds)}
                onToggle={toggleClause}
                customs={state.customTerms}
                onAddCustom={addCustomTerm}
                onRemoveCustom={removeCustomTerm}
              />

              {/* Ask the Redeemo team assist toggle (prototype parity). */}
              <div className="rounded-[16px] border border-[#F4D9D2] bg-[#FFF9F5] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-bold text-[#010C35]">Ask the Redeemo team to help with this offer</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-[#6B7390]">
                      Turn this on if you would like our team to help build or improve this voucher with you. You always approve it before it goes live.
                    </p>
                  </div>
                  <Switch checked={state.askHelp} onCheckedChange={setAskHelp} label="Ask the Redeemo team to help" />
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-4">
          <ScorePanel state={state} categoryName={categoryName} />
          <PreviewCard state={state} categoryName={categoryName} merchantName={merchantName} />
        </div>
      </div>

      {error ? (
        <div role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E5E7EB] pt-4">
        <Button variant="ghost" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
        {/* CC-1 (owner ruling 2026-07-13): non-gating, never disabled on score; a Too
            weak verdict opens the confirm in its soft weak-warning variant instead.
            Save as draft persists (product behaviour wins over the prototype's
            Save-as-draft stub) and is unaffected by the verdict. */}
        <Button variant="secondary" onClick={() => save.mutate('draft')} disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save as draft'}
        </Button>
        <Button variant="gradient" onClick={() => setConfirmOpen(true)} disabled={save.isPending}>
          Submit for review
        </Button>
      </div>

      {confirmOpen ? (
        <SubmitConfirmModal
          weak={submitIsWeak}
          title={effectiveTitle(state)}
          saving={effectiveSaving(state)}
          merchantName={merchantName}
          pending={save.isPending}
          onConfirm={() => save.mutate('submit')}
          onCancel={() => setConfirmOpen(false)}
        />
      ) : null}
    </div>
  )
}
