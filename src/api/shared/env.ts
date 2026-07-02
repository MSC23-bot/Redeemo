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

// Encryption key-rotation R1: the keyring boot validation. keyring.ts only imports
// `crypto` (no edge back into env.ts), so a static import here introduces no cycle.
// validateRequiredEnv() appends keyring problems to the same aggregated error.
import { validateKeyringEnv } from './keyring'

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
  // Cloudflare Turnstile (M1 Slice R, merchant self-serve registration captcha).
  // Default OFF: with CAPTCHA_ENABLED unset/false the verify helper skips (no
  // network call) and TURNSTILE_SECRET_KEY is NOT required, so dev/CI/test boot
  // without it. When CAPTCHA_ENABLED=true the secret is required (fail-closed).
  { flag: 'CAPTCHA_ENABLED', enabledValue: 'true', secrets: ['TURNSTILE_SECRET_KEY'] },
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
// ---------------------------------------------------------------------------
// Neon CU-burn PR-A Task A4: fail-safe maintenance-scheduler configuration.
// Governing docs: spec §14 (canonical startup policy) + plan Task A4.
//
// Canonical order — MAINTENANCE_MODE is resolved FIRST, then the scheduler
// values: (1) `MAINTENANCE_MODE=disabled` is the ONLY intentional
// maintenance-off path (the worker boots WITHOUT the scheduler + a loud
// structured log; scheduler values are NOT required); (2) unset or `enabled`
// ⇒ maintenance ON ⇒ every required value must be present AND valid, else the
// validator THROWS and the worker exits non-zero; (3) any other value ⇒ THROW
// (an unsupported mode is never coerced to disabled or enabled). A validation
// failure NEVER silently becomes disabled mode — there is no silent
// half-running default, no defaulted cadence, and no legacy-60s path.
// ---------------------------------------------------------------------------

/** The Neon free-tier scale-to-zero window: the idle floor must exceed it. */
export const MAINTENANCE_IDLE_FLOOR_MIN_MS = 300_000

export type MaintenanceConfig =
  | { mode: 'disabled' }
  | {
      mode: 'enabled'
      floorIdleMs: number
      floorActiveMs: number
      phaseBMaxItems: number
      phaseBBudgetMs: number
      statementTimeoutMs: number
      txTimeoutMs: number
      sweepOutboxEnabled: boolean
      /** PR-B per-sweep enable flags — each doubles as that sweep's rollback
       *  switch: disabling one leaves the siblings running and never enables
       *  any 60-second polling (spec §8.2). */
      sweepPendingHoursEnabled: boolean
      sweepClaimStaleEnabled: boolean
    }

function parseIntVar(
  env: NodeJS.ProcessEnv,
  name: string,
  problems: string[],
  opts: { exclusiveMin: number; label?: string },
): number | undefined {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') {
    problems.push(`${name} is not set (required when maintenance is enabled)`)
    return undefined
  }
  const n = Number(raw)
  if (!Number.isInteger(n)) {
    problems.push(`${name} must be an integer, got "${raw}"`)
    return undefined
  }
  if (n <= opts.exclusiveMin) {
    problems.push(`${name} must be > ${opts.exclusiveMin}${opts.label ? ` (${opts.label})` : ''}, got ${n}`)
    return undefined
  }
  return n
}

function parseBoolVar(env: NodeJS.ProcessEnv, name: string, problems: string[]): boolean | undefined {
  const raw = env[name]
  if (raw !== 'true' && raw !== 'false') {
    problems.push(`${name} must be exactly "true" or "false" (required when maintenance is enabled), got "${raw ?? ''}"`)
    return undefined
  }
  return raw === 'true'
}

/**
 * Resolve the maintenance-scheduler configuration, fail-closed. Pure (takes the
 * env record) so tests exercise every branch directly. Throws ONE aggregated
 * error on any invalid/missing value; an invalid config FAILS the process, it
 * does not disable it.
 */
