import { describe, it, expect } from 'vitest'
import { isAssignedCallingCode, ASSIGNED_CALLING_CODES } from '../../../src/api/shared/countryCallingCodes'

// F4 (SEC): the assigned-country-code set used to validate SMS_ALLOWED_COUNTRY_CODES.

describe('isAssignedCallingCode (F4)', () => {
  it('accepts genuine assigned codes, including 1-digit +1 and +7', () => {
    for (const c of ['+1', '+7', '+44', '+353', '+49', '+33', '+211', '+998'])
      expect(isAssignedCallingCode(c)).toBe(true)
  })

  it('rejects partial prefixes that are not complete codes', () => {
    for (const c of ['+4', '+21', '+99', '+12', '+44X', '+440', '+444'])
      expect(isAssignedCallingCode(c)).toBe(false)
  })

  it('rejects malformed / non-"+" values', () => {
    for (const c of ['+', '44', '0044', '+abc', '++44', '', ' +44'])
      expect(isAssignedCallingCode(c)).toBe(false)
  })

  it('the danger prefix +4 is absent while real +4X codes are present', () => {
    expect(ASSIGNED_CALLING_CODES.has('+4')).toBe(false)
    for (const c of ['+40', '+41', '+43', '+44', '+45', '+49'])
      expect(ASSIGNED_CALLING_CODES.has(c)).toBe(true)
    // +42 is NOT a 2-digit code — it is split into +420 / +421 / +423.
    expect(ASSIGNED_CALLING_CODES.has('+42')).toBe(false)
    expect(ASSIGNED_CALLING_CODES.has('+420')).toBe(true)
  })
})
