'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { resolveCategoryKey } from '@/lib/voucher/config'
import type { DraftFields } from '@/lib/voucher/compose'
import {
  createVoucher,
  updateVoucher,
  submitVoucher,
  type AvailabilityWindow,
  type AdminProposed,
} from '@/lib/api/voucher'
import { TypePicker } from './TypePicker'
import { BuilderFields } from './BuilderFields'
import { BuilderPreview } from './BuilderPreview'
import { BuilderScore } from './BuilderScore'
import { TermsSection } from './TermsSection'
import { ConciergeDiff } from '../ConciergeDiff'
import { TextAreaField } from './fields'
import { FileUpload } from '@/components/ui/file-upload'
import { tierOf, type CustomTerm } from '@/lib/voucher/terms'
import {
  emptyBuilderState,
  fromDetail,
  toCreatePayload,
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  clausesFor,
  composeTermsText,
  isStructuredPickerId,
  type BuilderState,
  type DayTwoPickerId,
} from './builderModel'

// Day-2 Vouchers B2 (+ B6 concierge): the decoupled day-2 builder. Reuses the
// validated pure logic in lib/voucher/* for the structured 5 types and handles
// TIME_LIMITED windows + REUSABLE cooldown on top. NO onboarding imports/state.
//
// Save path:
//   - new voucher: createVoucher(payload) -> DRAFT.
//   - existing draft (voucherId set): updateVoucher(id, payload).
//   then, when the action is "submit", submitVoucher(id) flips DRAFT->PENDING_APPROVAL.
//
// B6: when initialAdminProposed is set (a CHANGES_REQUESTED voucher), the concierge
// diff renders at the top and "Apply Redeemo's suggestions" writes the proposed
// values into the form state.

export interface DayTwoBuilderProps {
  /** The merchant's top-level category NAME (drives the suggestion chips). */
  categoryName: string | null
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

// The edit/duplicate prefill. Delegates to the single fromDetail rehydrator (B-11)
// so the windowsLoaded distinction (loaded-zero vs not-loaded) is computed in one
// place. The parent already suffixes the title with " (copy)" for a duplicate.
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
  const { categoryName, onDone, onCancel, voucherId } = props
  const qc = useQueryClient()
  const categoryKey = resolveCategoryKey(categoryName)

  const [state, setState] = React.useState<BuilderState | null>(() => seedState(props))
  const [error, setError] = React.useState<string | null>(null)

