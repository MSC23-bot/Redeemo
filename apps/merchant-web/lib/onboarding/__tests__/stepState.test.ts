import { deriveStepStates, type OnboardingInputs } from '@/lib/onboarding/stepState'

// The 6-step staircase derivation. Pure function: takes the merged backend reads
// (profile + checklist + rmv count) and returns each step's client-derived state
// plus the gating + submit flags. F1's load-bearing logic lives here, NOT in the
// presentational <Stepper>.

// A fresh registered merchant: nothing done except step 1 (account, always done).
const FRESH: OnboardingInputs = {
  profile: {
    status: 'REGISTERED',
    onboardingStep: 'REGISTERED',
    primaryCategoryId: null,
    description: null,
  },
  checklist: { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false },
  rmvActiveCount: 0,
}

// Helper to build inputs by patching FRESH.
function inputs(patch: Omit<Partial<OnboardingInputs>, 'profile' | 'checklist'> & {
  profile?: Partial<OnboardingInputs['profile']>
  checklist?: Partial<OnboardingInputs['checklist']>
}): OnboardingInputs {
  return {
    profile: { ...FRESH.profile, ...(patch.profile ?? {}) },
    checklist: { ...FRESH.checklist, ...(patch.checklist ?? {}) },
    rmvActiveCount: patch.rmvActiveCount ?? FRESH.rmvActiveCount,
  }
}

function byId(states: ReturnType<typeof deriveStepStates>['steps'], id: string) {
  const s = states.find((x) => x.id === id)
  if (!s) throw new Error(`step ${id} missing`)
  return s
}

describe('deriveStepStates - the 6 steps', () => {
  it('always emits exactly 6 steps in the locked order', () => {
    const { steps } = deriveStepStates(FRESH)
    expect(steps.map((s) => s.id)).toEqual([
      'account',
      'category',
      'profile',
      'branch',
      'vouchers',
      'agreement',
    ])
  })

  it('step 1 (account) is always done', () => {
    expect(byId(deriveStepStates(FRESH).steps, 'account').state).toBe('done')
    // even when everything else is blank
    expect(byId(deriveStepStates(inputs({})).steps, 'account').state).toBe('done')
  })

  it('the first reachable not-done step is current; the rest are locked/todo', () => {
    const { steps } = deriveStepStates(FRESH)
    // account done, category is the first reachable not-done -> current
    expect(byId(steps, 'category').state).toBe('current')
    // profile/branch/vouchers/agreement are locked until their gates open
    expect(byId(steps, 'profile').state).toBe('locked')
    expect(byId(steps, 'branch').state).toBe('locked')
    expect(byId(steps, 'vouchers').state).toBe('locked')
    expect(byId(steps, 'agreement').state).toBe('locked')
  })
})

describe('deriveStepStates - category done-ness', () => {
  it('categoryDone is driven by profile.primaryCategoryId != null', () => {
    const withCat = inputs({ profile: { primaryCategoryId: 'subcat-restaurant' } })
    expect(byId(deriveStepStates(withCat).steps, 'category').state).toBe('done')
  })

  it('categoryDone false when primaryCategoryId is null', () => {
    expect(byId(deriveStepStates(FRESH).steps, 'category').state).not.toBe('done')
  })
})

describe('deriveStepStates - profile done-ness + gating', () => {
  it('profile unlocks once category is done (profileUnlocked = categoryDone)', () => {
    // category done, profile not yet -> profile becomes the current step (unlocked)
    const catOnly = inputs({ profile: { primaryCategoryId: 'subcat-1' } })
    const { steps } = deriveStepStates(catOnly)
    expect(byId(steps, 'profile').state).toBe('current')
    expect(byId(steps, 'profile').locked).toBe(false)
  })

  it('profile stays locked while category is not done', () => {
    expect(byId(deriveStepStates(FRESH).steps, 'profile').locked).toBe(true)
  })

  it('profileDone is driven by description present on the profile read', () => {
    const both = inputs({ profile: { primaryCategoryId: 'subcat-1', description: 'We serve fresh food.' } })
    expect(byId(deriveStepStates(both).steps, 'profile').state).toBe('done')
  })

  it('an empty/whitespace description does NOT count profile as done', () => {
    const blank = inputs({ profile: { primaryCategoryId: 'subcat-1', description: '   ' } })
    expect(byId(deriveStepStates(blank).steps, 'profile').state).not.toBe('done')
  })
})

