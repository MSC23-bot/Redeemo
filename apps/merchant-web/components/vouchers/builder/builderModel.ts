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
import {
  scheduleTitleSuffix,
  scheduleDescSuffix,
  reuseTitleSuffix,
  reuseDescSuffix,
} from '@/lib/voucher/builderCopy'
import type { CategoryKey } from '@/lib/voucher/config'
import type { AvailabilityWindow, CreateVoucherPayload, VoucherTypeEnum } from '@/lib/api/voucher'

// The picker exposes 7 cards => 8 backend types. The day-2 picker id space is the
// 5 structured BuilderType ids + 'time' + 'reusable' (discount fixed/percent is a
// kind toggle inside the discount fields, not two cards).
export type DayTwoPickerId = BuilderType | 'time' | 'reusable'

export const STRUCTURED_PICKER_IDS: BuilderType[] = ['bogo', 'spend', 'discount', 'freebie', 'package']

export const WRAPPER_PICKER_IDS: Array<'time' | 'reusable'> = ['time', 'reusable']

export function isStructuredPickerId(id: DayTwoPickerId): id is BuilderType {
  return (STRUCTURED_PICKER_IDS as DayTwoPickerId[]).includes(id)
}

export function isWrapperPickerId(id: DayTwoPickerId): id is 'time' | 'reusable' {
  return id === 'time' || id === 'reusable'
}

// The 5 base mechanics a TIME_LIMITED / REUSABLE wrapper can wrap (prototype Step 1).
export const WRAPPER_BASE_MECHANICS: BuilderType[] = ['bogo', 'spend', 'discount', 'freebie', 'package']

// Whether the current state exposes the structured per-type field group + composed
// title/description/saving + score. True for the 5 structured types and for a wrapper
// type once its base mechanic (Step 1) has been picked.
export function hasStructuredFields(state: BuilderState): boolean {
  if (isStructuredPickerId(state.pickerId)) return true
  return isWrapperPickerId(state.pickerId) && state.baseMechanic != null
}

// Whether the current type composes its terms from a clause checklist. True for ALL
// 8 types: the wrapper cadence clauses (time_avail / reuse_active + CORE) do not
// depend on the base mechanic, so a wrapper composes its terms even before a base is
// picked. (There is no remaining free-text terms path in the custom lane.)
export function hasClauseModel(state: BuilderState): boolean {
  return isStructuredPickerId(state.pickerId) || isWrapperPickerId(state.pickerId)
}

// Day-2 default-checked clause ids. Wrapper types + the live BOGO default
// (['tell_staff','no_combine'], A7) live HERE, not in the shared
// defaultSelectedClauseIds, so the onboarding flagship lane (S2) stays untouched.
export function dayTwoDefaultClauseIds(pickerId: DayTwoPickerId, baseMechanic?: BuilderType | null): string[] {
  if (pickerId === 'time') return ['time_avail', 'time_once_window', 'tell_staff']
  if (pickerId === 'reusable') return ['reuse_active', 'tell_staff']
  if (pickerId === 'bogo') return ['tell_staff', 'no_combine']
  return defaultSelectedClauseIds((baseMechanic ?? pickerId) as BuilderType)
}

// The full builder form state. For structured types `fields` is the DraftFields
// bag; for time/reusable `fields.type` is unused (we keep it typed loosely).
export interface BuilderState {
  pickerId: DayTwoPickerId
  // Wrapper (S1): for pickerId 'time' | 'reusable', the base mechanic chosen in
  // Step 1 (prototype wrapper model). null until picked. For the 5 structured types
  // it stays null (pickerId itself is the mechanic). `fields.type` is kept in sync
  // with the base mechanic so compose / deriveSaving / clauses operate on it. The
  // stored VoucherType stays the wrapper type (plan section 3).
  baseMechanic?: BuilderType | null
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
    // Wrappers start with no base mechanic (Step 1 empty state: "Pick what runs first").
    baseMechanic: isWrapperPickerId(pickerId) ? null : undefined,
    fields: {
      type: structuredType,
      discountKind: pickerId === 'discount' ? 'percent' : undefined,
    },
    // Structured types seed their default clauses immediately; wrappers seed the
    // wrapper cadence defaults now (the base-mechanic pick adds none extra).
    selectedClauseIds: isStructuredPickerId(pickerId)
      ? dayTwoDefaultClauseIds(pickerId)
      : isWrapperPickerId(pickerId)
        ? dayTwoDefaultClauseIds(pickerId)
        : [],
    customTerms: [],
    askHelp: false,
    availabilityWindows: [],
    // A fresh CREATE builder owns its window state from the start.
    windowsLoaded: true,
    cooldownSeconds: pickerId === 'reusable' ? REUSABLE_COOLDOWN_FLOOR : undefined,
  }
}

