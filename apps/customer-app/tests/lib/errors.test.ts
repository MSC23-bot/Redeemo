import { ApiClientError } from '@/lib/api'
import { mapError } from '@/lib/errors'

describe('mapError', () => {
  it('maps EMAIL_TAKEN to an inline field error', () => {
    const m = mapError(new ApiClientError('x', 'EMAIL_TAKEN', 400, 'email'))
    expect(m.surface).toBe('field'); expect(m.field).toBe('email'); expect(m.message).toMatch(/already/i)
  })
  it('maps OTP_MAX_ATTEMPTS with retry window hint', () => {
    const m = mapError(new ApiClientError('x', 'OTP_MAX_ATTEMPTS', 429))
    expect(m.message).toMatch(/too many/i); expect(m.retryable).toBe(false)
  })
  it('falls back to generic toast for UNKNOWN', () => {
    const m = mapError(new ApiClientError('x', 'UNKNOWN', 500))
    expect(m.surface).toBe('toast'); expect(m.retryable).toBe(true)
  })
})