export function resolveMaintenanceConfig(env: NodeJS.ProcessEnv): MaintenanceConfig {
  // (1) Resolve MAINTENANCE_MODE before any scheduler-value validation.
  const rawMode = env.MAINTENANCE_MODE
  if (rawMode === 'disabled') return { mode: 'disabled' }
  if (rawMode !== undefined && rawMode.trim() !== '' && rawMode !== 'enabled') {
    throw new Error(
      `[env] Refusing to start — unsupported MAINTENANCE_MODE "${rawMode}". ` +
        `Use "disabled" (explicit maintenance-off) or "enabled"/unset (default enabled); ` +
        `an unrecognised mode is never coerced.`,
    )
  }
  // (2) Enabled (explicit or defaulted): every required value present AND valid.
  const problems: string[] = []
  const floorIdleMs = parseIntVar(env, 'MAINTENANCE_FLOOR_IDLE_MS', problems, {
    exclusiveMin: MAINTENANCE_IDLE_FLOOR_MIN_MS,
    label: 'must exceed the Neon 5-minute scale-to-zero window',
  })
  const floorActiveMs = parseIntVar(env, 'MAINTENANCE_FLOOR_ACTIVE_MS', problems, { exclusiveMin: 0 })
  const phaseBMaxItems = parseIntVar(env, 'MAINTENANCE_PHASE_B_MAX_ITEMS', problems, { exclusiveMin: 0 })
  const phaseBBudgetMs = parseIntVar(env, 'MAINTENANCE_PHASE_B_BUDGET_MS', problems, { exclusiveMin: 0 })
  const statementTimeoutMs = parseIntVar(env, 'MAINTENANCE_STATEMENT_TIMEOUT_MS', problems, { exclusiveMin: 0 })
  const txTimeoutMs = parseIntVar(env, 'MAINTENANCE_TX_TIMEOUT_MS', problems, { exclusiveMin: 0 })
  const sweepOutboxEnabled = parseBoolVar(env, 'MAINTENANCE_SWEEP_OUTBOX_ENABLED', problems)
  const sweepPendingHoursEnabled = parseBoolVar(env, 'MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED', problems)
  const sweepClaimStaleEnabled = parseBoolVar(env, 'MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED', problems)
  if (statementTimeoutMs !== undefined && txTimeoutMs !== undefined && statementTimeoutMs >= txTimeoutMs) {
    problems.push(
      `MAINTENANCE_STATEMENT_TIMEOUT_MS (${statementTimeoutMs}) must be < MAINTENANCE_TX_TIMEOUT_MS (${txTimeoutMs})`,
    )
  }
  // (3) A validation failure NEVER silently becomes disabled mode.
  if (problems.length > 0) {
    throw new Error(
      `[env] Refusing to start — maintenance is enabled (MAINTENANCE_MODE=${rawMode ?? 'unset ⇒ enabled'}) ` +
        `but its configuration is missing or invalid:\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        `\nSet the values, or set MAINTENANCE_MODE=disabled to boot intentionally without the scheduler.`,
    )
  }
  return {
    mode: 'enabled',
    floorIdleMs: floorIdleMs!,
    floorActiveMs: floorActiveMs!,
    phaseBMaxItems: phaseBMaxItems!,
    phaseBBudgetMs: phaseBBudgetMs!,
    statementTimeoutMs: statementTimeoutMs!,
    txTimeoutMs: txTimeoutMs!,
    sweepOutboxEnabled: sweepOutboxEnabled!,
    sweepPendingHoursEnabled: sweepPendingHoursEnabled!,
    sweepClaimStaleEnabled: sweepClaimStaleEnabled!,
  }
}

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
  // Encryption key-rotation R1: keyring config (both boot modes, namespace
  // containment, denylist). Optional vars — the single-var bridge keeps current
  // envs valid — but a malformed explicit ring fail-closes here, in the SAME
  // aggregated error list (spec §3.4).
  for (const problem of validateKeyringEnv(process.env)) {
    problems.push('  - ' + problem)
  }
  if (problems.length > 0) {
    throw new Error(
      `[env] Refusing to start — ${problems.length} required secret(s) missing or placeholder:\n` +
        `${problems.join('\n')}\n` +
        `See .env.example for the full list and generation commands.`,
    )
  }
}
