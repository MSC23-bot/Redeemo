import { describe, it, expect, afterEach } from 'vitest'
import {
  allowedSmsCountryCodes,
  isAllowedSmsDestination,
  smsCountryCodeConfigWarning,
} from '../../../src/api/shared/smsLimiter'

// F4 (SEC): SMS_ALLOWED_COUNTRY_CODES must reject partial prefixes (e.g. "+4")
// that would otherwise widen the allowlist to a whole region (+40…+49).

const UK = '+447700900000'
const DE = '+491701234567' // +49 Germany — must NOT be reachable via a "+4" typo
const US = '+12025550100'  // +1 NANP

afterEach(() => { delete process.env.SMS_ALLOWED_COUNTRY_CODES })

describe('SMS country allowlist validation (F4)', () => {
  it('"+4" does NOT allow +40…+49 — it is dropped and the list falls back to UK', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+4'
    expect(allowedSmsCountryCodes()).toEqual(['+44'])            // partial dropped → UK fallback
    expect(isAllowedSmsDestination(DE)).toBe(false)              // +49 blocked
    expect(isAllowedSmsDestination('+40712345678')).toBe(false) // +40 blocked
    expect(isAllowedSmsDestination(UK)).toBe(true)              // UK still allowed
  })

  it('drops other partials / garbage, falling back to UK', () => {
    for (const bad of ['+21', '+99', '+12', '+', '0044', '44', '+abc', '++44']) {
      process.env.SMS_ALLOWED_COUNTRY_CODES = bad
      expect(allowedSmsCountryCodes()).toEqual(['+44'])
      expect(isAllowedSmsDestination(US)).toBe(false)
      expect(isAllowedSmsDestination(UK)).toBe(true)
    }
  })

  it('keeps the valid codes from a mixed config and drops the invalid ones', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+4,+44,+353' // +4 invalid; +44/+353 valid
    expect(allowedSmsCountryCodes()).toEqual(['+44', '+353'])
    expect(isAllowedSmsDestination(UK)).toBe(true)
    expect(isAllowedSmsDestination('+353871234567')).toBe(true)
    expect(isAllowedSmsDestination(DE)).toBe(false)
  })

  it('accepts genuine full codes including 1-digit +1 (whole NANP) and +7', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+44,+1,+7,+353'
    expect(allowedSmsCountryCodes()).toEqual(['+44', '+1', '+7', '+353'])
    expect(isAllowedSmsDestination(US)).toBe(true)             // +1 NANP enabled deliberately
    expect(isAllowedSmsDestination('+79161234567')).toBe(true) // +7
  })

  it('defaults to UK-only when unset', () => {
    expect(allowedSmsCountryCodes()).toEqual(['+44'])
    expect(isAllowedSmsDestination(UK)).toBe(true)
    expect(isAllowedSmsDestination(US)).toBe(false)
  })
})

describe('smsCountryCodeConfigWarning (F4 boot warning)', () => {
  it('returns null for a clean config', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+44,+353'
    expect(smsCountryCodeConfigWarning()).toBeNull()
  })

  it('returns null when unset', () => {
    expect(smsCountryCodeConfigWarning()).toBeNull()
  })

  it('names the dropped entry and the effective allowlist', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+4,+44'
    const w = smsCountryCodeConfigWarning()
    expect(w).toContain('entry: +4')        // dropped (singular)
    expect(w).toContain('Allowing: +44')    // effective
    expect(w).toMatch(/full E\.164/i)
  })

  it('reports the UK fallback when ALL entries are invalid', () => {
    process.env.SMS_ALLOWED_COUNTRY_CODES = '+4,+21'
    expect(smsCountryCodeConfigWarning()).toContain('Allowing: +44')
  })
})
