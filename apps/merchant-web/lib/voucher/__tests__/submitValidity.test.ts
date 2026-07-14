import { collectSubmitErrors, type EffectiveVoucher, type FieldError } from '@/lib/voucher/submitValidity'
import {
  BAG_SHAPES,
  BASE_TYPES,
  PICKER_ID,
  COMPLETE_MECHANICS,
  MECHANIC_FAIL_CASES,
  ALT_VALID_CASES,
  UNIVERSAL_CASES,
  WRAPPER_CASES,
  LEGACY_CASES,
  type BagShape,
  type Draft,
  type FieldExpectation,
} from '../../../../../tests/fixtures/voucher-submit-validity-cases'

// ─────────────────────────────────────────────────────────────────────────────
// S5 (client half): the shared submission-validity matrix, DRIVEN from THE canonical
// executable fixture the backend suite also consumes:
// tests/fixtures/voucher-submit-validity-cases.ts (repo root, imported by relative path;
// pure data, zero imports). Case-list drift between the two layers is now structurally
// impossible: both suites iterate the SAME case objects, and a layer interpreting a case
// differently fails in that layer's suite. The authoritative RULE matrix stays in the
// plan doc docs/superpowers/plans/2026-07-13-voucher-builder-prototype-fidelity.md S5.3.
//
// This suite runs the cases against the pure client validator (collectSubmitErrors)
// rather than an HTTP route. One deliberate client-side consolidation: the backend's
// standalone TIME_LIMITED_REQUIRES_WINDOW gate (fixture outcome 'WINDOW_GATE') surfaces
// client-side as { field: 'availabilityWindows', code: 'REQUIRED' } because the client
// has a single Submit action (see lib/voucher/submitValidity.ts header).
//
// CLIENT-ONLY cases (not in the shared fixture) are kept inline at the bottom, labelled.
// ─────────────────────────────────────────────────────────────────────────────

// ── suite-local shape builders (per the fixture header, each runner attaches the
//    builderType / baseMechanic markers around the fixture's mechanic bags) ────

function bagFor(shape: BagShape, type: string, mechanic: Draft): Draft {
  const builderType = PICKER_ID[type]
  if (shape === 'nested') return { merchantFields: { builderType, ...mechanic } }
  return {
    askHelp: false,
    builderType,
    draftFields: { type: builderType, ...mechanic },
    selectedClauseIds: ['tell_staff'],
    customTerms: [],
  }
}

function wrapperBagFor(shape: BagShape, pickerId: 'time' | 'reusable', baseMechanic: string | null, mechanic: Draft | null): Draft {
  if (baseMechanic == null || mechanic == null) {
    // Marker-only wrapper bag (base offer never picked); exists only in the single shape.
    return { askHelp: false, builderType: pickerId }
  }
  if (shape === 'nested') return { merchantFields: { builderType: baseMechanic, ...mechanic } }
  return {
    askHelp: false,
    builderType: pickerId,
    baseMechanic,
    draftFields: { type: baseMechanic, ...mechanic },
    selectedClauseIds: ['tell_staff'],
    customTerms: [],
  }
}

// Build an EffectiveVoucher with complete defaults; overrides win. windowsKnown defaults
// true (the fixture cases all represent KNOWN states, matching the backend which always
// knows its own windows); the client-only unknown-on-edit state is covered separately.
function eff(overrides: Partial<EffectiveVoucher>): EffectiveVoucher {
  return {
    type: 'BOGO',
    title: 'A voucher title',
    estimatedSaving: 5,
    merchantFields: null,
    windowCount: 0,
    windowsKnown: true,
    cooldownSeconds: null,
    ...overrides,
  }
}

function hasError(errors: FieldError[], expected: FieldExpectation): boolean {
  return errors.some((e) => e.field === expected.field && e.code === expected.code)
}

// ── fixture-driven: shape x type cross-product ────────────────────────────────

