import { branchShortName } from '@/features/merchant/utils/branchShortName'

describe('branchShortName', () => {
  it('strips merchant prefix when separated by em dash', () => {
    expect(branchShortName('Covelum — Brightlingsea')).toBe('Brightlingsea')
  })

  it('strips merchant prefix when separated by en dash', () => {
    expect(branchShortName('Covelum – Colchester')).toBe('Colchester')
  })

  it('strips merchant prefix when separated by hyphen with spaces', () => {
    expect(branchShortName('Beans & Brew - Soho')).toBe('Soho')
  })

  it('returns the input unchanged when no separator is present', () => {
    expect(branchShortName('Beans & Brew')).toBe('Beans & Brew')
  })

  it('returns empty string when input is empty', () => {
    expect(branchShortName('')).toBe('')
  })

  it('handles multiple separators by stripping only up to the first one', () => {
    expect(branchShortName('Acme Co — Foo — Bar')).toBe('Foo — Bar')
  })

  it('trims whitespace around the result', () => {
    expect(branchShortName('Acme   —   Brightlingsea  ')).toBe('Brightlingsea')
  })
})
