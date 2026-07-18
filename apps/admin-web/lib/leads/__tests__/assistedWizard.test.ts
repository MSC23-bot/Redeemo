/**
 * assistedWizard: resume-derivation + step-model unit tests (C2).
 *
 * The resume contract is DERIVED from the merchant's real state (never a stored
 * step pointer), so these tests pin the derivation from representative draft
 * fixtures: which step a resume lands on, per-step statuses (complete /
 * incomplete / optional / gated), and the `?step=` param clamping.
 */
import {
  deriveWizardState,
  resolveStepParam,
  stepDefByNum,
  stepDefById,
  WIZARD_STEPS,
  WIZARD_STEP_COUNT,
} from '../assistedWizard'
import type { MerchantDetail, BranchDetail, SubmitChecklist } from '@/lib/api/merchants'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeBranch(overrides: Partial<BranchDetail> = {}): BranchDetail {
  return {
    id: 'b-1',
    name: 'Main Branch',
    isMainBranch: true,
    addressLine1: '1 High Street',
    addressLine2: null,
    city: 'Bristol',
    postcode: 'BS1 1AA',
    localityName: 'Bristol',
    locationConfidence: 'MERCHANT_CONFIRMED',
    phone: null,
    email: null,
    websiteUrl: null,
    isActive: true,
    ...overrides,
  }
}

function makeChecklist(overrides: Partial<SubmitChecklist> = {}): SubmitChecklist {
  const c = {
    branch_created: false,
    contract_signed: false,
    rmv_configured: false,
    ...overrides,
  }
  return { ...c, all_complete: c.branch_created && c.contract_signed && c.rmv_configured }
}

function makeDetail(opts: {
  status?: string
  onboardingStep?: string
  category?: string | null
  primaryCategoryId?: string | null
  description?: string | null
  websiteUrl?: string | null
  branches?: BranchDetail[]
  checklist?: Partial<SubmitChecklist>
  canSubmitOnBehalf?: boolean
  documentsCount?: number
  categoryLocked?: boolean
} = {}): MerchantDetail {
  return {
    merchant: {
      id: 'm-1',
      businessName: 'Southville Sourdough Ltd',
      tradingName: 'Southville Sourdough',
      status: opts.status ?? 'REGISTERED',
      verificationStatus: 'NOT_SUBMITTED',
      onboardingStep: opts.onboardingStep ?? 'REGISTERED',
      websiteUrl: opts.websiteUrl ?? null,
      vatNumber: null,
      companyNumber: null,
      logoUrl: null,
      category: opts.category ?? null,
      primaryCategoryId: opts.primaryCategoryId ?? null,
      categoryLocked: opts.categoryLocked ?? false,
      description: opts.description ?? null,
      hasPendingIdentityEdit: false,
      submitChecklist: makeChecklist(opts.checklist),
      canSubmitOnBehalf: opts.canSubmitOnBehalf ?? true,
      documentsCount: opts.documentsCount ?? 0,
    },
    branches: opts.branches ?? [],
  }
}

// ── Step model ─────────────────────────────────────────────────────────────

describe('WIZARD_STEPS model', () => {
  it('has exactly 9 steps in prototype-rail order', () => {
    expect(WIZARD_STEP_COUNT).toBe(9)
    expect(WIZARD_STEPS.map((s) => s.id)).toEqual([
      'category',
      'profile',
      'branches',
      'vouchers',
      'staff',
      'documents',
      'contract',
      'review',
      'handover',
    ])
  })

  it('marks only category / branches / vouchers / review as blocking', () => {
    const blocking = WIZARD_STEPS.filter((s) => s.blocking).map((s) => s.id)
    expect(blocking).toEqual(['category', 'branches', 'vouchers', 'review'])
  })

  it('stepDefByNum / stepDefById resolve and fall back to step 1', () => {
    expect(stepDefByNum(4).id).toBe('vouchers')
    expect(stepDefById('handover').num).toBe(9)
    expect(stepDefByNum(99).num).toBe(1)
  })
})

describe('resolveStepParam', () => {
  it('returns the fallback for missing / empty / non-numeric / out-of-range', () => {
    expect(resolveStepParam(null, 3)).toBe(3)
    expect(resolveStepParam('', 3)).toBe(3)
    expect(resolveStepParam('abc', 3)).toBe(3)
    expect(resolveStepParam('0', 3)).toBe(3)
    expect(resolveStepParam('10', 3)).toBe(3)
    expect(resolveStepParam('2.5', 3)).toBe(3)
  })

  it('returns a valid 1..9 step', () => {
    expect(resolveStepParam('1', 5)).toBe(1)
    expect(resolveStepParam('9', 5)).toBe(9)
    expect(resolveStepParam('4', 5)).toBe(4)
  })
})

