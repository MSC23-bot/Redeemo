import { branchPinSet } from '@/lib/branches/pinSet'

// The compatibility bridge contract (#377 correction round 2). Removal trigger
// for the legacy cases: a CONFIRMED Railway backend deployment carrying the
// corrected #377 contract - see lib/branches/pinSet.ts.
describe('branchPinSet - explicit boolean is authoritative', () => {
  it('new backend true', () => {
    expect(branchPinSet({ redemptionPinSet: true })).toBe(true)
  })

  it('new backend false', () => {
    expect(branchPinSet({ redemptionPinSet: false })).toBe(false)
  })

  it('an explicit false is NEVER overridden by a conflicting legacy ciphertext', () => {
    expect(branchPinSet({ redemptionPinSet: false, redemptionPin: 'enc:v1:deadbeef' })).toBe(false)
  })

  it('an explicit true wins regardless of a null legacy field', () => {
    expect(branchPinSet({ redemptionPinSet: true, redemptionPin: null })).toBe(true)
  })
})

describe('branchPinSet - old-backend compatibility (boolean absent)', () => {
  it('legacy ciphertext presence derives set', () => {
    expect(branchPinSet({ redemptionPin: 'enc:v1:abcdef' })).toBe(true)
  })

  it('legacy null derives not-set', () => {
    expect(branchPinSet({ redemptionPin: null })).toBe(false)
  })

  it('both fields absent fails closed to not-set', () => {
    expect(branchPinSet({})).toBe(false)
  })

  it('never exposes the legacy value: the helper returns a plain boolean only', () => {
    const cipher = 'enc:v1:SECRETVALUE999'
    const result = branchPinSet({ redemptionPin: cipher })
    expect(result).toBe(true)
    expect(String(result)).not.toContain(cipher)
  })
})
