// ─────────────────────────────────────────────────────────────────────────────
// S5: voucher submission validity (owner requirement 2026-07-13)
//
// Merchants may SAVE incomplete drafts, but SUBMIT FOR REVIEW must FAIL CLOSED
// until every field needed to DEFINE the offer and to CALCULATE an honest estimated
// saving is present and valid. This module is the pure, prisma-free validator both
// submit services call (custom submitVoucher + flagship submitRmvVoucherCore). The
// advisory score stays NON-GATING: a complete-but-weak voucher still submits.
//
// The authoritative matrix lives in docs/superpowers/plans/2026-07-13-voucher-builder-
// prototype-fidelity.md section S5; keep the two in sync. The client-side submit gate
// (a follow-up slice) reuses THIS matrix so the two layers never diverge.
//
// Everything here is defensive: an unknown / poisoned / legacy bag degrades to
// "field absent" rather than throwing, so no bag shape can produce a 500 (S5.6).
// ─────────────────────────────────────────────────────────────────────────────

import { AppError } from '../../shared/errors'

// The six structured mechanic types (the flagship-eligible set) plus the two
// wrappers. DISCOUNT is split into fixed/percent at the enum level.
export type MechanicType =
  | 'BOGO'
  | 'SPEND_AND_SAVE'
  | 'DISCOUNT_FIXED'
  | 'DISCOUNT_PERCENT'
  | 'FREEBIE'
  | 'PACKAGE_DEAL'

const MECHANIC_TYPES: readonly string[] = [
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT_FIXED',
  'DISCOUNT_PERCENT',
  'FREEBIE',
  'PACKAGE_DEAL',
]

const WRAPPER_TYPES: readonly string[] = ['TIME_LIMITED', 'REUSABLE']

// The full VoucherType enum (matches prisma schema + routes.ts Zod enum).
const KNOWN_VOUCHER_TYPES: readonly string[] = [...MECHANIC_TYPES, ...WRAPPER_TYPES]

// REUSABLE cooldown floor (mirrors the routes.ts Zod floor + the DB CHECK).
export const REUSABLE_COOLDOWN_FLOOR_SECONDS = 1800

// Decimal(10,2) column ceiling (mirrors service.ts RMV_SAVING_COLUMN_MAX).
const SAVING_COLUMN_MAX = 100000000

// Stable per-field code set (S5.4). Small on purpose so both layers can key inline UI.
export type FieldCode = 'REQUIRED' | 'INVALID' | 'INCONSISTENT'

export interface FieldError {
  field: string
  code: FieldCode
  message: string
}

// The effective voucher the caller assembles from top-level columns + the bag
// (after the flagship promotion/re-link bridge has computed the values to be written).
export interface EffectiveVoucher {
  type: string
  title: unknown
  // Already-effective (promoted, coerced-to-number) estimated saving.
  estimatedSaving: unknown
  // The FULL Voucher.merchantFields bag (either lane); the structured draft bag is
  // located inside it by resolveStructuredBag.
  merchantFields: unknown
  // Availability-window count (custom TIME_LIMITED only; 0 for every other case).
  windowCount: number
  // Persisted cooldownSeconds (custom REUSABLE only; null otherwise).
  cooldownSeconds: number | null
}

