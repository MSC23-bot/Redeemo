import { formatCooldownDurationHuman } from '@/features/voucher/utils/cooldownFormat'

describe('formatCooldownDurationHuman', () => {
  it('30 minutes', () => {
    expect(formatCooldownDurationHuman(1800)).toBe('30 minutes')
  })

  it('1 hour (singular)', () => {
    expect(formatCooldownDurationHuman(3600)).toBe('1 hour')
  })

  it('4 hours (plural)', () => {
    expect(formatCooldownDurationHuman(14400)).toBe('4 hours')
  })

  it('1 day (singular)', () => {
    expect(formatCooldownDurationHuman(24 * 3600)).toBe('1 day')
  })

  it('7 days (plural)', () => {
    expect(formatCooldownDurationHuman(7 * 24 * 3600)).toBe('7 days')
  })

  it('non-round minutes fallback', () => {
    // 90 minutes = 1.5 hours. Choose readable form. Spec doesn't fully pin
    // this — picking "1 hour 30 minutes" as the readable form for v1.
    expect(formatCooldownDurationHuman(90 * 60)).toBe('1 hour 30 minutes')
  })

  it('non-round hours fallback', () => {
    // 25 hours = 1 day 1 hour
    expect(formatCooldownDurationHuman(25 * 3600)).toBe('1 day 1 hour')
  })
})
