import { ApiError } from '@/lib/api/client'

// M1 Slice 2: map a thrown error (typically ApiError) into a friendly screen message.
// 429 is handled by STATUS first because the per-route edge rate-limiter returns the
// fastify default body with NO nested error.code, while service-thrown 429s do carry
// a code; both should surface the same "too many attempts" message.
const FRIENDLY: Record<string, string> = {
  INVALID_CREDENTIALS: 'The email or password is incorrect.',
  EMAIL_NOT_VERIFIED: 'Please verify your email to continue. Check your inbox for the verification code.',
  MERCHANT_SUSPENDED: 'This merchant account is suspended. Please contact support.',
  MERCHANT_DEACTIVATED: 'This merchant account is deactivated. Please contact support.',
  ACCOUNT_SUSPENDED: 'Your account has been suspended. Please contact support.',
  OTP_INVALID: 'The code you entered is incorrect.',
  ACTION_TOKEN_INVALID: 'That code has expired. Please start again.',
  VERIFICATION_TOKEN_INVALID: 'That code has expired. Please start again.',
  CLAIM_TOKEN_EXPIRED: 'This account setup link is invalid or has expired.',
  RESET_TOKEN_EXPIRED: 'This password reset link is invalid or has expired.',
  RESET_TOKEN_INVALID: 'This password reset link is invalid or has expired.',
  PASSWORD_POLICY_VIOLATION:
    'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.',
  CAPTCHA_FAILED: 'We could not verify that you are human. Please try again.',
  SESSION_INIT_FAILED: 'Could not start your session. Please try again.',
  // My Account (§BP-ACC) change-password.
  CURRENT_PASSWORD_INCORRECT: 'That current password is incorrect.',
  NEW_PASSWORD_SAME_AS_CURRENT: 'Choose a new password that is different from your current one.',
}

export interface AuthError {
  message: string
  code?: string
  status?: number
}

export function authErrorMessage(err: unknown): AuthError {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return { message: 'Too many attempts. Please wait a moment and try again.', status: 429, code: err.code }
    }
    if (err.code && FRIENDLY[err.code]) {
      return { message: FRIENDLY[err.code], code: err.code, status: err.status }
    }
    return { message: err.message || 'Something went wrong. Please try again.', code: err.code, status: err.status }
  }
  return { message: 'Something went wrong. Please try again.' }
}

// The two "challenge destroyed / expired" codes that mean the OTP/verify session is
// dead and the user must restart (re-enter credentials / re-register) rather than
// re-submit the same challenge.
export function isExpiredChallenge(code: string | undefined): boolean {
  return code === 'ACTION_TOKEN_INVALID' || code === 'VERIFICATION_TOKEN_INVALID'
}
