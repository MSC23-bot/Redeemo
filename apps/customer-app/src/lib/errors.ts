import { ApiClientError } from './api'

export type MappedError = {
  code: string
  message: string
  field?: string
  surface: 'field' | 'toast' | 'fullpage' | 'silent'
  retryable: boolean
}

const TABLE: Record<string, Omit<MappedError, 'code'>> = {
  EMAIL_TAKEN:            { message: 'That email is already in use.',                field: 'email',    surface: 'field',    retryable: false },
  INVALID_CREDENTIALS:    { message: 'Wrong email or password.',                     surface: 'field',    retryable: false },
  ACCOUNT_NOT_VERIFIED:   { message: 'Please verify your email to continue.',        surface: 'field',    retryable: false },
  OTP_INVALID:            { message: 'That code is incorrect. Try again.',           surface: 'field',    retryable: true  },
  OTP_EXPIRED:            { message: 'This code has expired. Tap Resend.',           surface: 'field',    retryable: true  },
  OTP_MAX_ATTEMPTS:       { message: 'Too many attempts. Try again shortly.',        surface: 'field',    retryable: false },
  RATE_LIMITED:           { message: "You're going a bit fast — try again shortly.", surface: 'toast',    retryable: false },
  TOKEN_EXPIRED:          { message: 'This link has expired. Request a new one.',    surface: 'fullpage', retryable: true  },
  NETWORK_ERROR:          { message: "Connection lost. Check your network.",         surface: 'toast',    retryable: true  },
  SESSION_EXPIRED:        { message: 'Please sign in again.',                        surface: 'silent',   retryable: false },
}

export function mapError(err: unknown): MappedError {
  if (err instanceof ApiClientError) {
    const hit = TABLE[err.code]
    if (hit) {
      const result: MappedError = { code: err.code, ...hit }
      // field from ApiClientError overrides table default if present
      if (err.field !== undefined) result.field = err.field
      return result
    }
    return { code: err.code, message: 'Something went wrong. Please try again.', surface: 'toast', retryable: true }
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', surface: 'toast', retryable: true }
}