// ── Resume derivation ─────────────────────────────────────────────────────

describe('deriveWizardState resume landing', () => {
  it('a fresh draft (no category) lands on step 1', () => {
    expect(deriveWizardState(makeDetail()).resumeStep).toBe(1)
  })

  it('category set but no branch lands on step 3', () => {
    const d = makeDetail({ category: 'Food and drink', primaryCategoryId: 'cat-food' })
    expect(deriveWizardState(d).resumeStep).toBe(3)
  })

  it('category + branch but no RMV lands on step 4', () => {
    const d = makeDetail({
      category: 'Food and drink',
      branches: [makeBranch()],
      checklist: { branch_created: true },
    })
    expect(deriveWizardState(d).resumeStep).toBe(4)
  })

  it('all blocking data present but not yet submitted lands on step 8 (go-live review)', () => {
    const d = makeDetail({
      category: 'Food and drink',
      branches: [makeBranch()],
      checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      status: 'REGISTERED',
    })
    expect(deriveWizardState(d).resumeStep).toBe(8)
  })

  it('submitted-but-not-live lands on step 8 (review shows in-queue state)', () => {
    const d = makeDetail({
      category: 'Food and drink',
      branches: [makeBranch()],
      checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      status: 'PENDING_APPROVAL',
    })
    expect(deriveWizardState(d).resumeStep).toBe(8)
  })

  it('a NEEDS_CHANGES merchant (bounced for changes) lands on step 8, not an earlier step (F1)', () => {
    const d = makeDetail({
      category: 'Food and drink',
      branches: [makeBranch()],
      checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      status: 'PENDING_APPROVAL',
      onboardingStep: 'NEEDS_CHANGES',
    })
    expect(deriveWizardState(d).resumeStep).toBe(8)
  })

  it('a live merchant lands on step 9 (handover)', () => {
    const d = makeDetail({
      category: 'Food and drink',
      branches: [makeBranch()],
      checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      status: 'ACTIVE',
    })
    expect(deriveWizardState(d).resumeStep).toBe(9)
  })

  it('uses branch count as a fallback signal when the checklist flag lags', () => {
    // branch present on the branches array even if branch_created flag is false.
    const d = makeDetail({ category: 'Food and drink', branches: [makeBranch()] })
    expect(deriveWizardState(d).resumeStep).toBe(4)
  })

  it('primaryCategoryId alone (no display category string) still counts as category set', () => {
    const d = makeDetail({ primaryCategoryId: 'cat-food' })
    expect(deriveWizardState(d).resumeStep).toBe(3)
  })
})

// ── Per-step status ─────────────────────────────────────────────────────────

