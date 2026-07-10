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
      onboardingStep: 'REGISTERED',
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
    // profile/documents are optional (never block); staff/contract/handover gated.
    expect(statuses.profile).toBe('optional')
    expect(statuses.documents).toBe('optional')
    expect(statuses.staff).toBe('gated')
    expect(statuses.contract).toBe('gated')
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

  it('contract reflects the REAL gate: complete only when contract_signed, else gated', () => {
    expect(deriveWizardState(makeDetail()).statuses.contract).toBe('gated')
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
