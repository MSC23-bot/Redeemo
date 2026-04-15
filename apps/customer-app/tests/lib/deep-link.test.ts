import { parseResetPasswordUrl } from '@/lib/deep-link'

describe('parseResetPasswordUrl', () => {
  it('parses the app scheme', () => {
    expect(parseResetPasswordUrl('redeemo://reset-password?token=abc')).toBe('abc')
  })
  it('parses the https universal link', () => {
    expect(parseResetPasswordUrl('https://redeemo.com/reset-password?token=xyz')).toBe('xyz')
  })
  it('returns null for unrelated urls', () => {
    expect(parseResetPasswordUrl('redeemo://welcome')).toBeNull()
  })
})