// ── bag helpers ──────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ── S6: server-owned strict submission contract (owner-approved 2026-07-14) ────
//
// THE tamper-resistant strictness signal. A single server-owned, VERSIONED key
// stamped into Voucher.merchantFields at every voucher-birth path (see service.ts).
// It is the SOURCE OF TRUTH for whether the submit gate enforces the per-type
// mechanic matrix; it is deliberately NOT `builderType` (merchant-mutable, so a
// client marker is not tamper-resistant) nor a schema column (no migration in this
// slice). A merchant/admin API caller can never supply, set, overwrite, blank or
// remove it: service.ts strips it from EVERY caller-supplied bag before every write,
// and every write path MERGES the stored bag over the stripped input (or leaves the
// bag untouched), so the stored value always survives. The name is `__`-prefixed so
// it cannot collide with a real merchant builder field.
//
// PRESENT (strict-v1)  -> the submit gate enforces the mechanic matrix, driven by the
//   AUTHORITATIVE Voucher.type (+ discountKind); a row with an empty / opaque bag has
//   no usable mechanic field and FAILS CLOSED (VOUCHER_INCOMPLETE) instead of slipping
//   through on the universal invariants. This is the S5-bypass fix.
// ABSENT               -> a genuine legacy row (pre-S6): validated on the universal
//   invariants plus any structured bag ONLY, exactly as before (S5.6 compatibility).
//   Markerless legacy rows stay submittable until the owner decides their disposition.
//
// The value is versioned so a future contract revision is a NEW token, never a silent
// change of meaning for an existing marker.
export const SUBMIT_CONTRACT_KEY = '__submitContract'
export const STRICT_SUBMIT_CONTRACT = 'strict-v1'

/** True when the bag carries the server-owned strict marker at its top level. */
export function isStrictSubmitContract(merchantFields: unknown): boolean {
  return isObject(merchantFields) && merchantFields[SUBMIT_CONTRACT_KEY] === STRICT_SUBMIT_CONTRACT
}

/**
 * Stamp the server-owned strict marker onto a bag (returns a new object). SERVER-SIDE
 * ONLY: callers MUST strip any caller-supplied SUBMIT_CONTRACT_KEY first (service.ts
 * stripCallerOwnedKeys) so a client value can never survive to be re-stamped over.
 */
export function stampStrictSubmitContract(bag: Record<string, unknown>): Record<string, unknown> {
  return { ...bag, [SUBMIT_CONTRACT_KEY]: STRICT_SUBMIT_CONTRACT }
}

/**
 * Locate the structured DraftFields bag (S5.2). TWO canonical stored shapes exist
 * (both merged on main):
 *
 * 1. FLAGSHIP (onboarding BuilderForm.buildPayload -> updateRmvVoucherCore merge):
 *    the whole PATCH body lands in Voucher.merchantFields, so the structured draft is
 *    a NESTED `merchantFields` object carrying a string `builderType` with the
 *    mechanic fields FLAT inside it (discountKind at its top level).
 * 2. CUSTOM (day-2 builderModel.toCreatePayload): a SINGLE-LEVEL bag
 *    `{ askHelp, builderType: pickerId, draftFields: {mechanic fields}, selectedClauseIds,
 *    customTerms, baseMechanic? }`. The mechanic fields (incl. discountKind) live inside
 *    `draftFields`; a wrapper's underlying mechanic id ('bogo'..'package') lives in
 *    `baseMechanic` (the pickerId itself is 'time' | 'reusable' for wrappers).
 *
 * Both are normalised to ONE flat draft object so resolveMechanicType /
 * validateMechanic read them identically. The unrelated custom keys (askHelp /
 * selectedClauseIds / customTerms) are never read by the matrix. Precedence: the
 * nested flagship shape wins when both are somehow present (it is the more specific
 * write). Any other bag (null / {} / flat opaque bag WITHOUT a string builderType /
 * admin-concierge) returns null so the per-type matrix is skipped (S5.6
 * compatibility rule).
 */
export function resolveStructuredBag(merchantFields: unknown): Record<string, unknown> | null {
  if (!isObject(merchantFields)) return null
  // Shape 1: flagship double-nested (more specific) wins.
  const nested = merchantFields.merchantFields
  if (isObject(nested) && typeof nested.builderType === 'string') return nested
  // Shape 2: custom single-level. draftFields is spread FIRST so the bag-top-level
  // builderType / baseMechanic markers stay authoritative even against a poisoned
  // draftFields carrying same-named keys.
  if (typeof merchantFields.builderType === 'string') {
    const draftFields = merchantFields.draftFields
    return {
      ...(isObject(draftFields) ? draftFields : {}),
      builderType: merchantFields.builderType,
      ...(typeof merchantFields.baseMechanic === 'string'
        ? { baseMechanic: merchantFields.baseMechanic }
        : {}),
    }
  }
  return null
}

