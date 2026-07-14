// ─────────────────────────────────────────────────────────────────────────────
// S5: THE canonical executable fixture for voucher submission validity (item 4,
// 2026-07-14). Single source of the matrix CASES both layers test against:
//   - backend: tests/api/merchant/voucher-submit-validity.test.ts (vitest) drives
//     its lane x shape x type cross-product from this file;
//   - merchant-web: the client-side submit gate's jest suite (follow-up S5 frontend
//     slice) consumes THIS file by relative path
//     (e.g. import ... from '../../../../tests/fixtures/voucher-submit-validity-cases').
// Pure data + types only: NO imports, NO framework dependence, so both runners can
// load it without cross-package wiring. Deliberately a .ts (not .json) so non-JSON
// values (Infinity) are expressible.
//
// Parity contract (plan S5): case-list drift between the two layers is
// test-enforced by this shared fixture; resolver-logic drift (a layer interpreting
// a case differently) surfaces as fixture-case failures in that layer's suite.
// The authoritative RULE matrix stays in the plan doc section S5.3; this file is
// its executable projection. Change them together.
// ─────────────────────────────────────────────────────────────────────────────

export type SubmitLane = 'custom' | 'flagship'
// The two canonical stored Voucher.merchantFields shapes (plan S5.2):
//   nested = flagship BuilderForm write: bag.merchantFields = { builderType, ...mechanic }
//   single = custom builderModel write:  bag = { askHelp, builderType: pickerId,
//            draftFields: {mechanic}, selectedClauseIds, customTerms, baseMechanic? }
export type BagShape = 'nested' | 'single'
export type FieldCode = 'REQUIRED' | 'INVALID' | 'INCONSISTENT'
export type Draft = Record<string, unknown>

export interface FieldExpectation {
  field: string
  code: FieldCode
}

export const SUBMIT_LANES: SubmitLane[] = ['custom', 'flagship']
export const BAG_SHAPES: BagShape[] = ['single', 'nested']

// ── S6: server-owned strict submission contract (plan S6) ─────────────────────
// The marker constants MIRROR the runtime source of truth in
// src/api/merchant/voucher/submitValidation.ts (exported there as SUBMIT_CONTRACT_KEY /
// STRICT_SUBMIT_CONTRACT). Kept as PURE LITERALS here so the import-free merchant-web
// consumer can build strict bags without importing backend src; the backend suite asserts
// parity against the runtime constants so a drift fails a test rather than diverging.
export const SUBMIT_CONTRACT_KEY = '__submitContract'
export const STRICT_SUBMIT_CONTRACT = 'strict-v1'

/** Stamp the server-owned strict marker onto a stored bag (mirrors the server stamp). */
export function withStrictContract(bag: Record<string, unknown>): Record<string, unknown> {
  return { ...bag, [SUBMIT_CONTRACT_KEY]: STRICT_SUBMIT_CONTRACT }
}

// ── base types + their builder picker ids ────────────────────────────────────

export const PICKER_ID: Record<string, string> = {
  BOGO: 'bogo',
  SPEND_AND_SAVE: 'spend',
  DISCOUNT_FIXED: 'discount',
  DISCOUNT_PERCENT: 'discount',
  FREEBIE: 'freebie',
  PACKAGE_DEAL: 'package',
}

// Matrix-complete mechanic baselines per type (builderType-free; the shape builders
// in each suite attach the markers).
export const COMPLETE_MECHANICS: Record<string, Draft> = {
  BOGO: { bogoBuy: 'A main', bogoFree: 'A side', bogoFreePrice: 5 },
  SPEND_AND_SAVE: { spendAmount: 30, spendSave: 8 },
  DISCOUNT_FIXED: { discountKind: 'fixed', discAmount: 10 },
  DISCOUNT_PERCENT: { discountKind: 'percent', discPercent: 20, discTypicalOrder: 30 },
  FREEBIE: { freeItem: 'A coffee', freeWorth: 4, freeNeedsPurchase: true, freeQualify: 'Any main' },
  PACKAGE_DEAL: { packageItems: 'Two mains', packagePrice: 30, packageNormal: 45 },
}