  const save = useMutation({
    mutationFn: async (action: 'draft' | 'submit') => {
      if (!state) throw new Error('No voucher type selected')
      const payload = toCreatePayload(state, categoryKey)
      const saved = voucherId
        ? await updateVoucher(voucherId, payload)
        : await createVoucher(payload)
      const id = (saved as { id: string }).id
      if (action === 'submit') {
        await submitVoucher(id)
      }
      return { id }
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['vouchers'] })
      void qc.invalidateQueries({ queryKey: ['voucher', result.id] })
      onDone(result)
    },
    onError: () => {
      setError('We could not save your voucher just now. Please try again.')
    },
  })

  function pickType(id: DayTwoPickerId) {
    setState(emptyBuilderState(id))
    setError(null)
  }

  function patchFields(patch: Partial<DraftFields>) {
    setState((prev) => (prev ? { ...prev, fields: { ...prev.fields, ...patch } } : prev))
  }
  function setWindows(windows: AvailabilityWindow[]) {
    // An explicit window edit means the editor now owns the windows; mark loaded so
    // toCreatePayload sends them (B-1) instead of omitting the key.
    setState((prev) => (prev ? { ...prev, availabilityWindows: windows, windowsLoaded: true } : prev))
  }
  function setCooldown(seconds: number) {
    setState((prev) => (prev ? { ...prev, cooldownSeconds: seconds } : prev))
  }
  function setDescription(v: string) {
    setState((prev) => (prev ? { ...prev, descriptionOverride: v } : prev))
  }
  function setTerms(v: string) {
    setState((prev) => (prev ? { ...prev, terms: v } : prev))
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

  // B6: apply the admin-proposed corrections into the form state.
  function applyAdminProposed(proposed: AdminProposed) {
    setState((prev) => {
      if (!prev) return prev
      const next: BuilderState = { ...prev }
      if (typeof proposed.title === 'string') next.titleOverride = proposed.title
      if (typeof proposed.description === 'string') next.descriptionOverride = proposed.description
      if (typeof proposed.terms === 'string') {
        if (isStructuredPickerId(prev.pickerId)) {
          // Structured types compose their terms from the checklist model, so the
          // admin's proposed terms text must land THERE (as verbatim custom lines,
          // replacing the current selections) or it would be silently dropped by
          // toCreatePayload. Mirrors the legacy free-text conversion in fromDetail.
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
        // Applying admin-proposed windows means we now own them; mark loaded so the
        // PATCH sends them (B-1).
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
          <ConciergeDiff
            proposed={props.initialAdminProposed ?? null}
            note={props.initialAdminNote ?? null}
            current={{}}
            onApply={() => {}}
          />
        ) : null}
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold text-[#010C35]">Choose a voucher type</h2>
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

  const currentForDiff = {
    title: effectiveTitle(state),
    description: effectiveDescription(state),
    // Structured types keep their terms in the checklist model; compose so the
    // diff's "Your version" row shows the real current terms, not stale state.terms.
    terms: isStructuredPickerId(state.pickerId) ? composeTermsText(state, categoryKey) : state.terms,
    estimatedSaving: effectiveSaving(state),
  }

  return (
    <div className="space-y-5">
      {props.initialAdminProposed || props.initialAdminNote ? (
        <ConciergeDiff
          proposed={props.initialAdminProposed ?? null}
          note={props.initialAdminNote ?? null}
          current={currentForDiff}
          onApply={applyAdminProposed}
        />
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-[#010C35]">Build your voucher</h2>
        <Button variant="ghost" size="sm" onClick={() => pickType(state.pickerId)}>
          Change type
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <BuilderFields
            state={state}
            categoryKey={categoryKey}
            onFields={patchFields}
            onWindows={setWindows}
            onCooldown={setCooldown}
            onExpiryDate={setExpiryDate}
            hasSavedEndDate={!!voucherId && !!state.savedExpiryDate}
          />

          <TextAreaField
            label="Description (optional, but recommended)"
            value={state.descriptionOverride ?? effectiveDescription(state)}
            onChange={setDescription}
            placeholder="Tell customers why they will love this offer."
          />

          {/* Voucher photo (V1): the backend photo kind is gated on voucher-management
              power, matching this builder's capability gate. Optional; a photo lifts
              the advisory score.
              Nullable-clear (spec 2026-07-05, D1+D3): a SAVED photo can now be
              removed - the Remove control sets state.imageUrl to explicit null,
              which the PATCH serializes as a column clear. A session upload that
              is not yet saved keeps the revert-to-saved affordance; a
              fresh/duplicate builder clears freely (CREATE-omission means no
              photo, never an accidental null). */}
          <div className="flex flex-col gap-1.5">
            <FileUpload
              kind="photo"
              label={state.imageUrl ? 'Replace photo' : 'Add a photo (optional)'}
              hint="JPG or PNG, landscape, at least 1200 by 600 pixels, up to 5 MB."
              onUploaded={(url) => setImageUrl(url)}
            />
            {(() => {
              const isEdit = !!voucherId
              const savedBaseline = isEdit ? state.savedImageUrl : undefined
              if (!state.imageUrl) return null
              if (savedBaseline && state.imageUrl === savedBaseline) {
                return (
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    className="w-fit text-xs font-semibold text-[#B91C1C] hover:underline"
                  >
                    Remove photo
                  </button>
                )
              }
              return (
                <button
                  type="button"
                  onClick={() => setImageUrl(savedBaseline)}
                  className="w-fit text-xs font-semibold text-[#B91C1C] hover:underline"
                >
                  {savedBaseline ? 'Use the saved photo instead' : 'Remove photo'}
                </button>
              )
            })()}
          </div>

          {isStructuredPickerId(state.pickerId) ? (
            <TermsSection
              clauses={clausesFor(state, categoryKey)}
              selectedIds={new Set(state.selectedClauseIds)}
              onToggle={toggleClause}
              customs={state.customTerms}
              onAddCustom={addCustomTerm}
              onRemoveCustom={removeCustomTerm}
            />
          ) : (
            <TextAreaField
              label="Terms (optional)"
              value={state.terms ?? ''}
              onChange={setTerms}
              placeholder="Any conditions a customer should know."
            />
          )}
        </div>

        <div className="space-y-4">
          <BuilderPreview state={state} />
          <BuilderScore state={state} categoryName={categoryName} />
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
        <Button variant="secondary" onClick={() => save.mutate('draft')} disabled={save.isPending}>
          {save.isPending ? 'Saving...' : 'Save as draft'}
        </Button>
        <Button variant="gradient" onClick={() => save.mutate('submit')} disabled={save.isPending}>
          {save.isPending ? 'Submitting...' : 'Submit for review'}
        </Button>
      </div>
    </div>
  )
}