for (const shape of BAG_SHAPES) {
  describe(`S5 fixture, ${shape} bag shape: fail-closed matrix`, () => {
    for (const type of BASE_TYPES) {
      it(`${type}: the fixture's complete mechanic is submittable (no errors)`, () => {
        const errors = collectSubmitErrors(eff({ type, merchantFields: bagFor(shape, type, COMPLETE_MECHANICS[type]) }))
        expect(errors).toEqual([])
      })

      it.each(MECHANIC_FAIL_CASES[type])(`${type}: rejects "$name" ($expect.field/$expect.code)`, ({ mechanic, expect: expected }) => {
        const errors = collectSubmitErrors(eff({ type, merchantFields: bagFor(shape, type, mechanic) }))
        expect(hasError(errors, expected)).toBe(true)
      })
    }

    // Alternative valid mechanics (must never be blocked).
    it.each(ALT_VALID_CASES)('$name', ({ type, mechanic }) => {
      expect(collectSubmitErrors(eff({ type, merchantFields: bagFor(shape, type, mechanic) }))).toEqual([])
    })

    // Universal invariants (checked regardless of the structured bag).
    it.each(UNIVERSAL_CASES)('universal: $name ($expect.field/$expect.code)', ({ type, voucherPatch, expect: expected }) => {
      const errors = collectSubmitErrors(
        eff({ type, ...voucherPatch, merchantFields: bagFor(shape, type, COMPLETE_MECHANICS[type]) }),
      )
      expect(hasError(errors, expected)).toBe(true)
    })
  })
}

// ── fixture-driven: wrappers (TIME_LIMITED + REUSABLE) ────────────────────────

describe('S5 fixture, wrappers (TIME_LIMITED + REUSABLE)', () => {
  for (const wrapperCase of WRAPPER_CASES) {
    const shapes = wrapperCase.shapes ?? BAG_SHAPES
    for (const shape of shapes) {
      it(`${wrapperCase.name} (${shape} shape)`, () => {
        const bag = wrapperBagFor(shape, wrapperCase.pickerId, wrapperCase.baseMechanic, wrapperCase.mechanic)
        const errors = collectSubmitErrors(
          eff({
            type: wrapperCase.wrapper,
            merchantFields: bag,
            windowCount: wrapperCase.windowCount,
            cooldownSeconds: wrapperCase.cooldownSeconds,
          }),
        )
        if (wrapperCase.outcome === 'SUBMITS') {
          expect(errors).toEqual([])
        } else if (wrapperCase.outcome === 'WINDOW_GATE') {
          // Backend: the standalone TIME_LIMITED_REQUIRES_WINDOW gate. Client: the same
          // requirement is consolidated into the matrix as availabilityWindows/REQUIRED.
          expect(hasError(errors, { field: 'availabilityWindows', code: 'REQUIRED' })).toBe(true)
        } else {
          expect(hasError(errors, wrapperCase.outcome)).toBe(true)
        }
      })
    }
  }
})

// ── fixture-driven: legacy / opaque-bag compatibility ─────────────────────────

describe('S5 fixture, legacy compatibility (non-structured bags validate on universal invariants only)', () => {
  it.each(LEGACY_CASES)('$name', ({ bag, estimatedSaving, outcome }) => {
    const errors = collectSubmitErrors(
      eff({ type: 'BOGO', merchantFields: bag, ...(estimatedSaving !== undefined ? { estimatedSaving } : {}) }),
    )
    if (outcome === 'SUBMITS') {
      expect(errors).toEqual([])
    } else {
      expect(hasError(errors, outcome)).toBe(true)
    }
  })
})

// ── CLIENT-ONLY cases (not in the shared fixture; labelled per the parity contract) ──

describe('S5 client-only: extra universal invariants', () => {
  it('client-only: rejects a missing estimatedSaving (estimatedSaving/REQUIRED)', () => {
    const errors = collectSubmitErrors(eff({ estimatedSaving: null, merchantFields: bagFor('single', 'BOGO', COMPLETE_MECHANICS.BOGO) }))
    expect(hasError(errors, { field: 'estimatedSaving', code: 'REQUIRED' })).toBe(true)
  })

  it('client-only: rejects a non-finite estimatedSaving (estimatedSaving/INVALID)', () => {
    const errors = collectSubmitErrors(
      eff({ estimatedSaving: Number.POSITIVE_INFINITY, merchantFields: bagFor('single', 'BOGO', COMPLETE_MECHANICS.BOGO) }),
    )
    expect(hasError(errors, { field: 'estimatedSaving', code: 'INVALID' })).toBe(true)
  })

  it('client-only: rejects an unknown voucher type (type/INVALID)', () => {
    const errors = collectSubmitErrors(eff({ type: 'NONSENSE', merchantFields: bagFor('single', 'BOGO', COMPLETE_MECHANICS.BOGO) }))
    expect(hasError(errors, { field: 'type', code: 'INVALID' })).toBe(true)
  })
})