// Wrapper Step 1: pick the base mechanic. Seeds fields.type + discountKind so the
// composed title/description/saving + score + clauses operate on the mechanic. Terms
// stay the wrapper cadence defaults (they do not depend on the mechanic).
export function withBaseMechanic(state: BuilderState, mechanic: BuilderType): BuilderState {
  return {
    ...state,
    baseMechanic: mechanic,
    fields: {
      ...state.fields,
      type: mechanic,
      discountKind: mechanic === 'discount' ? state.fields.discountKind ?? 'percent' : state.fields.discountKind,
    },
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

// The base mechanic driving composition: the picker id for the 5 structured types,
// or the chosen wrapper base mechanic for TIME_LIMITED / REUSABLE.
export function baseMechanicOf(state: BuilderState): BuilderType | null {
  if (isStructuredPickerId(state.pickerId)) return state.pickerId
  return state.baseMechanic ?? null
}

// The wrapper suffix appended to the composed title (schedule / cadence). Empty for
// the 5 structured types and for a wrapper without enough context yet.
function wrapperTitleSuffix(state: BuilderState): string {
  if (state.pickerId === 'time') return scheduleTitleSuffix(state.availabilityWindows)
  if (state.pickerId === 'reusable') return reuseTitleSuffix(state.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR)
  return ''
}
function wrapperDescSuffix(state: BuilderState): string {
  if (state.pickerId === 'time') return scheduleDescSuffix(state.availabilityWindows)
  if (state.pickerId === 'reusable') return reuseDescSuffix(state.cooldownSeconds ?? REUSABLE_COOLDOWN_FLOOR)
  return ''
}

// The composed (or overridden) title for the current state. Wrappers compose from
// their base mechanic + the schedule / cadence suffix (FULL.html L12490 / L12500).
export function effectiveTitle(state: BuilderState): string {
  if (state.titleOverride != null && state.titleOverride.trim().length > 0) return state.titleOverride
  if (isStructuredPickerId(state.pickerId)) return composeTitle(state.fields)
  if (isWrapperPickerId(state.pickerId) && state.baseMechanic != null) {
    return `${composeTitle(state.fields)}${wrapperTitleSuffix(state)}`.slice(0, 60)
  }
  return ''
}

export function effectiveDescription(state: BuilderState): string {
  if (state.descriptionOverride != null && state.descriptionOverride.trim().length > 0) {
    return state.descriptionOverride
  }
  if (isStructuredPickerId(state.pickerId)) return composeDescription(state.fields)
  if (isWrapperPickerId(state.pickerId) && state.baseMechanic != null) {
    return `${composeDescription(state.fields)}${wrapperDescSuffix(state)}`.slice(0, 300)
  }
  return ''
}

export function effectiveSaving(state: BuilderState): number {
  if (typeof state.savingOverride === 'number' && state.savingOverride > 0) return state.savingOverride
  if (hasStructuredFields(state)) return deriveSaving(state.fields)
  return 0
}

export function effectiveSavingPercent(state: BuilderState): number {
  if (hasStructuredFields(state)) return deriveSavingPercent(state.fields)
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
  const f = state.fields
  if (isWrapperPickerId(state.pickerId)) {
    // Wrapper cadence clauses do not depend on the base mechanic; a placeholder type
    // is fine (the wrapper branch of buildClauseList ignores it beyond category flags).
    return buildClauseList({
      type: baseMechanicOf(state) ?? 'bogo',
      categoryKey,
      wrapper: state.pickerId,
    })
  }
  if (!isStructuredPickerId(state.pickerId)) return []
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
  // Structured field bag is persisted for the 5 structured types AND for a wrapper
  // once its base mechanic is picked (so an edit rehydrates the mechanic inputs).
  const persistBag = hasStructuredFields(state)
  // Terms compose from the checklist for EVERY type (all 5 structured + both wrappers,
  // whose cadence clauses do not need a base mechanic). The opaque merchantFields bag
  // is server-side unchanged (16KB / 50-key guard, admin-key strip all preserved).
  const composesTerms = hasClauseModel(state)

  const merchantFields: Record<string, unknown> = {
    askHelp: state.askHelp,
    builderType: state.pickerId,
    // Persist the DraftFields bag + clause selections so editing rehydrates the
    // inputs (mirrors the onboarding builder's bag shape). For wrappers also persist
    // the chosen base mechanic (plan section 3: wrapper model lives client-side).
    ...(persistBag
      ? {
          draftFields: state.fields,
          selectedClauseIds: state.selectedClauseIds,
          customTerms: state.customTerms,
          ...(isWrapperPickerId(state.pickerId) && state.baseMechanic
            ? { baseMechanic: state.baseMechanic }
            : {}),
        }
      : {}),
  }

  // A structured/wrapper compose ALWAYS sends the string - including '' when the
  // merchant removed every clause/custom - so a partial PATCH actually CLEARS the
  // stored terms instead of silently keeping the old text (the key would otherwise
  // be omitted). Backend zod accepts ''. Free text stays only for a wrapper that has
  // no base mechanic yet (edge case; no clause pool to compose from).
  const termsText = composesTerms ? composeTermsText(state, categoryKey) : state.terms

  const payload: CreateVoucherPayload = {
    type,
    title,
    estimatedSaving: saving > 0 ? saving : 5, // advisory floor fallback; admin review is the backstop.
    description: effectiveDescription(state) || undefined,
    terms: composesTerms ? termsText : termsText || undefined,
    // Nullable-clear (D1): explicit null survives serialization as a clear
    // signal; falsy-but-not-null still coerces to omission. The two lines are
    // deliberately INDEPENDENT per-field checks - never couple them.
    // (normalizeExpiryDate owns the null-passthrough + falsy-to-undefined
    // handling for expiryDate; imageUrl keeps its inline ternary because no
    // equivalent helper exists for it.)
    imageUrl: state.imageUrl === null ? null : state.imageUrl || undefined,
    expiryDate: normalizeExpiryDate(state.expiryDate),
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
  // Wrapper base-mechanic rehydration (S1): a wrapper voucher persisted its base
  // mechanic (bag.baseMechanic) and its DraftFields (bag.draftFields.type). A legacy
  // wrapper (pre-S1) has neither: baseMechanic stays null (the builder shows the
  // Step-1 empty state) and its free-text terms are preserved.
  const bagBase = typeof bag.baseMechanic === 'string' ? bag.baseMechanic : undefined
  const draftType = draft && typeof draft.type === 'string' ? draft.type : undefined
  const wrapperBaseCandidate = bagBase ?? draftType
  const baseMechanic = isWrapperPickerId(pickerId)
    ? isStructuredPickerId((wrapperBaseCandidate ?? '') as DayTwoPickerId)
      ? (wrapperBaseCandidate as BuilderType)
      : null
    : undefined
  // Whether this state has a clause model (all structured + wrappers): legacy
  // free-text terms convert to custom terms so nothing is silently dropped.
  const hasBase = isStructuredPickerId(pickerId) || isWrapperPickerId(pickerId)
  const legacyCustoms =
    hasBase && savedIds == null && typeof input.terms === 'string' && input.terms.trim().length > 0
      ? input.terms
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((text) => ({ text, tier: tierOf(text) }))
      : null

  return {
    ...base,
    baseMechanic,
    fields: draft ?? base.fields,
    // Top-level columns become overrides so the merchant sees their real content.
    titleOverride: input.title ?? undefined,
    descriptionOverride: input.description ?? undefined,
    savingOverride: typeof input.estimatedSaving === 'number' ? input.estimatedSaving : undefined,
    // Types with a clause model own their terms via the checklist; free text stays
    // only for a legacy wrapper with no rehydrated base mechanic.
    terms: hasBase ? undefined : input.terms ?? undefined,
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
