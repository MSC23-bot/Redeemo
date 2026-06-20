import { passwordChecks, passwordPolicyOk } from '@/lib/auth/password'

describe('password policy (M1 Slice 3, mirrors backend passwordSchema)', () => {
  it('accepts a fully compliant password', () => {
    expect(passwordPolicyOk('ValidPass1!')).toBe(true)
  })

  it('rejects when any class is missing or it is too short', () => {
    expect(passwordPolicyOk('abcdefg1!')).toBe(false) // no uppercase
    expect(passwordPolicyOk('ABCDEFG1!')).toBe(false) // no lowercase
    expect(passwordPolicyOk('Abcdefgh!')).toBe(false) // no digit
    expect(passwordPolicyOk('Abcdefgh1')).toBe(false) // no special
    expect(passwordPolicyOk('Ab1!')).toBe(false) // too short
    expect(passwordPolicyOk('')).toBe(false)
  })

  it('reports per-rule checks', () => {
    expect(passwordChecks('Abcdefg1!')).toEqual({ length: true, upper: true, lower: true, digit: true, special: true })
    expect(passwordChecks('abc')).toEqual({ length: false, upper: false, lower: true, digit: false, special: false })
  })
})