describe('deriveStepStates - downstream gating chain (branch/vouchers/agreement share ONE gate)', () => {
  it('branch, vouchers, agreement are ALL locked until category AND profile are done', () => {
    // category done but profile not -> downstream still locked
    const catOnly = inputs({ profile: { primaryCategoryId: 'subcat-1' } })
    const { steps } = deriveStepStates(catOnly)
    expect(byId(steps, 'branch').locked).toBe(true)
    expect(byId(steps, 'vouchers').locked).toBe(true)
    expect(byId(steps, 'agreement').locked).toBe(true)
  })

  it('branch, vouchers, agreement ALL unlock together once category AND profile are done', () => {
    const downstream = inputs({
      profile: { primaryCategoryId: 'subcat-1', description: 'Great food.' },
    })
    const { steps } = deriveStepStates(downstream)
    expect(byId(steps, 'branch').locked).toBe(false)
    expect(byId(steps, 'vouchers').locked).toBe(false)
    expect(byId(steps, 'agreement').locked).toBe(false)
  })

  it('there is NO ordering among branch/vouchers/agreement (any can be done independently)', () => {
    // downstream open; only agreement signed -> branch + vouchers still reachable, not locked
    const agreementFirst = inputs({
      profile: { primaryCategoryId: 'subcat-1', description: 'Great food.' },
      checklist: { contract_signed: true },
    })
    const { steps } = deriveStepStates(agreementFirst)
    expect(byId(steps, 'agreement').state).toBe('done')
    expect(byId(steps, 'branch').locked).toBe(false)
    expect(byId(steps, 'vouchers').locked).toBe(false)
  })

  it('locked steps carry a lockedHint and expose no action', () => {
    const profileStep = byId(deriveStepStates(FRESH).steps, 'profile')
    expect(profileStep.locked).toBe(true)
    expect(profileStep.lockedHint).toBeTruthy()
    expect(profileStep.action).toBeFalsy()

    const branchStep = byId(deriveStepStates(FRESH).steps, 'branch')
    expect(branchStep.lockedHint).toBeTruthy()
    expect(branchStep.action).toBeFalsy()
  })

  it('the locked agreement step carries the same downstream hint as its gate-siblings (no empty pill)', () => {
    const { steps } = deriveStepStates(FRESH)
    const agreementStep = byId(steps, 'agreement')
    const branchStep = byId(steps, 'branch')
    const vouchersStep = byId(steps, 'vouchers')
    // all three share the SAME downstream gate, so all three must carry the SAME non-empty hint
    expect(agreementStep.locked).toBe(true)
    expect(agreementStep.lockedHint).toBeTruthy()
    expect(agreementStep.lockedHint).toBe(branchStep.lockedHint)
    expect(agreementStep.lockedHint).toBe(vouchersStep.lockedHint)
  })
})

describe('deriveStepStates - branch/vouchers/agreement done-ness', () => {
  const open = { primaryCategoryId: 'subcat-1', description: 'Great food.' }

  it('branchDone is driven by checklist.branch_created', () => {
    const i = inputs({ profile: open, checklist: { branch_created: true } })
    expect(byId(deriveStepStates(i).steps, 'branch').state).toBe('done')
  })

  it('vouchersDone is driven by checklist.rmv_configured (>=2)', () => {
    const i = inputs({ profile: open, checklist: { rmv_configured: true }, rmvActiveCount: 2 })
    expect(byId(deriveStepStates(i).steps, 'vouchers').state).toBe('done')
  })

  it('contractDone is driven by checklist.contract_signed', () => {
    const i = inputs({ profile: open, checklist: { contract_signed: true } })
    expect(byId(deriveStepStates(i).steps, 'agreement').state).toBe('done')
  })
})

