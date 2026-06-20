import { deriveStatusPill, homeFor } from '@/lib/auth/lifecycle'

describe('deriveStatusPill (M1 Slice 5, spec Section 10)', () => {
  const cases: Array<[string, string, string]> = [
    ['REGISTERED', 'REGISTERED', 'setup'],
    ['REGISTERED', 'BRANCH_ADDED', 'setup'],
    ['REGISTERED', 'CONTRACT_SIGNED', 'setup'],
    ['REGISTERED', 'RMV_CONFIGURED', 'setup'],
    ['PENDING_APPROVAL', 'SUBMITTED', 'submitted'],
    ['PENDING_APPROVAL', 'UNDER_REVIEW', 'in_review'],
    ['PENDING_APPROVAL', 'REGISTERED', 'in_review'], // pending without a more specific step
    ['REGISTERED', 'NEEDS_CHANGES', 'changes'],
    // F1: REJECTED is now SPLIT OUT into its own lifecycle state (was collapsed into 'changes').
    ['REGISTERED', 'REJECTED', 'rejected'],
    ['INACTIVE', 'REJECTED', 'rejected'],
    ['ACTIVE', 'APPROVED', 'live'],
    ['ACTIVE', 'LIVE', 'live'],
    ['SUSPENDED', 'LIVE', 'suspended'],
    ['SUSPENDED', 'SUBMITTED', 'suspended'],
  ]
  it.each(cases)('status=%s onboardingStep=%s -> %s', (status, onboardingStep, expected) => {
    expect(deriveStatusPill({ status, onboardingStep })).toBe(expected)
  })
})

describe('homeFor', () => {
  it('routes live + live_new to the live home, everything else to pre-live', () => {
    expect(homeFor('live')).toBe('live')
    expect(homeFor('live_new')).toBe('live')
    expect(homeFor('setup')).toBe('pre-live')
    expect(homeFor('submitted')).toBe('pre-live')
    expect(homeFor('in_review')).toBe('pre-live')
    expect(homeFor('changes')).toBe('pre-live')
    expect(homeFor('suspended')).toBe('pre-live')
    expect(homeFor('rejected')).toBe('pre-live')
  })
})
