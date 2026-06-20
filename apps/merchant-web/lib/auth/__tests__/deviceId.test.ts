import { getOrCreateDeviceId } from '@/lib/auth/deviceId'

describe('getOrCreateDeviceId (M1 Slice 1)', () => {
  beforeEach(() => window.localStorage.clear())

  it('creates a uuid once and returns it stably across calls', () => {
    const a = getOrCreateDeviceId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(getOrCreateDeviceId()).toBe(a)
    expect(window.localStorage.getItem('redeemo_merchant_device_id')).toBe(a)
  })
})
