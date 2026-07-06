import {
  validateWebsiteUrl,
  validateCompanyNumber,
  validateVatNumber,
  validateRegisteredDetails,
  hasRegisteredDetailsErrors,
} from '@/lib/business-profile/validateRegisteredDetails'

describe('validateWebsiteUrl', () => {
  it('accepts empty (clears the field)', () => {
    expect(validateWebsiteUrl('')).toBeNull()
    expect(validateWebsiteUrl('   ')).toBeNull()
  })

  it('accepts a bare domain', () => {
    expect(validateWebsiteUrl('oldfoundrykitchen.co.uk')).toBeNull()
  })

  it('accepts a schemed URL', () => {
    expect(validateWebsiteUrl('https://oldfoundrykitchen.co.uk/menu')).toBeNull()
  })

  it('rejects a non-URL string', () => {
    expect(validateWebsiteUrl('not a url')).toMatch(/valid website/i)
  })
})

describe('validateCompanyNumber', () => {
  it('accepts empty', () => {
    expect(validateCompanyNumber('')).toBeNull()
  })

  it('accepts 8 digits', () => {
    expect(validateCompanyNumber('09872341')).toBeNull()
  })

  it('accepts 2 letters then 6 digits', () => {
    expect(validateCompanyNumber('SC123456')).toBeNull()
  })

  it('rejects a short number', () => {
    expect(validateCompanyNumber('123')).toMatch(/8 digits, or 2 letters/i)
  })

  it('rejects letters in the wrong position', () => {
    expect(validateCompanyNumber('1234567A')).toMatch(/8 digits, or 2 letters/i)
  })
})

describe('validateVatNumber', () => {
  it('accepts empty', () => {
    expect(validateVatNumber('')).toBeNull()
  })

  it('accepts GB + 9 digits', () => {
    expect(validateVatNumber('GB213987422')).toBeNull()
  })

  it('accepts the spaced display format', () => {
    expect(validateVatNumber('GB 213 9874 22')).toBeNull()
  })

  it('accepts a 12-digit group VAT number', () => {
    expect(validateVatNumber('GB213987422001')).toBeNull()
  })

  it('rejects a missing GB prefix', () => {
    expect(validateVatNumber('213987422')).toMatch(/GB followed by 9 digits/i)
  })

  it('rejects a garbage string', () => {
    expect(validateVatNumber('NOTVALID')).toMatch(/GB followed by 9 digits/i)
  })
})

describe('validateRegisteredDetails + hasRegisteredDetailsErrors', () => {
  it('returns all-null errors for a fully valid draft', () => {
    const errors = validateRegisteredDetails({
      websiteUrl: 'oldfoundrykitchen.co.uk',
      companyNumber: '09872341',
      vatNumber: 'GB213987422',
    })
    expect(errors).toEqual({ websiteUrl: null, companyNumber: null, vatNumber: null })
    expect(hasRegisteredDetailsErrors(errors)).toBe(false)
  })

  it('flags whichever field(s) are invalid', () => {
    const errors = validateRegisteredDetails({
      websiteUrl: 'oldfoundrykitchen.co.uk',
      companyNumber: 'bad',
      vatNumber: 'GB213987422',
    })
    expect(errors.websiteUrl).toBeNull()
    expect(errors.companyNumber).not.toBeNull()
    expect(errors.vatNumber).toBeNull()
    expect(hasRegisteredDetailsErrors(errors)).toBe(true)
  })

  it('treats an all-empty draft as valid (clears every field)', () => {
    const errors = validateRegisteredDetails({ websiteUrl: '', companyNumber: '', vatNumber: '' })
    expect(hasRegisteredDetailsErrors(errors)).toBe(false)
  })
})
