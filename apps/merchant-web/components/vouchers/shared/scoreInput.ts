// Voucher Builder shared core: assemble the ScoreInput for a builder state.
//
// One fact set for every consumer: the ScorePanel renders from this, and the
// DayTwoBuilder submit flow reads the same verdict for the weak-submit warning
// (owner ruling 2026-07-13: score stays NON-GATING, but a Too weak submit shows
// a soft warning dialog first). Keeping the assembly here guarantees the panel
// and the warning can never disagree about the verdict.
//
// Pure (no React). Returns null when there is nothing to score yet (a wrapper
// type before its Step-1 base mechanic is picked).

import type { ScoreInput, ScoreType } from '@/lib/voucher/scoring'
import { resolveCategoryKey } from '@/lib/voucher/config'
import { availabilitySummary, windowValidity, fmtInterval } from '@/lib/voucher/builderCopy'
import {
  effectiveTitle,
  effectiveDescription,
  effectiveSaving,
  effectiveSavingPercent,
  descIsUntouched,
  selectedClausesFor,
  baseMechanicOf,
  hasStructuredFields,
  REUSABLE_COOLDOWN_FLOOR,
  type BuilderState,
} from '../builder/builderModel'

export function buildScoreInput(state: BuilderState, categoryName: string | null): ScoreInput | null {
  const base = baseMechanicOf(state)
  if (base == null || !hasStructuredFields(state)) return null

  const categoryKey = resolveCategoryKey(categoryName)
  const selectedClauses = selectedClausesFor(state, categoryKey)
  const isTimed = state.pickerId === 'time'
  const isReusable = state.pickerId === 'reusable'
  const cooldown = state.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR
  const wv = windowValidity(state.availabilityWindows)

  return {
    type: base as ScoreType,
    savingValue: effectiveSaving(state),
    savingPercent: effectiveSavingPercent(state),
    previewTitle: effectiveTitle(state),
    previewDesc: effectiveDescription(state),
    descUntouched: descIsUntouched(state),
    hasPhoto: !!state.imageUrl,
    freeStandalone: base === 'freebie' && !state.fields.freeNeedsPurchase,
    reuseFrequent: isReusable && cooldown <= 86400,
    selectedClauses,
    customs: state.customTerms,
    isTimed,
    isReusable,
    windowsValid: isTimed ? wv.windowsValid : undefined,
    windowNarrow: isTimed ? wv.windowNarrow : undefined,
    windowsOk: isTimed ? wv.windowsOk : undefined,
    availabilitySummary: isTimed ? availabilitySummary(state.availabilityWindows) : undefined,
    reuseIntervalText: isReusable ? fmtInterval(cooldown) : undefined,
  }
}
