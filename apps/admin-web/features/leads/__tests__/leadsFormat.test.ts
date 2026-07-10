import { onboardingStepLabel, formatCreatedDate } from '../leadsFormat'

describe('onboardingStepLabel', () => {
  it('maps known OnboardingStep values to friendly labels', () => {
    expect(onboardingStepLabel('REGISTERED')).toBe('Registered')
    expect(onboardingStepLabel('BRANCH_ADDED')).toBe('Branch added')
    expect(onboardingStepLabel('CONTRACT_SIGNED')).toBe('Contract signed')
    expect(onboardingStepLabel('RMV_CONFIGURED')).toBe('Vouchers configured')
    expect(onboardingStepLabel('SUBMITTED')).toBe('Submitted')
    expect(onboardingStepLabel('UNDER_REVIEW')).toBe('Under review')
    expect(onboardingStepLabel('NEEDS_CHANGES')).toBe('Changes requested')
    expect(onboardingStepLabel('REJECTED')).toBe('Rejected')
  })

  it('falls back to the raw value for an unknown step (contract-drift resilience)', () => {
    expect(onboardingStepLabel('SOME_FUTURE_STEP')).toBe('SOME_FUTURE_STEP')
  })
})

describe('formatCreatedDate', () => {
  it('formats an ISO date as day/month/year (en-GB)', () => {
    expect(formatCreatedDate('2026-07-10T09:30:00.000Z')).toBe('10 Jul 2026')
  })

  it('returns a dash for an unparsable date', () => {
    expect(formatCreatedDate('not-a-date')).toBe('-')
  })
})