export const BASE_TYPES: string[] = Object.keys(COMPLETE_MECHANICS)

// ── helpers (pure) ────────────────────────────────────────────────────────────

function without(draft: Draft, key: string): Draft {
  const c = { ...draft }
  delete c[key]
  return c
}
function withVal(draft: Draft, key: string, value: unknown): Draft {
  return { ...draft, [key]: value }
}

// ── per-type failure matrix ───────────────────────────────────────────────────

export interface MechanicFailCase {
  name: string
  mechanic: Draft
  expect: FieldExpectation
}

export const MECHANIC_FAIL_CASES: Record<string, MechanicFailCase[]> = {
  BOGO: [
    { name: 'missing bogoBuy', mechanic: without(COMPLETE_MECHANICS.BOGO, 'bogoBuy'), expect: { field: 'bogoBuy', code: 'REQUIRED' } },
    { name: 'blank bogoBuy', mechanic: withVal(COMPLETE_MECHANICS.BOGO, 'bogoBuy', '   '), expect: { field: 'bogoBuy', code: 'REQUIRED' } },
    { name: 'missing bogoFree', mechanic: without(COMPLETE_MECHANICS.BOGO, 'bogoFree'), expect: { field: 'bogoFree', code: 'REQUIRED' } },
    { name: 'missing bogoFreePrice', mechanic: without(COMPLETE_MECHANICS.BOGO, 'bogoFreePrice'), expect: { field: 'bogoFreePrice', code: 'REQUIRED' } },
    { name: 'zero bogoFreePrice', mechanic: withVal(COMPLETE_MECHANICS.BOGO, 'bogoFreePrice', 0), expect: { field: 'bogoFreePrice', code: 'INVALID' } },
    { name: 'negative bogoFreePrice', mechanic: withVal(COMPLETE_MECHANICS.BOGO, 'bogoFreePrice', -3), expect: { field: 'bogoFreePrice', code: 'INVALID' } },
  ],
  SPEND_AND_SAVE: [
    { name: 'missing spendAmount', mechanic: without(COMPLETE_MECHANICS.SPEND_AND_SAVE, 'spendAmount'), expect: { field: 'spendAmount', code: 'REQUIRED' } },
    { name: 'missing spendSave', mechanic: without(COMPLETE_MECHANICS.SPEND_AND_SAVE, 'spendSave'), expect: { field: 'spendSave', code: 'REQUIRED' } },
    { name: 'zero spendSave', mechanic: withVal(COMPLETE_MECHANICS.SPEND_AND_SAVE, 'spendSave', 0), expect: { field: 'spendSave', code: 'INVALID' } },
    { name: 'save equals spend', mechanic: { ...COMPLETE_MECHANICS.SPEND_AND_SAVE, spendAmount: 30, spendSave: 30 }, expect: { field: 'spendSave', code: 'INCONSISTENT' } },
    { name: 'save exceeds spend', mechanic: { ...COMPLETE_MECHANICS.SPEND_AND_SAVE, spendAmount: 30, spendSave: 40 }, expect: { field: 'spendSave', code: 'INCONSISTENT' } },
  ],
  DISCOUNT_FIXED: [
    { name: 'missing discAmount', mechanic: without(COMPLETE_MECHANICS.DISCOUNT_FIXED, 'discAmount'), expect: { field: 'discAmount', code: 'REQUIRED' } },
    { name: 'zero discAmount', mechanic: withVal(COMPLETE_MECHANICS.DISCOUNT_FIXED, 'discAmount', 0), expect: { field: 'discAmount', code: 'INVALID' } },
    { name: 'non-finite discAmount', mechanic: withVal(COMPLETE_MECHANICS.DISCOUNT_FIXED, 'discAmount', Infinity), expect: { field: 'discAmount', code: 'INVALID' } },
  ],
  DISCOUNT_PERCENT: [
    { name: 'missing discPercent', mechanic: without(COMPLETE_MECHANICS.DISCOUNT_PERCENT, 'discPercent'), expect: { field: 'discPercent', code: 'REQUIRED' } },
    { name: 'zero discPercent', mechanic: withVal(COMPLETE_MECHANICS.DISCOUNT_PERCENT, 'discPercent', 0), expect: { field: 'discPercent', code: 'INVALID' } },
    { name: 'over-100 discPercent', mechanic: withVal(COMPLETE_MECHANICS.DISCOUNT_PERCENT, 'discPercent', 150), expect: { field: 'discPercent', code: 'INVALID' } },
    { name: 'no pricing basis (no discMin, no discTypicalOrder)', mechanic: without(COMPLETE_MECHANICS.DISCOUNT_PERCENT, 'discTypicalOrder'), expect: { field: 'discTypicalOrder', code: 'REQUIRED' } },
  ],
  FREEBIE: [
    { name: 'missing freeItem', mechanic: without(COMPLETE_MECHANICS.FREEBIE, 'freeItem'), expect: { field: 'freeItem', code: 'REQUIRED' } },
    { name: 'missing freeWorth', mechanic: without(COMPLETE_MECHANICS.FREEBIE, 'freeWorth'), expect: { field: 'freeWorth', code: 'REQUIRED' } },
    { name: 'zero freeWorth', mechanic: withVal(COMPLETE_MECHANICS.FREEBIE, 'freeWorth', 0), expect: { field: 'freeWorth', code: 'INVALID' } },
    { name: 'needs purchase but no qualifier', mechanic: without(COMPLETE_MECHANICS.FREEBIE, 'freeQualify'), expect: { field: 'freeQualify', code: 'REQUIRED' } },
  ],
  PACKAGE_DEAL: [
    { name: 'missing packageItems', mechanic: without(COMPLETE_MECHANICS.PACKAGE_DEAL, 'packageItems'), expect: { field: 'packageItems', code: 'REQUIRED' } },
    { name: 'missing packagePrice', mechanic: without(COMPLETE_MECHANICS.PACKAGE_DEAL, 'packagePrice'), expect: { field: 'packagePrice', code: 'REQUIRED' } },
    { name: 'missing packageNormal', mechanic: without(COMPLETE_MECHANICS.PACKAGE_DEAL, 'packageNormal'), expect: { field: 'packageNormal', code: 'REQUIRED' } },
    { name: 'price equals normal', mechanic: { ...COMPLETE_MECHANICS.PACKAGE_DEAL, packagePrice: 30, packageNormal: 30 }, expect: { field: 'packagePrice', code: 'INCONSISTENT' } },
    { name: 'price exceeds normal', mechanic: { ...COMPLETE_MECHANICS.PACKAGE_DEAL, packagePrice: 50, packageNormal: 45 }, expect: { field: 'packagePrice', code: 'INCONSISTENT' } },
  ],
}