describe('deriveStepStates - voucher 1 of 2 partial', () => {
  const open = { primaryCategoryId: 'subcat-1', description: 'Great food.' }

  it('shows "1 of 2" when exactly one flagship is saved (rmvActiveCount === 1, not yet rmv_configured)', () => {
    const i = inputs({ profile: open, checklist: { rmv_configured: false }, rmvActiveCount: 1 })
    const v = byId(deriveStepStates(i).steps, 'vouchers')
    expect(v.state).not.toBe('done')
    expect(v.progress).toBe('1 of 2')
  })

  it('shows "2 of 2" / done when both are saved', () => {
    const i = inputs({ profile: open, checklist: { rmv_configured: true }, rmvActiveCount: 2 })
    const v = byId(deriveStepStates(i).steps, 'vouchers')
    expect(v.state).toBe('done')
    expect(v.progress).toBe('2 of 2')
  })

  it('has no progress string when zero flagships are saved', () => {
    const i = inputs({ profile: open, rmvActiveCount: 0 })
    expect(byId(deriveStepStates(i).steps, 'vouchers').progress).toBe('')
  })
})

describe('deriveStepStates - submit gating (prototype-aligned: ALL 6 steps done)', () => {
  it('submitEnabled is false while the downstream 3 gates are unmet', () => {
    expect(deriveStepStates(FRESH).submitEnabled).toBe(false)
    // category + profile done, downstream gates open, but branch/vouchers/agreement
    // are all still not done -> not submittable.
    const open = inputs({
      profile: { primaryCategoryId: 'subcat-1', description: 'Great food.' },
      checklist: { branch_created: false, contract_signed: false, rmv_configured: false, all_complete: false },
    })
    expect(deriveStepStates(open).submitEnabled).toBe(false)
  })

  it('submitEnabled stays FALSE when the backend says all_complete but profile is NOT done (empty description)', () => {
    // The backend 3-gate (branch+contract+rmv) can be satisfied while the staircase
    // still shows an incomplete profile. The prototype gates Submit on ALL 6 steps,
    // so this must NOT enable Submit and the header must read "5 of 6".
    const noDescription = inputs({
      profile: { primaryCategoryId: 'subcat-1', description: null },
      checklist: { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true },
    })
    const derived = deriveStepStates(noDescription)
    expect(derived.submitEnabled).toBe(false)
    expect(derived.doneCount).toBe(5)
    expect(derived.totalCount).toBe(6)
  })

  it('submitEnabled stays FALSE when one downstream step is missing even if the rest are done', () => {
    // category + profile + branch + contract done, but vouchers NOT done -> 5 of 6
    const noVouchers = inputs({
      profile: { primaryCategoryId: 'subcat-1', description: 'Great food.' },
      checklist: { branch_created: true, contract_signed: true, rmv_configured: false, all_complete: false },
    })
    const derived = deriveStepStates(noVouchers)
    expect(derived.submitEnabled).toBe(false)
    expect(derived.doneCount).toBe(5)
  })

  it('submitEnabled is true ONLY once all 6 staircase steps are done', () => {
    const allDone = inputs({
      profile: { primaryCategoryId: 'subcat-1', description: 'Great food.' },
      checklist: { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true },
    })
    const derived = deriveStepStates(allDone)
    expect(derived.submitEnabled).toBe(true)
    // header agrees: every step done
    expect(derived.steps.every((s) => s.state === 'done')).toBe(true)
  })

  it('reports done/total counts for the progress header', () => {
    const allDone = inputs({
      profile: { primaryCategoryId: 'subcat-1', description: 'Great food.' },
      checklist: { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true },
    })
    const { doneCount, totalCount } = deriveStepStates(allDone)
    expect(totalCount).toBe(6)
    expect(doneCount).toBe(6)
  })
})
