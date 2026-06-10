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
 * Secrets that are required ONLY when their feature flag is switched on. The
 * hard `REQUIRED_SECRETS` above stay minimal so dev/CI boot without R2/Resend,
 * while a deploy that turns a feature ON still fails closed if its secret is
 * missing. PR-0.5 adds the `STORAGE_ENABLED` → `R2_*` gate here.
 */
export const FEATURE_GATED_SECRETS: ReadonlyArray<{
  flag: string
  enabledValue: string
  secrets: readonly string[]
}> = [
  { flag: 'EMAIL_ENABLED', enabledValue: 'true', secrets: ['RESEND_API_KEY'] },
  // R2 storage (PR-0.5): the credentials + config the storage library needs to
  // presign. R2_ACCOUNT_ID is documented but not gated (the endpoint embeds it).
  {
    flag: 'STORAGE_ENABLED',
    enabledValue: 'true',
    secrets: ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL'],
  },
]

/**
 * If `process.env[flagVar] === enabledValue`, every named secret must be present
 * and non-placeholder (throws on the first that isn't). If the flag is off, this
 * is a no-op. Use for feature-gated secrets that are only needed when a feature
 * is enabled (e.g. RESEND_API_KEY only when EMAIL_ENABLED=true).
 */
export function requireSecretWhenEnabled(
  flagVar: string,
  enabledValue: string,
  ...secretNames: string[]
): void {
  if ((process.env[flagVar] ?? '') !== enabledValue) return
  for (const name of secretNames) requireSecret(name)
}

/**
 * Validates every required secret up front and throws ONE error listing all
 * that are missing or placeholder. Call at process start (before building the
 * app) so a misconfigured deploy fails fast with the complete list. Also checks
 * the feature-gated secrets whose flags are currently ON.
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
  // Feature-gated secrets: required only when their flag is on. Check each named
  // secret individually so EVERY missing one is reported, not just the first.
  for (const gate of FEATURE_GATED_SECRETS) {
    if ((process.env[gate.flag] ?? '') !== gate.enabledValue) continue
    for (const name of gate.secrets) {
      try {
        requireSecret(name)
      } catch (err) {
        problems.push(
          '  - ' +
            (err as Error).message.replace(/^\[env\] /, '') +
            ` (required when ${gate.flag}=${gate.enabledValue})`,
        )
      }
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