// ── alternative VALID mechanics (must never be blocked) ───────────────────────

export interface AltValidCase {
  name: string
  type: string
  mechanic: Draft
}

export const ALT_VALID_CASES: AltValidCase[] = [
  {
    name: 'DISCOUNT_PERCENT: a minimum spend satisfies the pricing basis (no typical order needed)',
    type: 'DISCOUNT_PERCENT',
    mechanic: { discountKind: 'percent', discPercent: 20, discMin: 40 },
  },
  {
    name: 'FREEBIE: a standalone freebie needs no qualifying purchase',
    type: 'FREEBIE',
    mechanic: { freeItem: 'A tote bag', freeWorth: 6, freeNeedsPurchase: false },
  },
]

// ── universal invariants (checked regardless of the structured bag) ───────────

export interface UniversalCase {
  name: string
  type: string
  /** Overrides applied to the voucher's top-level columns. */
  voucherPatch: { title?: unknown; estimatedSaving?: unknown }
  expect: FieldExpectation
}

export const UNIVERSAL_CASES: UniversalCase[] = [
  { name: 'blank title', type: 'BOGO', voucherPatch: { title: '   ' }, expect: { field: 'title', code: 'REQUIRED' } },
  { name: 'zero estimatedSaving', type: 'BOGO', voucherPatch: { estimatedSaving: 0 }, expect: { field: 'estimatedSaving', code: 'INVALID' } },
]

// ── wrapper cases (custom lane only) ──────────────────────────────────────────

