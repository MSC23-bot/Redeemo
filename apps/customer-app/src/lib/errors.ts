import { ApiClientError } from './api'

export type MappedError = {
  code: string
  message: string
  field?: string
  surface: 'field' | 'toast' | 'fullpage' | 'silent'
  retryable: boolean
}

const TABLE: Record<string, Omit<MappedError, 'code'>> = {
  // Credentials
  INVALID_CREDENTIALS:        { message: 'Wrong email or password.',                            surface: 'field',    retryable: false },

  // Account state (backend-authoritative)
  EMAIL_NOT_VERIFIED:         { message: 'Please verify your email to continue.',               surface: 'field',    retryable: false },
  PHONE_NOT_VERIFIED:         { message: 'Please verify your phone to continue.',               surface: 'field',    retryable: false },
  ACCOUNT_INACTIVE:           { message: "This account isn't active. Please contact support.", surface: 'field',    retryable: false },
  ACCOUNT_SUSPENDED:          { message: 'Your account has been suspended. Please contact support.', surface: 'field', retryable: false },

  // Register
  EMAIL_ALREADY_EXISTS:       { message: 'This email is already registered.',                   field: 'email',    surface: 'field', retryable: false },
  PHONE_ALREADY_EXISTS:       { message: 'This phone number is already linked to an account.',  field: 'phone',    surface: 'field', retryable: false },
  PASSWORD_POLICY_VIOLATION:  { message: 'Password must include uppercase, lowercase, a number, and a special character.', field: 'password', surface: 'field', retryable: false },

  // OTP
  OTP_INVALID:                { message: 'That code is incorrect. Try again.',                  surface: 'field',    retryable: true  },
  OTP_EXPIRED:                { message: 'This code has expired. Tap Resend.',                  surface: 'field',    retryable: true  },
  OTP_MAX_ATTEMPTS:           { message: 'Too many attempts. Please try again shortly.',        surface: 'field',    retryable: false },
  ALREADY_VERIFIED:           { message: 'This number is already verified on your account.',    surface: 'field',    retryable: false },

  // Tokens / links
  RESET_TOKEN_INVALID:        { message: 'This reset link is invalid. Request a new one.',      surface: 'fullpage', retryable: true  },
  RESET_TOKEN_EXPIRED:        { message: 'This reset link has expired. Request a new one.',     surface: 'fullpage', retryable: true  },
  VERIFICATION_TOKEN_INVALID: { message: 'This verification link is invalid.',                  surface: 'fullpage', retryable: true  },
  VERIFICATION_TOKEN_EXPIRED: { message: 'This verification link has expired.',                 surface: 'fullpage', retryable: true  },
  ACTION_TOKEN_INVALID:       { message: 'This action has expired. Please start again.',       surface: 'fullpage', retryable: true  },

  // Reviews
  REVIEW_NOT_FOUND:           { message: "We couldn't find that review. It may have been removed.", surface: 'toast', retryable: false },
  REVIEW_NOT_OWNED:           { message: 'You can only edit or delete your own reviews.',          surface: 'toast', retryable: false },

  // Transport
  RATE_LIMITED:               { message: 'Too many attempts. Please wait a moment and try again.', surface: 'toast', retryable: false },
  NETWORK_ERROR:              { message: 'Connection lost. Check your network.',                surface: 'toast',    retryable: true  },
  SESSION_EXPIRED:            { message: 'Please sign in again.',                               surface: 'silent',   retryable: false },
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