// Map a builder id ('bogo' | 'spend' | 'discount' | 'freebie' | 'package') to the
// mechanic enum; discount resolves fixed-vs-percent via the supplied kind resolver.
function mechanicFromBuilderId(id: unknown, fromDiscountKind: () => MechanicType | null): MechanicType | null {
  switch (id) {
    case 'bogo':
      return 'BOGO'
    case 'spend':
      return 'SPEND_AND_SAVE'
    case 'freebie':
      return 'FREEBIE'
    case 'package':
      return 'PACKAGE_DEAL'
    case 'discount':
      return fromDiscountKind() ?? 'DISCOUNT_PERCENT'
    default:
      return null
  }
}

/**
 * Resolve the mechanic type to validate. For a base type the top-level type is
 * authoritative, EXCEPT that a discount's fixed-vs-percent is taken from the draft
 * bag's `discountKind` when present (mirrors the submit bridge's re-link intent, so
 * the mechanic validated matches the offer the merchant actually built even if the
 * top-level column has not been re-linked yet). For a wrapper (TIME_LIMITED /
 * REUSABLE) the underlying mechanic is the draft's `baseMechanic` (the custom
 * single-level shape) or, as a fallback, its `builderType` when that is itself a
 * mechanic id (a nested-shape wrapper bag from a direct API caller). Returns null
 * when no mechanic is derivable (validated on universal invariants only).
 */
export function resolveMechanicType(topLevelType: string, draft: Record<string, unknown> | null): MechanicType | null {
  const discountKind = draft?.discountKind
  const fromDiscountKind = (): MechanicType | null => {
    if (discountKind === 'fixed') return 'DISCOUNT_FIXED'
    if (discountKind === 'percent') return 'DISCOUNT_PERCENT'
    return null
  }

  if (topLevelType === 'DISCOUNT_FIXED' || topLevelType === 'DISCOUNT_PERCENT') {
    return fromDiscountKind() ?? (topLevelType as MechanicType)
  }
  if (MECHANIC_TYPES.includes(topLevelType)) return topLevelType as MechanicType

  if (WRAPPER_TYPES.includes(topLevelType)) {
    return (
      mechanicFromBuilderId(draft?.baseMechanic, fromDiscountKind) ??
      mechanicFromBuilderId(draft?.builderType, fromDiscountKind)
    )
  }
  return null
}

// ── field validators (each pushes at most one FieldError) ─────────────────────

function requireText(draft: Record<string, unknown>, field: string, label: string, out: FieldError[]): void {
  const v = draft[field]
  if (typeof v !== 'string' || v.trim().length === 0) {
    out.push({ field, code: 'REQUIRED', message: `${label} is required.` })
  }
}

/**
 * Require a finite number strictly greater than zero. `max` (exclusive/inclusive per
 * caller) bounds the value where a range applies (e.g. a percentage). Absent -> REQUIRED;
 * present-but-bad -> INVALID.
 */
function requirePositiveNumber(
  draft: Record<string, unknown>,
  field: string,
  label: string,
  out: FieldError[],
  opts?: { maxInclusive?: number },
): void {
  const v = draft[field]
  if (v === undefined || v === null) {
    out.push({ field, code: 'REQUIRED', message: `${label} is required.` })
    return
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    out.push({ field, code: 'INVALID', message: `${label} must be a number greater than zero.` })
    return
  }
  if (opts?.maxInclusive !== undefined && v > opts.maxInclusive) {
    out.push({ field, code: 'INVALID', message: `${label} must be at most ${opts.maxInclusive}.` })
  }
}

// Read a finite number or undefined (never throws on a poisoned value).
function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

// ── per-type mechanic matrix (S5.3) ───────────────────────────────────────────

