// Day-2 Vouchers B2: the builder state model + the mapping to/from the backend.
//
// The builder reuses the validated pure logic in lib/voucher/* (compose / deriveSaving /
// scoring / config / typeMeta) for the 5 STRUCTURED types (bogo / spend / discount /
// freebie / package). TIME_LIMITED + REUSABLE have no DraftFields builder logic, so the
// builder handles them with a plain title/description/saving form PLUS the type-specific
// fields (availabilityWindows / cooldownSeconds) the backend validates.
//
// This module is pure (no React); the orchestrator owns the React state.

import type { DraftFields } from '@/lib/voucher/compose'
import { composeTitle, composeDescription, deriveSaving, deriveSavingPercent } from '@/lib/voucher/compose'
import {
  buildClauseList,
  defaultSelectedClauseIds,
  tierOf,
  type BuilderType,
  type Clause,
  type CustomTerm,
} from '@/lib/voucher/terms'
import type { CategoryKey } from '@/lib/voucher/config'
import type { AvailabilityWindow, CreateVoucherPayload, VoucherTypeEnum } from '@/lib/api/voucher'

// The picker exposes 7 cards => 8 backend types. The day-2 picker id space is the
// 5 structured BuilderType ids + 'time' + 'reusable' (discount fixed/percent is a
// kind toggle inside the discount fields, not two cards).
export type DayTwoPickerId = BuilderType | 'time' | 'reusable'

export const STRUCTURED_PICKER_IDS: BuilderType[] = ['bogo', 'spend', 'discount', 'freebie', 'package']

export function isStructuredPickerId(id: DayTwoPickerId): id is BuilderType {
  return (STRUCTURED_PICKER_IDS as DayTwoPickerId[]).includes(id)
}

// The full builder form state. For structured types `fields` is the DraftFields
// bag; for time/reusable `fields.type` is unused (we keep it typed loosely).
export interface BuilderState {
  pickerId: DayTwoPickerId
  // The DraftFields-shaped structured bag (only meaningful for structured types).
  fields: DraftFields
  // Manual overrides (when the merchant edits the auto-composed text).
  titleOverride?: string
  descriptionOverride?: string
  savingOverride?: number
  // Free-text terms (TIME_LIMITED / REUSABLE only - the clause engine has no
  // pools for them). For the 5 STRUCTURED types the terms string is COMPOSED
  // from selectedClauseIds + customTerms (V1 checklist parity with onboarding).
  terms?: string
  // STRUCTURED types only: the ticked built-in clause ids + merchant-written
  // custom terms (persisted in merchantFields for edit rehydration).
  selectedClauseIds: string[]
  customTerms: CustomTerm[]
  /** Three-state (spec 2026-07-05 D1): `undefined` = never set / untouched-empty;
   * a string = saved baseline or in-session value; `null` = EXPLICIT clear of a
   * saved baseline (edit mode only) - serialized as JSON null so the PATCH
   * clears the stored column. */
  imageUrl?: string | null
  /** The HYDRATED saved image (edit mode baseline). Clearing it sends an
   * explicit null on the PATCH (nullable-clear contract); reverting a session
   * upload restores this baseline value. */
  savedImageUrl?: string
  /** Three-state, mirroring imageUrl - the two fields are INDEPENDENT: no
   * shared conditional may couple their clear/preserve decisions. */
  expiryDate?: string | null
  /** The HYDRATED saved end date (edit mode baseline). Unticking the end-date
   * toggle on an edit with a saved date sends an explicit null on the PATCH. */
  savedExpiryDate?: string
  askHelp: boolean
  // TIME_LIMITED only.
  availabilityWindows: AvailabilityWindow[]
  // TIME_LIMITED only: whether the editor actually LOADED the windows. A fresh
  // CREATE builder always knows its windows (loaded, starts []); an EDIT/duplicate
  // is "loaded" only when the detail payload carried availabilityWindows. When the
  // windows were NOT loaded, toCreatePayload OMITS the key on a TIME_LIMITED PATCH
  // so the backend leaves the existing windows untouched (a present key is a
  // wholesale replace). Distinguishing "loaded zero" from "not loaded" prevents a
  // description-only edit from silently wiping the merchant's windows.
  windowsLoaded: boolean
  // REUSABLE only.
  cooldownSeconds?: number
}

