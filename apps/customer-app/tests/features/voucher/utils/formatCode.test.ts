import { formatCode, codeAccessibilityLabel } from '@/features/voucher/utils/formatCode'

describe('formatCode', () => {
  it('groups 6-char codes as 3-3 with a space', () => {
    expect(formatCode('K3F9P7')).toBe('K3F 9P7')
  })

  it('groups legacy 10-char codes as 5-5 with a space', () => {
    expect(formatCode('AB3F9K2P7Q')).toBe('AB3F9 K2P7Q')
  })

  it('returns unknown-length codes as-is (no grouping)', () => {
    expect(formatCode('K3F9P7A8')).toBe('K3F9P7A8')
    expect(formatCode('AB')).toBe('AB')
  })

  it('tolerates already-formatted input (strips whitespace first)', () => {
    expect(formatCode('K3F 9P7')).toBe('K3F 9P7')
    expect(formatCode('AB3F9 K2P7Q')).toBe('AB3F9 K2P7Q')
  })
})

describe('codeAccessibilityLabel', () => {
  it('announces code character-by-character with "space" for the gap', () => {
    expect(codeAccessibilityLabel('K3F9P7')).toBe(
      'Redemption code. K, 3, F, 9, P, 7.'
    )
  })

  it('pronounces "O" and other common letters by their letter name only', () => {
    expect(codeAccessibilityLabel('ABC')).toBe('Redemption code. A, B, C.')
  })

  it('handles legacy 10-char codes', () => {
    expect(codeAccessibilityLabel('AB3F9K2P7Q')).toBe(
      'Redemption code. A, B, 3, F, 9, K, 2, P, 7, Q.'
    )
  })
})
