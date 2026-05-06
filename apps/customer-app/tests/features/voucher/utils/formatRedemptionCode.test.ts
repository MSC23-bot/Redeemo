import { formatRedemptionCode } from '@/features/voucher/utils/formatRedemptionCode'

describe('formatRedemptionCode', () => {
  it('groups 10-char alphanumeric as 5+5 with single space', () => {
    expect(formatRedemptionCode('aB3xKZmLp9')).toBe('aB3xK ZmLp9')
  })

  it('preserves case (no normalisation)', () => {
    expect(formatRedemptionCode('ABCDEfghij')).toBe('ABCDE fghij')
  })

  it('preserves digits', () => {
    expect(formatRedemptionCode('1234567890')).toBe('12345 67890')
  })

  it('returns input unchanged when length is not 10', () => {
    expect(formatRedemptionCode('short')).toBe('short')
    expect(formatRedemptionCode('TOOLONG12345')).toBe('TOOLONG12345')
    expect(formatRedemptionCode('')).toBe('')
  })

  it('does not mutate the input string', () => {
    const input = 'aB3xKZmLp9'
    const _result = formatRedemptionCode(input)
    expect(input).toBe('aB3xKZmLp9')
  })
})