function validateMechanic(mechanic: MechanicType, draft: Record<string, unknown>, out: FieldError[]): void {
  switch (mechanic) {
    case 'BOGO': {
      // Both sides identified + the free-item saving calculable.
      requireText(draft, 'bogoBuy', 'The item the customer buys', out)
      requireText(draft, 'bogoFree', 'The free item', out)
      requirePositiveNumber(draft, 'bogoFreePrice', 'The value of the free item', out)
      break
    }
    case 'SPEND_AND_SAVE': {
      requirePositiveNumber(draft, 'spendAmount', 'The spend amount', out)
      requirePositiveNumber(draft, 'spendSave', 'The save amount', out)
      // Contradiction: you cannot save at or above the qualifying spend.
      const spend = numOrUndef(draft.spendAmount)
      const save = numOrUndef(draft.spendSave)
      if (spend !== undefined && save !== undefined && save > 0 && spend > 0 && save >= spend) {
        out.push({ field: 'spendSave', code: 'INCONSISTENT', message: 'The save amount must be less than the spend amount.' })
      }
      break
    }
    case 'DISCOUNT_FIXED': {
      requirePositiveNumber(draft, 'discAmount', 'The amount off', out)
      break
    }
    case 'DISCOUNT_PERCENT': {
      requirePositiveNumber(draft, 'discPercent', 'The discount percentage', out, { maxInclusive: 100 })
      // Pricing basis so an honest saving can be calculated: a minimum spend OR a
      // typical order value. Either satisfies the requirement.
      const min = numOrUndef(draft.discMin)
      const typical = numOrUndef(draft.discTypicalOrder)
      const haveMin = min !== undefined && min > 0
      const haveTypical = typical !== undefined && typical > 0
      if (!haveMin && !haveTypical) {
        out.push({
          field: 'discTypicalOrder',
          code: 'REQUIRED',
          message: 'A minimum spend or a typical order value is required so the saving can be calculated.',
        })
      }
      break
    }
    case 'FREEBIE': {
      requireText(draft, 'freeItem', 'The free item', out)
      requirePositiveNumber(draft, 'freeWorth', 'The value of the free item', out)
      // A qualifying purchase is required only when the free item needs one.
      if (draft.freeNeedsPurchase === true) {
        requireText(draft, 'freeQualify', 'The qualifying purchase', out)
      }
      break
    }
    case 'PACKAGE_DEAL': {
      requireText(draft, 'packageItems', 'The included items', out)
      requirePositiveNumber(draft, 'packagePrice', 'The package price', out)
      requirePositiveNumber(draft, 'packageNormal', 'The normal combined value', out)
      // Contradiction: the package must be cheaper than buying the items separately.
      const price = numOrUndef(draft.packagePrice)
      const normal = numOrUndef(draft.packageNormal)
      if (price !== undefined && normal !== undefined && price > 0 && normal > 0 && price >= normal) {
        out.push({ field: 'packagePrice', code: 'INCONSISTENT', message: 'The package price must be less than the normal combined value.' })
      }
      break
    }
  }
}

// ── entry point ────────────────────────────────────────────────────────────────

/**
 * Validate the EFFECTIVE voucher against the S5 matrix. Throws VOUCHER_INCOMPLETE
 * (400) with a `details.fields` array when anything is missing / invalid /
 * contradictory; returns void when the voucher is submittable. Never throws for a
 * complete-but-weak voucher (advisory score is non-gating). Pure + prisma-free.
 *
 * NOTE: the TIME_LIMITED availability-window requirement is NOT enforced here; it is
 * kept as the existing standalone TIME_LIMITED_REQUIRES_WINDOW gate that runs BEFORE
 * this validator (S5.3). REUSABLE cooldown IS folded in here.
 */
