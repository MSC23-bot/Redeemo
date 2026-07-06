import { getSessionEpoch, bumpSessionEpoch } from '@/lib/auth/sessionEpoch'

describe('sessionEpoch (T1 - client-only session cache-isolation core)', () => {
  it('is monotonically increasing across bumps', () => {
    const start = getSessionEpoch()
    bumpSessionEpoch()
    expect(getSessionEpoch()).toBe(start + 1)
    bumpSessionEpoch()
    bumpSessionEpoch()
    expect(getSessionEpoch()).toBe(start + 3)
  })

  it('never decreases and reading it repeatedly does not itself bump it', () => {
    const a = getSessionEpoch()
    const b = getSessionEpoch()
    const c = getSessionEpoch()
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('is independent of any token value - it is a pure boundary counter, not derived from tokenStore', () => {
    // The epoch module has no import of tokenStore and no notion of a token; this is
    // a structural pin that calling bumpSessionEpoch in isolation (no token mutation
    // anywhere in this test) still advances the counter correctly.
    const before = getSessionEpoch()
    bumpSessionEpoch()
    const after = getSessionEpoch()
    expect(after).toBe(before + 1)
  })
})