export const REUSABLE_COOLDOWN_FLOOR = 1800 // 30 minutes (backend Zod floor).

export function emptyBuilderState(pickerId: DayTwoPickerId): BuilderState {
  const structuredType = isStructuredPickerId(pickerId) ? pickerId : 'bogo'
  return {
    pickerId,
    fields: {
      type: structuredType,
      discountKind: pickerId === 'discount' ? 'percent' : undefined,
    },
    selectedClauseIds: isStructuredPickerId(pickerId) ? defaultSelectedClauseIds(pickerId) : [],
    customTerms: [],
    askHelp: false,
    availabilityWindows: [],
    // A fresh CREATE builder owns its window state from the start.
    windowsLoaded: true,
    cooldownSeconds: pickerId === 'reusable' ? REUSABLE_COOLDOWN_FLOOR : undefined,
  }
}

// The picker id -> the backend VoucherType enum.
export function pickerIdToEnum(state: BuilderState): VoucherTypeEnum {
  switch (state.pickerId) {
    case 'bogo':
      return 'BOGO'
    case 'spend':
      return 'SPEND_AND_SAVE'
    case 'freebie':
      return 'FREEBIE'
    case 'package':
      return 'PACKAGE_DEAL'
    case 'discount':
      return state.fields.discountKind === 'fixed' ? 'DISCOUNT_FIXED' : 'DISCOUNT_PERCENT'
    case 'time':
      return 'TIME_LIMITED'
    case 'reusable':
      return 'REUSABLE'
    default:
      return 'BOGO'
  }
}

// The backend VoucherType enum -> the day-2 picker id (for the edit-prefill path).
export function enumToPickerId(enumType: string): DayTwoPickerId {
  switch (enumType) {
    case 'BOGO':
      return 'bogo'
    case 'SPEND_AND_SAVE':
      return 'spend'
    case 'FREEBIE':
      return 'freebie'
    case 'PACKAGE_DEAL':
      return 'package'
    case 'DISCOUNT_FIXED':
    case 'DISCOUNT_PERCENT':
      return 'discount'
    case 'TIME_LIMITED':
      return 'time'
    case 'REUSABLE':
      return 'reusable'
    default:
      return 'bogo'
  }
}

// The composed (or overridden) title for the current state.
export function effectiveTitle(state: BuilderState): string {
  if (state.titleOverride != null && state.titleOverride.trim().length > 0) return state.titleOverride
  if (isStructuredPickerId(state.pickerId)) return composeTitle(state.fields)
  return ''
}

export function effectiveDescription(state: BuilderState): string {
  if (state.descriptionOverride != null && state.descriptionOverride.trim().length > 0) {
    return state.descriptionOverride
  }
  if (isStructuredPickerId(state.pickerId)) return composeDescription(state.fields)
  return ''
}

export function effectiveSaving(state: BuilderState): number {
  if (typeof state.savingOverride === 'number' && state.savingOverride > 0) return state.savingOverride
  if (isStructuredPickerId(state.pickerId)) return deriveSaving(state.fields)
  return 0
}

export function effectiveSavingPercent(state: BuilderState): number {
  if (isStructuredPickerId(state.pickerId)) return deriveSavingPercent(state.fields)
  return 0
}

// Whether the current state's title/description are still the auto-suggested copy
// (drives the score's descUntouched input).
export function descIsUntouched(state: BuilderState): boolean {
  return state.descriptionOverride == null || state.descriptionOverride.trim().length === 0
}

// The live clause list for a STRUCTURED state (the same inputs the onboarding
// builder feeds: spend amount, freebie qualifier, discount kind + minimum).
export function clausesFor(state: BuilderState, categoryKey: CategoryKey): Clause[] {
  if (!isStructuredPickerId(state.pickerId)) return []
  const f = state.fields
  return buildClauseList({
    type: state.pickerId,
    categoryKey,
    spendAmt: f.spendAmount,
    freeNeedsPurchase: f.freeNeedsPurchase,
    discountKind: f.discountKind,
    discMin: f.discMin,
  })
}

