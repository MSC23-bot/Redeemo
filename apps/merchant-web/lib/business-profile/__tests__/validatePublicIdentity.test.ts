import {
  validateBusinessName,
  validateDescription,
  validatePublicIdentity,
  hasPublicIdentityErrors,
  DESCRIPTION_MAX,
} from '../validatePublicIdentity'

describe('validateBusinessName', () => {
  it('rejects an empty/whitespace value', () => {
    expect(validateBusinessName('')).toMatch(/required/i)
    expect(validateBusinessName('   ')).toMatch(/required/i)
  })

  it('accepts a filled value', () => {
    expect(validateBusinessName('Acme Ltd')).toBeNull()
  })
})

describe('validateDescription', () => {
  it('rejects an empty/whitespace value', () => {
    expect(validateDescription('')).toMatch(/required/i)
    expect(validateDescription('   ')).toMatch(/required/i)
  })

  it(`rejects a value over ${DESCRIPTION_MAX} characters`, () => {
    expect(validateDescription('a'.repeat(DESCRIPTION_MAX + 1))).toMatch(/under 600/i)
  })

  it(`accepts exactly ${DESCRIPTION_MAX} characters`, () => {
    expect(validateDescription('a'.repeat(DESCRIPTION_MAX))).toBeNull()
  })

  it('accepts a normal value', () => {
    expect(validateDescription('A cosy neighbourhood cafe.')).toBeNull()
  })
})

describe('validatePublicIdentity / hasPublicIdentityErrors', () => {
  it('returns no errors for a fully valid draft', () => {
    const errors = validatePublicIdentity({
      businessName: 'Acme Ltd',
      tradingName: 'Acme',
      description: 'A cosy neighbourhood cafe.',
    })
    expect(hasPublicIdentityErrors(errors)).toBe(false)
  })

  it('flags businessName + description independently', () => {
    const errors = validatePublicIdentity({ businessName: '', tradingName: '', description: '' })
    expect(errors.businessName).not.toBeNull()
    expect(errors.description).not.toBeNull()
    expect(hasPublicIdentityErrors(errors)).toBe(true)
  })

  it('does not validate tradingName (optional, no format rule)', () => {
    const errors = validatePublicIdentity({
      businessName: 'Acme Ltd',
      tradingName: '',
      description: 'A cosy neighbourhood cafe.',
    })
    expect(hasPublicIdentityErrors(errors)).toBe(false)
  })
})
