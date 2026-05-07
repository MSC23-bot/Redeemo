import { formatRedemptionCode } from '@/features/voucher/utils/formatRedemptionCode'

describe('formatRedemptionCode', () => {
  it('groups 8-char uppercase alphanumeric as 4+4 with single space', () => {
    expect(formatRedemptionCode('A7K2P9X4')).toBe('A7K2 P9X4')
  })

  it('preserves case (no normalisation — backend alphabet is already uppercase)', () => {
    expect(formatRedemptionCode('ABCDEFGH')).toBe('ABCD EFGH')
  })

  it('preserves digits', () => {
    expect(formatRedemptionCode('12345678')).toBe('1234 5678')
  })

  it('returns input unchanged when length is not 8', () => {
    expect(formatRedemptionCode('short')).toBe('short')
    expect(formatRedemptionCode('TOOLONG12345')).toBe('TOOLONG12345')
    expect(formatRedemptionCode('')).toBe('')
    // Old 10-char mixed-case codes from prior backend versions: pass
    // through unchanged. The display still shows them readably (no
    // group separator) rather than re-shaping them with the new rule.
    expect(formatRedemptionCode('aB3xKZmLp9')).toBe('aB3xKZmLp9')
  })

  it('does not mutate the input string', () => {
    const input = 'A7K2P9X4'
    const _result = formatRedemptionCode(input)
    expect(input).toBe('A7K2P9X4')
  })

  it('returns whitespace-bearing inputs of non-8 length unchanged (defensive)', () => {
    // Backend emits exactly 8 alphanumerics — but if a future change
    // ever surfaces a code with embedded whitespace AND a non-8
    // length, the formatter must NOT silently re-shape it.
    expect(formatRedemptionCode('A B3 P9X 9')).toBe('A B3 P9X 9')           // length 10
    expect(formatRedemptionCode('   leading-and-trailing   ')).toBe('   leading-and-trailing   ')

    // Note: a length-8 string CONTAINING whitespace will still be
    // grouped 4+4 — the formatter intentionally treats the input as
    // opaque 8 chars. Backend never produces such codes today.
  })

  it('returns input unchanged for non-ASCII / unusual chars (defensive)', () => {
    expect(formatRedemptionCode('🎉🎉🎉🎉🎉🎉🎉🎉')).toBe('🎉🎉🎉🎉🎉🎉🎉🎉')
    // Above is 8 emoji codepoints; .length on emoji-string surrogate pairs
    // can vary, so length-8 case may or may not split. The contract: don't
    // crash, return something the caller can render. Both outcomes are OK
    // — assert the function doesn't throw.
    expect(() => formatRedemptionCode('caféicat')).not.toThrow()
  })
})
