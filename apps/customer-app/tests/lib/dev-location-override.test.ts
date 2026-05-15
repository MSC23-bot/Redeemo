// Plan 4 §AU — devLocationOverride() unit tests.

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} as Record<string, unknown> } },
}))

import Constants from 'expo-constants'
import { devLocationOverride } from '@/lib/devLocationOverride'

type MutableExtra = Record<string, unknown>
const extra = () => (Constants.expoConfig!.extra as MutableExtra)

type DevGlobal = { __DEV__?: boolean | undefined }
const devGlobal = global as unknown as DevGlobal

describe('devLocationOverride', () => {
  const originalDev = devGlobal.__DEV__

  beforeEach(() => {
    // Reset extra and ensure we're back in dev mode by default.
    Object.keys(extra()).forEach(k => delete extra()[k])
    devGlobal.__DEV__ = true
  })

  afterAll(() => {
    devGlobal.__DEV__ = originalDev
  })

  it('returns null when env vars are unset (extra.devLocationOverride absent)', () => {
    expect(devLocationOverride()).toBeNull()
  })

  it('returns null when extra.devLocationOverride is undefined', () => {
    extra().devLocationOverride = undefined
    expect(devLocationOverride()).toBeNull()
  })

  it('returns parsed coords when both lat and lng are finite numbers', () => {
    extra().devLocationOverride = { lat: 53.6458, lng: -1.785 }
    expect(devLocationOverride()).toEqual({ lat: 53.6458, lng: -1.785 })
  })

  it('returns null in release builds even if extra.devLocationOverride is set', () => {
    devGlobal.__DEV__ = false
    extra().devLocationOverride = { lat: 51.5081, lng: -0.1281 }
    expect(devLocationOverride()).toBeNull()
  })

  it('returns null when lat is non-numeric (string)', () => {
    extra().devLocationOverride = { lat: '53.6458', lng: -1.785 }
    expect(devLocationOverride()).toBeNull()
  })

  it('returns null when lng is non-numeric (string)', () => {
    extra().devLocationOverride = { lat: 53.6458, lng: '-1.785' }
    expect(devLocationOverride()).toBeNull()
  })

  it('returns null when lat is NaN', () => {
    extra().devLocationOverride = { lat: Number.NaN, lng: -1.785 }
    expect(devLocationOverride()).toBeNull()
  })

  it('returns null when lng is Infinity', () => {
    extra().devLocationOverride = { lat: 53.6458, lng: Number.POSITIVE_INFINITY }
    expect(devLocationOverride()).toBeNull()
  })

  it('returns null when the override is a primitive instead of an object', () => {
    extra().devLocationOverride = 'not-an-object'
    expect(devLocationOverride()).toBeNull()
  })

  it('returns null when lat is missing entirely', () => {
    extra().devLocationOverride = { lng: -1.785 }
    expect(devLocationOverride()).toBeNull()
  })
})
