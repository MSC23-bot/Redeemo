import { authErrorMessage, isExpiredChallenge } from '@/lib/auth/errorMessages'
import { ApiError } from '@/lib/api/client'

describe('authErrorMessage (M1 Slice 2)', () => {
  it('maps known error codes to friendly copy', () => {
    expect(authErrorMessage(new ApiError(401, { error: { code: 'INVALID_CREDENTIALS' } })).message).toMatch(/email or password/i)
    expect(authErrorMessage(new ApiError(403, { error: { code: 'EMAIL_NOT_VERIFIED' } })).message).toMatch(/verify your email/i)
    expect(authErrorMessage(new ApiError(400, { error: { code: 'PASSWORD_POLICY_VIOLATION' } })).message).toMatch(/at least 8 characters/i)
  })

  it('maps ANY 429 to the too-many message regardless of code (edge limiter has none)', () => {
    expect(authErrorMessage(new ApiError(429, { statusCode: 429, error: 'Too Many Requests' })).message).toMatch(/too many/i)
    expect(authErrorMessage(new ApiError(429, { error: { code: 'PWD_RESET_RATE_LIMITED' } })).message).toMatch(/too many/i)
  })

  it('falls back gracefully for unknown codes and non-ApiError throwables', () => {
    expect(authErrorMessage(new ApiError(500, { error: { code: 'WEIRD', message: 'boom' } })).message).toBe('boom')
    expect(authErrorMessage(new Error('x')).message).toMatch(/something went wrong/i)
    expect(authErrorMessage('nope').message).toMatch(/something went wrong/i)
  })
})

describe('isExpiredChallenge', () => {
  it('is true only for the challenge-destroyed codes', () => {
    expect(isExpiredChallenge('ACTION_TOKEN_INVALID')).toBe(true)
    expect(isExpiredChallenge('VERIFICATION_TOKEN_INVALID')).toBe(true)
    expect(isExpiredChallenge('OTP_INVALID')).toBe(false)
    expect(isExpiredChallenge(undefined)).toBe(false)
  })
})