describe('deriveWizardState per-step statuses', () => {
  it('a fresh draft: blocking steps incomplete, non-blocking optional/gated', () => {
    const { statuses } = deriveWizardState(makeDetail())
    expect(statuses.category).toBe('incomplete')
    expect(statuses.branches).toBe('incomplete')
    expect(statuses.vouchers).toBe('incomplete')
    expect(statuses.review).toBe('incomplete')
    // profile/documents are optional (never block); staff/handover gated. D65:
    // contract is now actionable, so an unsigned contract is 'incomplete' (needs
    // attention), no longer 'gated'.
    expect(statuses.profile).toBe('optional')
    expect(statuses.documents).toBe('optional')
    expect(statuses.staff).toBe('gated')
    expect(statuses.contract).toBe('incomplete')
    expect(statuses.handover).toBe('gated')
  })

  it('staff is ALWAYS gated (no admin invite-on-behalf route), regardless of state', () => {
    const live = makeDetail({
      category: 'Food and drink',
      branches: [makeBranch()],
      checklist: { branch_created: true, rmv_configured: true, contract_signed: true },
      status: 'ACTIVE',
    })
    expect(deriveWizardState(live).statuses.staff).toBe('gated')
  })

  it('contract reflects the REAL gate: complete when contract_signed, else incomplete (D65 actionable)', () => {
    expect(deriveWizardState(makeDetail()).statuses.contract).toBe('incomplete')
    const signed = makeDetail({ checklist: { contract_signed: true } })
    expect(deriveWizardState(signed).statuses.contract).toBe('complete')
  })

  it('profile is complete once a website or a description is set', () => {
    expect(deriveWizardState(makeDetail({ websiteUrl: 'https://x.example' })).statuses.profile).toBe('complete')
    expect(deriveWizardState(makeDetail({ description: 'Artisan bakery' })).statuses.profile).toBe('complete')
  })

  it('documents is complete once at least one document exists', () => {
    expect(deriveWizardState(makeDetail({ documentsCount: 2 })).statuses.documents).toBe('complete')
  })

  it('category is complete once set', () => {
    expect(deriveWizardState(makeDetail({ category: 'Retail' })).statuses.category).toBe('complete')
  })

  it('review is complete once the merchant has been submitted (past REGISTERED)', () => {
    expect(deriveWizardState(makeDetail({ status: 'PENDING_APPROVAL' })).statuses.review).toBe('complete')
    expect(deriveWizardState(makeDetail({ status: 'REGISTERED' })).statuses.review).toBe('incomplete')
  })

  it('review reads incomplete/attention (not complete) for a NEEDS_CHANGES merchant (F1)', () => {
    const d = makeDetail({ status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' })
    expect(deriveWizardState(d).statuses.review).toBe('incomplete')
  })

  it('handover is complete once live', () => {
    expect(deriveWizardState(makeDetail({ status: 'ACTIVE' })).statuses.handover).toBe('complete')
  })

  it('surfaces the real facts used by the steps', () => {
    const d = makeDetail({
      category: 'Food and drink',
      branches: [makeBranch(), makeBranch({ id: 'b-2', isMainBranch: false })],
      checklist: { branch_created: true, rmv_configured: true },
      documentsCount: 1,
      status: 'PENDING_APPROVAL',
    })
    const { facts } = deriveWizardState(d)
    expect(facts.categorySet).toBe(true)
    expect(facts.branchCount).toBe(2)
    expect(facts.branchCreated).toBe(true)
    expect(facts.rmvConfigured).toBe(true)
    expect(facts.contractSigned).toBe(false)
    expect(facts.documentsCount).toBe(1)
    expect(facts.submitted).toBe(true)
    expect(facts.live).toBe(false)
  })
})

// ── needsChanges fact (adversarial-review F1) ────────────────────────────────
//
// Verified backend contract: a merchant bounced with request-changes has
// status === 'PENDING_APPROVAL' AND onboardingStep === 'NEEDS_CHANGES' (the
// same condition the merchant resubmit gate uses). needsChanges must be a
// STRICT AND of both fields, and must stay false for every other status so it
// never gets confused with the plain "submitted" fact.

describe('deriveWizardState needsChanges fact', () => {
  it('is true only for PENDING_APPROVAL + onboardingStep NEEDS_CHANGES', () => {
    const d = makeDetail({ status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' })
    expect(deriveWizardState(d).facts.needsChanges).toBe(true)
  })

  it('is false for plain PENDING_APPROVAL (onboardingStep not NEEDS_CHANGES)', () => {
    const d = makeDetail({ status: 'PENDING_APPROVAL' })
    expect(deriveWizardState(d).facts.needsChanges).toBe(false)
  })

  it('is false when onboardingStep is NEEDS_CHANGES but status is not PENDING_APPROVAL', () => {
    // Defensive: the fact is a strict AND, not just an onboardingStep check.
    const d = makeDetail({ status: 'REGISTERED', onboardingStep: 'NEEDS_CHANGES' })
    expect(deriveWizardState(d).facts.needsChanges).toBe(false)
  })

  it('is false for ACTIVE, SUSPENDED, and INACTIVE', () => {
    expect(deriveWizardState(makeDetail({ status: 'ACTIVE' })).facts.needsChanges).toBe(false)
    expect(deriveWizardState(makeDetail({ status: 'SUSPENDED' })).facts.needsChanges).toBe(false)
    expect(deriveWizardState(makeDetail({ status: 'INACTIVE' })).facts.needsChanges).toBe(false)
  })

  it('a needsChanges merchant is still submitted (needsChanges is a subset of submitted)', () => {
    const d = makeDetail({ status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES' })
    const { facts } = deriveWizardState(d)
    expect(facts.submitted).toBe(true)
    expect(facts.needsChanges).toBe(true)
  })
})
