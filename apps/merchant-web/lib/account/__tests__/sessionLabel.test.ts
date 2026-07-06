import { formatSessionDeviceLabel, formatSessionLastActive, formatApproxAge } from '@/lib/account/sessionLabel'

const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

describe('formatSessionDeviceLabel', () => {
  it('labels the current session "This <hardware> · <browser>"', () => {
    expect(formatSessionDeviceLabel({ deviceType: 'web', deviceName: null, userAgent: MAC_CHROME }, true)).toBe(
      'This Mac · Chrome',
    )
  })

  it('labels a non-current web session "<hardware> · <browser>" with no "This"', () => {
    expect(formatSessionDeviceLabel({ deviceType: 'web', deviceName: null, userAgent: IPAD_SAFARI }, false)).toBe(
      'iPad · Safari',
    )
  })

  it('recognises iPhone + Safari', () => {
    expect(formatSessionDeviceLabel({ deviceType: 'web', deviceName: null, userAgent: IPHONE_SAFARI }, false)).toBe(
      'iPhone · Safari',
    )
  })

  it('falls back to a generic label for an unrecognisable UA', () => {
    expect(formatSessionDeviceLabel({ deviceType: 'web', deviceName: null, userAgent: 'weird-bot/1.0' }, false)).toBe(
      'Unknown device',
    )
  })

  it('prefers deviceName for a future non-web deviceType (forward-looking, unreachable with real data today)', () => {
    expect(
      formatSessionDeviceLabel({ deviceType: 'ios_app', deviceName: 'Staff app', userAgent: IPHONE_SAFARI }, false),
    ).toBe('Staff app · iPhone')
  })
})

describe('formatSessionLastActive', () => {
  const now = new Date('2026-07-06T12:00:00.000Z')

  it('always reports "Active now" for the current session regardless of lastActiveAt', () => {
    expect(formatSessionLastActive('2026-07-01T00:00:00.000Z', true, now)).toBe('Active now')
  })

  it('reports full-word hours-ago for a non-current session', () => {
    expect(formatSessionLastActive('2026-07-06T10:00:00.000Z', false, now)).toBe('2 hours ago')
  })

  it('reports full-word days-ago for a non-current session', () => {
    expect(formatSessionLastActive('2026-07-03T12:00:00.000Z', false, now)).toBe('3 days ago')
  })

  it('singularises "1 hour ago" / "1 day ago"', () => {
    expect(formatSessionLastActive('2026-07-06T11:00:00.000Z', false, now)).toBe('1 hour ago')
    expect(formatSessionLastActive('2026-07-05T12:00:00.000Z', false, now)).toBe('1 day ago')
  })
})

describe('formatApproxAge', () => {
  const now = new Date('2026-07-06T12:00:00.000Z')

  it('reports months-ago for a password changed a few months back', () => {
    expect(formatApproxAge('2026-04-06T12:00:00.000Z', now)).toBe('3 months ago')
  })

  it('reports "today" for something changed within the last day', () => {
    expect(formatApproxAge('2026-07-06T01:00:00.000Z', now)).toBe('today')
  })
})
