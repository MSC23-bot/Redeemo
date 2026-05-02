import { ApiClientError } from '@/lib/api'
import { mapError } from '@/lib/errors'

describe('mapError', () => {
  it('maps EMAIL_ALREADY_EXISTS to an inline field error', () => {
    const m = mapError(new ApiClientError('x', 'EMAIL_ALREADY_EXISTS', 409, 'email'))
    expect(m.surface).toBe('field'); expect(m.field).toBe('email'); expect(m.message).toMatch(/already/i)
  })
  it('maps EMAIL_NOT_VERIFIED as a login-flow redirect signal (form surface)', () => {
    const m = mapError(new ApiClientError('x', 'EMAIL_NOT_VERIFIED', 403))
    expect(m.code).toBe('EMAIL_NOT_VERIFIED'); expect(m.surface).toBe('field'); expect(m.retryable).toBe(false)
  })
  it('maps PASSWORD_POLICY_VIOLATION to the password field', () => {
    const m = mapError(new ApiClientError('x', 'PASSWORD_POLICY_VIOLATION', 400))
    expect(m.surface).toBe('field'); expect(m.field).toBe('password')
  })
  it('maps RESET_TOKEN_EXPIRED to fullpage retryable', () => {
    const m = mapError(new ApiClientError('x', 'RESET_TOKEN_EXPIRED', 400))
    expect(m.surface).toBe('fullpage'); expect(m.retryable).toBe(true)
  })
  it('maps OTP_MAX_ATTEMPTS with retry window hint', () => {
    const m = mapError(new ApiClientError('x', 'OTP_MAX_ATTEMPTS', 429))
    expect(m.message).toMatch(/too many/i); expect(m.retryable).toBe(false)
  })
  it('falls back to generic toast for UNKNOWN', () => {
    const m = mapError(new ApiClientError('x', 'UNKNOWN', 500))
    expect(m.surface).toBe('toast'); expect(m.retryable).toBe(true)
  })

  // Review delete/edit errors used to fall through to the generic
  // "Something went wrong" toast because they were missing from TABLE.
  // Without these mappings the user has no way to know the review
  // doesn't exist (404) vs they don't own it (403).
  it('maps REVIEW_NOT_FOUND to a clear toast', () => {
    const m = mapError(new ApiClientError('x', 'REVIEW_NOT_FOUND', 404))
    expect(m.code).toBe('REVIEW_NOT_FOUND')
    expect(m.surface).toBe('toast')
    expect(m.message).toMatch(/find that review/i)
  })
  it('maps REVIEW_NOT_OWNED to a clear toast', () => {
    const m = mapError(new ApiClientError('x', 'REVIEW_NOT_OWNED', 403))
    expect(m.code).toBe('REVIEW_NOT_OWNED')
    expect(m.surface).toBe('toast')
    expect(m.message).toMatch(/your own reviews/i)
  })
})
