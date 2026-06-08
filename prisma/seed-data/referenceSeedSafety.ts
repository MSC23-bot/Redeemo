// ─────────────────────────────────────────────────────────────────────────────
// Reference-seed safety gates (PR2b)
//
// Pure, side-effect-free helpers used by prisma/seed-reference.ts to make the
// production-safe reference seed hard to run by accident and impossible to run
// with placeholder Stripe config. They take an env-like object so they can be
// unit-tested without spawning the seed or touching a database.
//
//   - requireReferenceSeedOptIn  → ALLOW_REFERENCE_SEED must be "true"
//   - redactedTarget             → DATABASE_URL host+db, credentials stripped
//   - requireReferenceSeedConfirm→ REFERENCE_SEED_CONFIRM must match the target
//   - resolveReferenceStripePriceIds → real Stripe price ids, FAIL CLOSED
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenceStripePriceIds {
  monthlyPriceId: string
  annualPriceId: string
}

type EnvLike = Record<string, string | undefined>

/** ALLOW_REFERENCE_SEED=true is required — refuse otherwise. */
export function requireReferenceSeedOptIn(env: EnvLike): void {
  if (env.ALLOW_REFERENCE_SEED !== 'true') {
    throw new Error(
      'Refusing to run the reference seed: set ALLOW_REFERENCE_SEED=true to confirm ' +
        'you intend to load reference/config data into the target database.',
    )
  }
}

/**
 * The target DATABASE_URL must be set, parseable, and have a host. FAIL CLOSED
 * before the Prisma adapter / client is constructed. Error messages never echo
 * the value (it can contain credentials). Returns the (trimmed) URL on success.
 */
export function requireDatabaseUrl(env: EnvLike): string {
  const url = env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error('DATABASE_URL is not set. The reference seed requires a target database connection string.')
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL. Refusing to run the reference seed.')
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      'DATABASE_URL must be a postgres connection URL (postgresql:// or postgres://). ' +
        'Refusing to run the reference seed.',
    )
  }
  if (!parsed.hostname) {
    throw new Error('DATABASE_URL has no database host. Refusing to run the reference seed.')
  }
  return url
}

/** Host + database name from DATABASE_URL, with credentials removed. Never throws. */
export function redactedTarget(databaseUrl: string | undefined): string {
  if (!databaseUrl) return '(DATABASE_URL not set)'
  try {
    const u = new URL(databaseUrl)
    // host already excludes user:pass; pathname is the database name.
    return `${u.host}${u.pathname}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

/**
 * REFERENCE_SEED_CONFIRM must be set AND appear in the redacted target string
 * (the operator confirms the DB host/name they intend to write to). Designed to
 * be non-interactive / CI-safe: set the env var to the DB host or name.
 */
export function requireReferenceSeedConfirm(env: EnvLike, target: string): void {
  const confirm = env.REFERENCE_SEED_CONFIRM?.trim()
  if (!confirm) {
    throw new Error(
      `Refusing to run the reference seed: set REFERENCE_SEED_CONFIRM to confirm the ` +
        `target database shown above (prefer the unique host). Target: ${target}`,
    )
  }
  if (!target.includes(confirm)) {
    throw new Error(
      `REFERENCE_SEED_CONFIRM ("${confirm}") does not match the target database ` +
        `("${target}"). Refusing — this guards against pointing the reference seed ` +
        `at the wrong database.`,
    )
  }
}

// A real Stripe price id is "price_" followed by a run of base62 chars (no
// further underscores). This rejects the dev placeholders price_monthly_dev /
// price_annual_dev (they contain extra underscores) and obviously-short values.
const STRIPE_PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{10,}$/

// Exact known non-real values to reject even if they happen to match the shape.
// Exact-match only (no substring scan) so a legitimate random Stripe id that
// merely contains "dev"/"test" as a substring is never falsely rejected.
const REJECTED_PRICE_IDS: ReadonlySet<string> = new Set([
  'price_monthly_dev',
  'price_annual_dev',
  'price_placeholder',
  'price_example',
  'price_replace_me',
])

/** Validate one Stripe price id env var. FAIL CLOSED on missing/placeholder/malformed/dev. */
export function validateStripePriceId(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `${name} is not set. The reference seed requires the REAL Stripe price id ` +
        `(there is no default — set up Stripe products first).`,
    )
  }
  const v = value.trim()
  if (REJECTED_PRICE_IDS.has(v)) {
    throw new Error(
      `${name} ("${v}") is a placeholder/dev value. Set the REAL Stripe price id ` +
        `from your Stripe dashboard (live or test mode as appropriate).`,
    )
  }
  if (!STRIPE_PRICE_ID_PATTERN.test(v)) {
    throw new Error(
      `${name} ("${v}") is malformed — expected a real Stripe price id like ` +
        `"price_1AbCdEfGhIjKlMnO" (no spaces, no extra underscores, no dev/placeholder values).`,
    )
  }
  return v
}

/** Resolve both Stripe price ids from env. FAIL CLOSED if either is invalid. */
export function resolveReferenceStripePriceIds(env: EnvLike): ReferenceStripePriceIds {
  return {
    monthlyPriceId: validateStripePriceId('STRIPE_PRICE_ID_MONTHLY', env.STRIPE_PRICE_ID_MONTHLY),
    annualPriceId: validateStripePriceId('STRIPE_PRICE_ID_ANNUAL', env.STRIPE_PRICE_ID_ANNUAL),
  }
}
