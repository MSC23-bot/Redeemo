import { maskPhone } from './maskPhone'

describe('maskPhone', () => {
  it('masks a UK E.164 number keeping country code + last 2 digits', () => {
    expect(maskPhone('+447700900000')).toBe('+44••••••••00')
  })

  it('masks a US E.164 number', () => {
    expect(maskPhone('+15551234567')).toBe('+1••••••••67')
  })

  it('returns empty string for null', () => {
    expect(maskPhone(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(maskPhone(undefined)).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(maskPhone('')).toBe('')
  })

  it('returns the original value unchanged when too short to mask', () => {
    expect(maskPhone('+19')).toBe('+19')
  })

  it('returns the original value unchanged when not E.164', () => {
    expect(maskPhone('07700900000')).toBe('07700900000')
  })
})
