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
import type { BuilderType } from '@/lib/voucher/terms'
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
  terms?: string
  imageUrl?: string
  expiryDate?: string
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

// Build the API payload from the builder state. The merchantFields bag stores the
// builder draft (builderType + the DraftFields + askHelp) so a later edit can
// rehydrate. status/approvalStatus/isRmv/merchantId are NEVER set here (the server
// sets them) - they are not in CreateVoucherPayload by construction.
export function toCreatePayload(state: BuilderState): CreateVoucherPayload {
  const type = pickerIdToEnum(state)
  const title = effectiveTitle(state) || defaultTitleFor(state)
  const saving = effectiveSaving(state)

  const merchantFields: Record<string, unknown> = {
    askHelp: state.askHelp,
    builderType: state.pickerId,
    // Persist the structured DraftFields bag so editing rehydrates the inputs.
    ...(isStructuredPickerId(state.pickerId) ? { draftFields: state.fields } : {}),
  }

  const payload: CreateVoucherPayload = {
    type,
    title,
    estimatedSaving: saving > 0 ? saving : 5, // advisory floor fallback; admin review is the backstop.
    description: effectiveDescription(state) || undefined,
    terms: state.terms || undefined,
    imageUrl: state.imageUrl || undefined,
    expiryDate: state.expiryDate || undefined,
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

  return {
    ...base,
    fields: draft ?? base.fields,
    // Top-level columns become overrides so the merchant sees their real content.
    titleOverride: input.title ?? undefined,
    descriptionOverride: input.description ?? undefined,
    savingOverride: typeof input.estimatedSaving === 'number' ? input.estimatedSaving : undefined,
    terms: input.terms ?? undefined,
    imageUrl: input.imageUrl ?? undefined,
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