export function assertVoucherSubmittable(v: EffectiveVoucher): void {
  const fields: FieldError[] = []

  // Universal invariants.
  if (typeof v.title !== 'string' || v.title.trim().length === 0) {
    fields.push({ field: 'title', code: 'REQUIRED', message: 'A voucher title is required.' })
  }
  if (typeof v.type !== 'string' || !KNOWN_VOUCHER_TYPES.includes(v.type)) {
    fields.push({ field: 'type', code: 'INVALID', message: 'A valid voucher type is required.' })
  }

  const saving = v.estimatedSaving
  if (saving === undefined || saving === null) {
    fields.push({ field: 'estimatedSaving', code: 'REQUIRED', message: 'An estimated saving is required.' })
  } else if (typeof saving !== 'number' || !Number.isFinite(saving) || saving <= 0) {
    fields.push({ field: 'estimatedSaving', code: 'INVALID', message: 'The estimated saving must be a number greater than zero.' })
  } else {
    // Fits Decimal(10,2) after scale-2 rounding (matches the column write).
    const rounded = Math.round(saving * 100) / 100
    if (rounded >= SAVING_COLUMN_MAX) {
      fields.push({ field: 'estimatedSaving', code: 'INVALID', message: 'The estimated saving is too large.' })
    }
  }

  // Wrapper: REUSABLE cooldown (custom-only; flagship types never reach here as REUSABLE).
  if (v.type === 'REUSABLE') {
    const cd = v.cooldownSeconds
    if (cd === null || cd === undefined) {
      fields.push({ field: 'cooldownSeconds', code: 'REQUIRED', message: 'A reuse cooldown is required for a reusable voucher.' })
    } else if (typeof cd !== 'number' || !Number.isFinite(cd) || cd < REUSABLE_COOLDOWN_FLOOR_SECONDS) {
      fields.push({
        field: 'cooldownSeconds',
        code: 'INVALID',
        message: `The reuse cooldown must be at least ${REUSABLE_COOLDOWN_FLOOR_SECONDS} seconds.`,
      })
    }
  }

  // Per-type mechanic. Two triggers (S6):
  //   - STRICT rows (server-owned indicator present): ALWAYS validate the mechanic,
  //     derived from the AUTHORITATIVE Voucher.type. An empty / opaque bag carries no
  //     structured draft, so every required mechanic field reads as absent and the row
  //     FAILS CLOSED (the S5-bypass fix: a direct-API {} bag can no longer submit on the
  //     universal invariants alone).
  //   - LEGACY rows (indicator absent): validate the mechanic ONLY when a structured bag
  //     is present (the pre-S6 S5.6 compatibility rule), so a genuine markerless legacy
  //     row is never blocked by a mechanic field it never stored.
  // resolveMechanicType tolerates a null draft (returns the base type authoritatively;
  // returns null only for a wrapper whose underlying mechanic is not yet derivable).
  const draft = resolveStructuredBag(v.merchantFields)
  const strict = isStrictSubmitContract(v.merchantFields)
  if (typeof v.type === 'string' && (strict || draft)) {
    const mechanic = resolveMechanicType(v.type, draft)
    if (mechanic) {
      validateMechanic(mechanic, draft ?? {}, fields)
    } else if (WRAPPER_TYPES.includes(v.type)) {
      // A wrapper with NO derivable underlying mechanic. The S1 custom builder writes
      // builderType 'time'/'reusable' from the picker and only adds baseMechanic once
      // Step 1 is completed, so this is a wrapper submitted before its base offer was
      // picked (structured bag), OR a strict wrapper with an empty bag. Either way the
      // owner matrix requires a COMPLETE underlying mechanic on a wrapper, so it fails
      // closed. (A truly legacy markerless wrapper carries no structured bag and, being
      // non-strict, never reaches this branch.)
      fields.push({
        field: 'baseMechanic',
        code: 'REQUIRED',
        message: 'Pick the offer this voucher runs first (the underlying mechanic) before submitting.',
      })
    }
  }

  if (fields.length > 0) {
    throw new AppError('VOUCHER_INCOMPLETE', { fields })
  }
}