export interface WrapperCase {
  name: string
  wrapper: 'TIME_LIMITED' | 'REUSABLE'
  pickerId: 'time' | 'reusable'
  /** Underlying mechanic id; null = the merchant never picked one (marker-only bag). */
  baseMechanic: string | null
  /** Mechanic fields; null when baseMechanic is null. */
  mechanic: Draft | null
  windowCount: number
  cooldownSeconds: number | null
  /** SUBMITS | WINDOW_GATE (TIME_LIMITED_REQUIRES_WINDOW) | a VOUCHER_INCOMPLETE field. */
  outcome: 'SUBMITS' | 'WINDOW_GATE' | FieldExpectation
  /** Which stored shapes the case runs in (default: both). Marker-only bags exist
   * only in the custom single-level shape. */
  shapes?: BagShape[]
}

const WRAPPED_BOGO = COMPLETE_MECHANICS.BOGO

export const WRAPPER_CASES: WrapperCase[] = [
  {
    name: 'TIME_LIMITED with zero windows rejects with the window gate',
    wrapper: 'TIME_LIMITED', pickerId: 'time', baseMechanic: 'bogo', mechanic: WRAPPED_BOGO,
    windowCount: 0, cooldownSeconds: null, outcome: 'WINDOW_GATE',
  },
  {
    name: 'TIME_LIMITED with a window but an INCOMPLETE underlying mechanic rejects',
    wrapper: 'TIME_LIMITED', pickerId: 'time', baseMechanic: 'bogo', mechanic: without(WRAPPED_BOGO, 'bogoFreePrice'),
    windowCount: 1, cooldownSeconds: null, outcome: { field: 'bogoFreePrice', code: 'REQUIRED' },
  },
  {
    name: 'TIME_LIMITED with a window AND a complete underlying mechanic submits',
    wrapper: 'TIME_LIMITED', pickerId: 'time', baseMechanic: 'bogo', mechanic: WRAPPED_BOGO,
    windowCount: 1, cooldownSeconds: null, outcome: 'SUBMITS',
  },
  {
    name: 'REUSABLE without a cooldown rejects',
    wrapper: 'REUSABLE', pickerId: 'reusable', baseMechanic: 'bogo', mechanic: WRAPPED_BOGO,
    windowCount: 0, cooldownSeconds: null, outcome: { field: 'cooldownSeconds', code: 'REQUIRED' },
  },
  {
    name: 'REUSABLE with a below-floor cooldown rejects',
    wrapper: 'REUSABLE', pickerId: 'reusable', baseMechanic: 'bogo', mechanic: WRAPPED_BOGO,
    windowCount: 0, cooldownSeconds: 600, outcome: { field: 'cooldownSeconds', code: 'INVALID' },
  },
  {
    name: 'REUSABLE with a valid cooldown AND a complete underlying mechanic submits',
    wrapper: 'REUSABLE', pickerId: 'reusable', baseMechanic: 'bogo', mechanic: WRAPPED_BOGO,
    windowCount: 0, cooldownSeconds: 3600, outcome: 'SUBMITS',
  },
  {
    name: 'TIME_LIMITED wrapper with NO base mechanic picked rejects',
    wrapper: 'TIME_LIMITED', pickerId: 'time', baseMechanic: null, mechanic: null,
    windowCount: 1, cooldownSeconds: null, outcome: { field: 'baseMechanic', code: 'REQUIRED' },
    shapes: ['single'],
  },
  {
    name: 'REUSABLE wrapper with NO base mechanic picked rejects',
    wrapper: 'REUSABLE', pickerId: 'reusable', baseMechanic: null, mechanic: null,
    windowCount: 0, cooldownSeconds: 3600, outcome: { field: 'baseMechanic', code: 'REQUIRED' },
    shapes: ['single'],
  },
  {
    name: 'TIME_LIMITED wrapping a percent discount with no pricing basis rejects',
    wrapper: 'TIME_LIMITED', pickerId: 'time', baseMechanic: 'discount', mechanic: { discountKind: 'percent', discPercent: 20 },
    windowCount: 1, cooldownSeconds: null, outcome: { field: 'discTypicalOrder', code: 'REQUIRED' },
    shapes: ['single'],
  },
]