describe('S5 client-only: shape handling (confusion keys, precedence)', () => {
  it('client-only: a custom bag with unrelated keys still validates the mechanic and submits', () => {
    const bag = {
      askHelp: true,
      builderType: 'bogo',
      draftFields: { type: 'bogo', ...COMPLETE_MECHANICS.BOGO },
      selectedClauseIds: ['tell_staff', 'no_combine'],
      customTerms: [{ text: 'One per table', tier: 'fair' }],
      titleEdited: true,
      descEdited: false,
    }
    expect(collectSubmitErrors(eff({ merchantFields: bag }))).toEqual([])
  })

  it('client-only: a custom bag with unrelated keys and an incomplete mechanic still rejects', () => {
    const incomplete = { ...COMPLETE_MECHANICS.BOGO } as Draft
    delete incomplete.bogoFree
    const bag = {
      askHelp: true,
      builderType: 'bogo',
      draftFields: { type: 'bogo', ...incomplete },
      selectedClauseIds: ['tell_staff'],
      customTerms: [],
    }
    const errors = collectSubmitErrors(eff({ merchantFields: bag }))
    expect(hasError(errors, { field: 'bogoFree', code: 'REQUIRED' })).toBe(true)
  })

  it('client-only: when both shapes are somehow present, the nested flagship shape wins', () => {
    const bag = {
      builderType: 'bogo',
      draftFields: { type: 'bogo' }, // incomplete on the single-level reading
      merchantFields: { builderType: 'bogo', ...COMPLETE_MECHANICS.BOGO }, // complete nested
    }
    expect(collectSubmitErrors(eff({ merchantFields: bag }))).toEqual([])
  })

  it('client-only: a poisoned draftFields (non-object) degrades safely (rejects cleanly, no throw)', () => {
    const bag = { askHelp: false, builderType: 'bogo', draftFields: 'garbage' }
    const errors = collectSubmitErrors(eff({ merchantFields: bag }))
    expect(hasError(errors, { field: 'bogoBuy', code: 'REQUIRED' })).toBe(true)
  })
})

// CLIENT-ONLY: the three-state window rule. The voucher DETAIL contract does not return
// availabilityWindows (a relation), so an existing-voucher edit hydrates windowsKnown=false
// and the client must NOT invent a zero-window block; the save omits the field and the
// backend preserves + validates the real windows. Fresh create / loaded states are KNOWN.
describe('S5 client-only: TIME_LIMITED window rule respects the known/unknown three-state', () => {
  const tlBag = { askHelp: false, builderType: 'time', baseMechanic: 'bogo', draftFields: { type: 'bogo', ...COMPLETE_MECHANICS.BOGO } }

  it('KNOWN-EMPTY (fresh create / loaded empty): fails closed with availabilityWindows/REQUIRED', () => {
    const errors = collectSubmitErrors(eff({ type: 'TIME_LIMITED', merchantFields: tlBag, windowCount: 0, windowsKnown: true }))
    expect(hasError(errors, { field: 'availabilityWindows', code: 'REQUIRED' })).toBe(true)
  })

  it('KNOWN-PRESENT (loaded non-empty): submits', () => {
    expect(collectSubmitErrors(eff({ type: 'TIME_LIMITED', merchantFields: tlBag, windowCount: 2, windowsKnown: true }))).toEqual([])
  })

  it('UNKNOWN (existing edit, windows not hydrated): does NOT raise the window rule', () => {
    const errors = collectSubmitErrors(eff({ type: 'TIME_LIMITED', merchantFields: tlBag, windowCount: 0, windowsKnown: false }))
    expect(hasError(errors, { field: 'availabilityWindows', code: 'REQUIRED' })).toBe(false)
    // ...and with a complete underlying mechanic the whole voucher is submittable.
    expect(errors).toEqual([])
  })

  it('UNKNOWN does not mask a genuinely incomplete underlying mechanic', () => {
    const incomplete = { ...COMPLETE_MECHANICS.BOGO } as Draft
    delete incomplete.bogoFreePrice
    const bag = { askHelp: false, builderType: 'time', baseMechanic: 'bogo', draftFields: { type: 'bogo', ...incomplete } }
    const errors = collectSubmitErrors(eff({ type: 'TIME_LIMITED', merchantFields: bag, windowCount: 0, windowsKnown: false }))
    expect(hasError(errors, { field: 'availabilityWindows', code: 'REQUIRED' })).toBe(false)
    expect(hasError(errors, { field: 'bogoFreePrice', code: 'REQUIRED' })).toBe(true)
  })
})