export function selectedClausesFor(state: BuilderState, categoryKey: CategoryKey): Clause[] {
  const ids = new Set(state.selectedClauseIds)
  return clausesFor(state, categoryKey).filter((c) => ids.has(c.id))
}

// The terms string sent to the backend for a STRUCTURED type: selected built-in
// labels + custom texts, one per line (identical to the onboarding composer).
export function composeTermsText(state: BuilderState, categoryKey: CategoryKey): string {
  const builtin = selectedClausesFor(state, categoryKey).map((c) => c.label)
  const custom = state.customTerms.map((c) => c.text)
  return [...builtin, ...custom].join('\n')
}

// Build the API payload from the builder state. The merchantFields bag stores the
// builder draft (builderType + the DraftFields + clause selections + askHelp) so a
// later edit can rehydrate. status/approvalStatus/isRmv/merchantId are NEVER set
// here (the server sets them) - they are not in CreateVoucherPayload by construction.
// categoryKey feeds the structured-type terms composition (defaults to the
// fallback pool when the merchant has no category yet).
export function toCreatePayload(state: BuilderState, categoryKey: CategoryKey = 'CATEGORY_FALLBACK'): CreateVoucherPayload {
  const type = pickerIdToEnum(state)
  const title = effectiveTitle(state) || defaultTitleFor(state)
  const saving = effectiveSaving(state)
  const structured = isStructuredPickerId(state.pickerId)

  const merchantFields: Record<string, unknown> = {
    askHelp: state.askHelp,
    builderType: state.pickerId,
    // Persist the structured DraftFields bag + the clause selections so editing
    // rehydrates the inputs (mirrors the onboarding builder's bag shape).
    ...(structured
      ? { draftFields: state.fields, selectedClauseIds: state.selectedClauseIds, customTerms: state.customTerms }
      : {}),
  }

  // STRUCTURED: terms are composed from the checklist; free text is the
  // TIME_LIMITED / REUSABLE path only. A structured compose ALWAYS sends the
  // string - including '' when the merchant removed every clause/custom - so a
  // partial PATCH actually CLEARS the stored terms instead of silently keeping
  // the old text (the key would otherwise be omitted). Backend zod accepts ''.
  const termsText = structured ? composeTermsText(state, categoryKey) : state.terms

  const payload: CreateVoucherPayload = {
    type,
    title,
    estimatedSaving: saving > 0 ? saving : 5, // advisory floor fallback; admin review is the backstop.
    description: effectiveDescription(state) || undefined,
    terms: structured ? termsText : termsText || undefined,
    // Nullable-clear (D1): explicit null survives serialization as a clear
    // signal; falsy-but-not-null still coerces to omission. The two lines are
    // deliberately INDEPENDENT per-field checks - never couple them.
    imageUrl: state.imageUrl === null ? null : state.imageUrl || undefined,
    expiryDate: state.expiryDate === null ? null : normalizeExpiryDate(state.expiryDate || undefined),
    merchantFields,
  }

  if (state.pickerId === 'time') {
    // Defensive guard (B-1): only send availabilityWindows when the editor actually
    // loaded them. An EDIT that never loaded windows OMITS the key so the backend
    // (which treats a present key as a wholesale replace) leaves the existing
    // windows untouched, instead of silently wiping them with [].
    if (state.windowsLoaded) {
      payload.availabilityWindows = state.availabilityWindows
    }
  }
  if (state.pickerId === 'reusable') {
    payload.cooldownSeconds = Math.max(REUSABLE_COOLDOWN_FLOOR, state.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR)
  }

  return payload
}

