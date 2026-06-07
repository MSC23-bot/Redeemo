// Fail-closed environment / secret validation (Security Stabilisation Gate — SEC-C2).
//
// Source-visible fallback secrets have been removed: every required secret must
// come from the environment. `requireSecret()` throws if a secret is missing,
// empty, or still a placeholder, so the API can never boot with a forgeable
// default (e.g. a JWT secret or Stripe webhook secret). `validateRequiredEnv()`
// checks the whole required set up front and reports EVERY problem in one error
// so a misconfigured deploy fails fast with a complete list.

// Substrings that mark a value as an unfilled placeholder (case-insensitive).
// `placeholder` catches the old `sk_test_placeholder` / `whsec_placeholder`;
// `replace_me` / `your-` catch `.env.example` markers; the `dev-*-secret`
// literals catch the removed JWT fallbacks if anyone re-introduces them.
const PLACEHOLDER_SUBSTRINGS = [
  'placeholder',
  'replace_me',
  'your-',
  'changeme',
  'dev-customer-secret',
  'dev-merchant-secret',
  'dev-branch-secret',
  'dev-admin-secret',
]

function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase()
  return PLACEHOLDER_SUBSTRINGS.some((marker) => v.includes(marker))
}

/**
 * Returns the required environment secret `name`, or throws if it is missing,
 * empty, or a placeholder. Call at the point a secret is consumed so the
 * process fails closed instead of silently using a default.
 */
export function requireSecret(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `[env] Required secret ${name} is not set. Add it to the environment (see .env.example).`,
    )
  }
  if (isPlaceholder(value)) {
    throw new Error(
      `[env] Required secret ${name} is set to a placeholder value. Provide a real value (see .env.example).`,
    )
  }
  return value
}

/** Secrets the API must have to run. Validated at boot by `validateRequiredEnv()`. */
export const REQUIRED_SECRETS = [
  'DATABASE_URL',
  'ENCRYPTION_KEY',
  'REDIS_URL',
  'JWT_SECRET_CUSTOMER',
  'JWT_SECRET_MERCHANT',
  'JWT_SECRET_BRANCH',
  'JWT_SECRET_ADMIN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
  'TWILIO_FROM_NUMBER',
] as const

/**
 * Validates every required secret up front and throws ONE error listing all
 * that are missing or placeholder. Call at process start (before building the
 * app) so a misconfigured deploy fails fast with the complete list.
 */
export function validateRequiredEnv(): void {
  const problems: string[] = []
  for (const name of REQUIRED_SECRETS) {
    try {
      requireSecret(name)
    } catch (err) {
      problems.push('  - ' + (err as Error).message.replace(/^\[env\] /, ''))
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `[env] Refusing to start — ${problems.length} required secret(s) missing or placeholder:\n` +
        `${problems.join('\n')}\n` +
        `See .env.example for the full list and generation commands.`,
    )
  }
}
