import { formatDateLabel, signatureMethodPhrase, formatOwnerPhone, formatOwnerName } from '@/lib/business-profile/format'

describe('formatDateLabel', () => {
  it('formats an ISO string as en-GB long date', () => {
    expect(formatDateLabel('2026-05-14T10:00:00.000Z')).toBe('14 May 2026')
  })

  it('returns null for a missing value', () => {
    expect(formatDateLabel(null)).toBeNull()
    expect(formatDateLabel(undefined)).toBeNull()
  })

  it('returns null for a malformed ISO string', () => {
    expect(formatDateLabel('not-a-date')).toBeNull()
  })
})

describe('signatureMethodPhrase', () => {
  it('maps ZOHO_SIGN', () => {
    expect(signatureMethodPhrase('ZOHO_SIGN')).toBe('via Zoho Sign')
  })

  it('defaults to click-to-agree for CLICK_TO_AGREE and any unrecognised/absent value', () => {
    expect(signatureMethodPhrase('CLICK_TO_AGREE')).toBe('by click to agree')
    expect(signatureMethodPhrase(null)).toBe('by click to agree')
    expect(signatureMethodPhrase(undefined)).toBe('by click to agree')
    expect(signatureMethodPhrase('SOMETHING_NEW')).toBe('by click to agree')
  })
})

describe('formatOwnerPhone', () => {
  it('combines a national number with a country code', () => {
    expect(formatOwnerPhone('1223 456 789', '+44')).toBe('+44 1223 456 789')
  })

  it('normalises a country code missing its leading +', () => {
    expect(formatOwnerPhone('1223 456 789', '44')).toBe('+44 1223 456 789')
  })

  it('returns the phone as-is when it already has a leading +', () => {
    expect(formatOwnerPhone('+441223456789', '44')).toBe('+441223456789')
  })

  it('returns the bare phone when there is no country code', () => {
    expect(formatOwnerPhone('1223 456 789', null)).toBe('1223 456 789')
  })

  it('returns null when there is no phone at all', () => {
    expect(formatOwnerPhone(null, '+44')).toBeNull()
    expect(formatOwnerPhone('  ', '+44')).toBeNull()
  })
})

describe('formatOwnerName', () => {
  it('joins first + last name', () => {
    expect(formatOwnerName('James', 'Whitfield')).toBe('James Whitfield')
  })

  it('degrades gracefully when a part is missing', () => {
    expect(formatOwnerName('James', null)).toBe('James')
    expect(formatOwnerName(null, 'Whitfield')).toBe('Whitfield')
    expect(formatOwnerName(null, null)).toBe('')
  })
})
