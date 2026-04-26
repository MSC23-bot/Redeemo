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

function getCode(err: unknown): string | null {
  if (err instanceof ApiClientError) return err.code
  if (err !== null && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code
  }
  return null
}

function getField(err: unknown): string | undefined {
  if (err instanceof ApiClientError) return err.field
  if (err !== null && typeof err === 'object' && 'field' in err && typeof (err as { field: unknown }).field === 'string') {
    return (err as { field: string }).field
  }
  return undefined
}

export function mapError(err: unknown): MappedError {
  const code = getCode(err)
  if (code) {
    const hit = TABLE[code]
    if (hit) {
      const result: MappedError = { code, ...hit }
      const field = getField(err)
      if (field !== undefined) result.field = field
      return result
    }
    return { code, message: 'Something went wrong. Please try again.', surface: 'toast', retryable: true }
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', surface: 'toast', retryable: true }
}
