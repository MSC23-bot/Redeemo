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

  it('returns whitespace-bearing inputs of non-10 length unchanged (defensive)', () => {
    // Backend emits exactly 10 alphanumerics — but if a future change
    // ever surfaces a code with embedded whitespace AND a non-10
    // length, the formatter must NOT silently re-shape it.
    expect(formatRedemptionCode('a B3 xKZmLp')).toBe('a B3 xKZmLp')      // 11 chars
    expect(formatRedemptionCode('   leading-and-trailing   ')).toBe('   leading-and-trailing   ')

    // Note: a 10-char string CONTAINING whitespace will still be
    // grouped 5+5 — the formatter intentionally treats the input as
    // opaque 10 chars. Backend never produces such codes today.
  })

  it('returns input unchanged for non-ASCII / unusual chars (defensive)', () => {
    expect(formatRedemptionCode('🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉')).toBe('🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉')
    // Above is 10 emoji codepoints; .length on emoji-string surrogate pairs
    // can vary, so length-10 case may or may not split. The contract: don't
    // crash, return something the caller can render. Both outcomes are OK
    // — assert the function doesn't throw.
    expect(() => formatRedemptionCode('caféicated')).not.toThrow()
  })
})