// The date input emits YYYY-MM-DD; the backend accepts z.string().datetime().
// Normalize a date-only value to UTC midnight ISO; pass a full ISO through
// (hydrated values arrive as full ISO already).
export function normalizeExpiryDate(v: string | undefined | null): string | undefined | null {
  if (v === null) return null
  if (!v) return undefined
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000Z` : v
}

// A sensible non-empty title for the time/reusable types (no compose logic).
function defaultTitleFor(state: BuilderState): string {
  if (state.pickerId === 'time') return 'A time limited offer'
  if (state.pickerId === 'reusable') return 'A reusable offer'
  return 'A new voucher'
}

// The detail-prefill input shape (the edit / duplicate path). Shared by fromDetail
// and the React-prop seedState in DayTwoBuilder so the rehydration lives in ONE
// place (B-11). `availabilityWindows: null` means the detail payload did NOT carry
// windows (not loaded); an array (even empty) means it DID (loaded).
export interface VoucherDetailPrefill {
  type: string
  title?: string | null
  description?: string | null
  terms?: string | null
  imageUrl?: string | null
  estimatedSaving?: number | null
  cooldownSeconds?: number | null
  availabilityWindows?: AvailabilityWindow[] | null
  expiryDate?: string | null
  merchantFields?: Record<string, unknown> | null
}

// Rehydrate a builder state from a getVoucher detail (the edit / duplicate path).
// Reads the persisted merchantFields.draftFields when present, else falls back to
// treating merchantFields itself as the structured bag (legacy), else an empty bag;
// the top-level columns become overrides. Sets windowsLoaded:true only when the
// detail carried an availabilityWindows array (so a not-loaded EDIT omits the key
// on save - see toCreatePayload).
export function fromDetail(input: VoucherDetailPrefill): BuilderState {
  const pickerId = enumToPickerId(input.type)
  const bag = input.merchantFields ?? {}
  // Prefer the persisted draftFields bag; fall back to treating the bag itself as
  // the structured DraftFields (legacy bags carry the keys directly).
  const nested = bag.draftFields as DraftFields | undefined
  const flat = bag as unknown as DraftFields
  const draft = nested && nested.type ? nested : flat && flat.type ? flat : undefined
  const base = emptyBuilderState(pickerId)

  // Clause-selection rehydration (V1): prefer the persisted ids/customs; a LEGACY
  // structured draft (free-text terms, no persisted selections) converts each
  // terms line into a custom term so the merchant's own words are preserved
  // (content-preserving: lines are whitespace-trimmed and blank lines dropped,
  // matching the composer's own output format, so the round-trip is stable).
  const savedIds = Array.isArray(bag.selectedClauseIds)
    ? (bag.selectedClauseIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : null
  const savedCustoms = Array.isArray(bag.customTerms)
    ? (bag.customTerms as Array<{ text?: unknown; tier?: unknown }>)
        .filter((c): c is { text: string; tier?: unknown } => !!c && typeof c.text === 'string')
        .map((c) => ({
          text: c.text,
          tier: c.tier === 'restrictive' || c.tier === 'caution' || c.tier === 'fair' ? (c.tier as CustomTerm['tier']) : tierOf(c.text),
        }))
    : null
  const structured = isStructuredPickerId(pickerId)
  const legacyCustoms =
    structured && savedIds == null && typeof input.terms === 'string' && input.terms.trim().length > 0
      ? input.terms
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((text) => ({ text, tier: tierOf(text) }))
      : null

  return {
    ...base,
    fields: draft ?? base.fields,
    // Top-level columns become overrides so the merchant sees their real content.
    titleOverride: input.title ?? undefined,
    descriptionOverride: input.description ?? undefined,
    savingOverride: typeof input.estimatedSaving === 'number' ? input.estimatedSaving : undefined,
    // Structured types own their terms via the checklist model below; free text
    // stays only for TIME_LIMITED / REUSABLE.
    terms: structured ? undefined : input.terms ?? undefined,
    selectedClauseIds: savedIds ?? (legacyCustoms ? [] : base.selectedClauseIds),
    customTerms: savedCustoms ?? legacyCustoms ?? [],
    imageUrl: input.imageUrl ?? undefined,
    savedImageUrl: input.imageUrl ?? undefined,
    expiryDate: input.expiryDate ?? undefined,
    savedExpiryDate: input.expiryDate ?? undefined,
    askHelp: bag.askHelp === true,
    availabilityWindows: input.availabilityWindows ?? [],
    // Loaded only when the detail payload actually carried a windows array.
    windowsLoaded: Array.isArray(input.availabilityWindows),
    cooldownSeconds:
      pickerId === 'reusable'
        ? input.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR
        : input.cooldownSeconds ?? undefined,
  }
}