// ── legacy / opaque-bag compatibility (custom lane) ───────────────────────────
//
// S6: EVERY case here is INDICATOR-ABSENT (a genuine pre-S6 / markerless bag). The
// server-owned strict marker is NOT present, so these validate on the universal
// invariants plus any structured bag only, exactly as before. The mirror-image
// INDICATOR-PRESENT scenarios (a strict empty / opaque bag that now FAILS CLOSED) live in
// STRICT_CONTRACT_CASES below. Splitting the two keeps this list safe for the merchant-web
// client-gate suite, which iterates LEGACY_CASES without S6 awareness (the client gate's
// own S6 adoption is a separate follow-up slice).

export interface LegacyCase {
  name: string
  /** The stored Voucher.merchantFields bag, verbatim (INDICATOR-ABSENT: no strict marker). */
  bag: unknown
  /** Top-level column override (defaults valid in the suite). */
  estimatedSaving?: number
  outcome: 'SUBMITS' | FieldExpectation
}

export const LEGACY_CASES: LegacyCase[] = [
  { name: 'an indicator-absent voucher with a null bag submits on universal invariants (legacy)', bag: null, outcome: 'SUBMITS' },
  { name: 'an indicator-absent empty bag ({}) submits on universal invariants (legacy admin-concierge / pre-S6)', bag: {}, outcome: 'SUBMITS' },
  { name: 'an indicator-absent flat opaque bag WITHOUT builderType submits on universal invariants (legacy)', bag: { askHelp: true, someLegacyKey: 'x' }, outcome: 'SUBMITS' },
  {
    name: 'a marker-only bag (builderType, no draftFields) is structured and fails closed even when indicator-absent',
    bag: { askHelp: true, builderType: 'bogo' },
    outcome: { field: 'bogoBuy', code: 'REQUIRED' },
  },
  {
    name: 'an indicator-absent voucher with a zero saving is still blocked',
    bag: null,
    estimatedSaving: 0,
    outcome: { field: 'estimatedSaving', code: 'INVALID' },
  },
]

// ── S6: strict-contract (indicator-PRESENT) compatibility (custom lane) ────────
//
// The mirror image of LEGACY_CASES. Each `bag` is the INNER stored bag BEFORE the
// server-owned marker is applied; the suite stamps it (withStrictContract) so the row is
// STRICT. Under S6 a strict row with an empty / opaque bag has no usable mechanic field
// and FAILS CLOSED on the mechanic derived from the AUTHORITATIVE Voucher.type; a strict
// row that carries a complete structured mechanic still submits. This is the executable
// projection of the S5-bypass fix.
export interface StrictContractCase {
  name: string
  type: string
  /** The inner stored bag; the suite stamps the strict marker onto it. */
  bag: Record<string, unknown>
  estimatedSaving?: number
  outcome: 'SUBMITS' | FieldExpectation
}

export const STRICT_CONTRACT_CASES: StrictContractCase[] = [
  { name: 'a STRICT empty bag fails closed on the authoritative BOGO mechanic', type: 'BOGO', bag: {}, outcome: { field: 'bogoBuy', code: 'REQUIRED' } },
  { name: 'a STRICT empty bag fails closed on the authoritative DISCOUNT_PERCENT mechanic', type: 'DISCOUNT_PERCENT', bag: {}, outcome: { field: 'discPercent', code: 'REQUIRED' } },
  { name: 'a STRICT flat opaque bag (marker, no builderType) still fails closed (opaque keys never satisfy the matrix)', type: 'BOGO', bag: { askHelp: true, someLegacyKey: 'x' }, outcome: { field: 'bogoBuy', code: 'REQUIRED' } },
  { name: 'a STRICT complete nested bag submits', type: 'BOGO', bag: { merchantFields: { builderType: 'bogo', ...COMPLETE_MECHANICS.BOGO } }, outcome: 'SUBMITS' },
  { name: 'a STRICT complete single bag submits', type: 'BOGO', bag: { askHelp: false, builderType: 'bogo', draftFields: { type: 'bogo', ...COMPLETE_MECHANICS.BOGO } }, outcome: 'SUBMITS' },
]
