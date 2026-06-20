// M1 Slice 3/4: client mirror of the backend passwordSchema (src/api/shared/schemas.ts):
// min 8 chars + an uppercase, a lowercase, a digit, and a special character. Used for
// inline validation on the set-password (claim/reset) and register screens so the user
// sees the requirement before submitting (the backend remains the source of truth).
const SPECIAL = /[!@#$%^&*()\-_=+[\]{}|;:'",.<>?/\\`~]/

export interface PasswordChecks {
  length: boolean
  upper: boolean
  lower: boolean
  digit: boolean
  special: boolean
}

export function passwordChecks(pw: string): PasswordChecks {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: SPECIAL.test(pw),
  }
}

export function passwordPolicyOk(pw: string): boolean {
  const c = passwordChecks(pw)
  return c.length && c.upper && c.lower && c.digit && c.special
}
