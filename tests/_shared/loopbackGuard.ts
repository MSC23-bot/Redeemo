// PR-G1a1: the PROJECT-GLOBAL strict-loopback guard for the `integration` vitest
// project (pure logic, no side effects).
//
// Why: the `integration` suites talk to a REAL Postgres. The 89 raw suites read
// `DATABASE_URL` (via `new PrismaPg({ connectionString: process.env.DATABASE_URL })`);
// the Insights suites read `TEST_DATABASE_URL` (via `makeTestPrisma`). The repo's
// persistent `.env` `DATABASE_URL` points at shared Neon, so an integration run must
// be PROVEN to target a disposable loopback DB BEFORE any client/migration connects.
//
// Contract (validated for EVERY integration-project run):
//   - DATABASE_URL is REQUIRED and must be strict-loopback.
//   - TEST_DATABASE_URL, if present, must INDEPENDENTLY be strict-loopback (a safe
//     localhost TEST_DATABASE_URL must never mask a Neon-backed DATABASE_URL).
//   - An unset/empty required value, a malformed URL, or a non-loopback host throws.
//
// Safety: this module is PURE (no `process.env` read, no auto-run). It is invoked
// against the live environment only by `tests/integration.setup.ts`. Error messages
// name the variable and the parsed HOSTNAME only - never the full connection string
// or credentials.

// Strict loopback set (mirrors tests/api/merchant/insights/_helpers/testDb.ts).
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export interface IntegrationDbEnv {
  DATABASE_URL?: string
  TEST_DATABASE_URL?: string
}

// Note: this parses `postgresql://...` directly with WHATWG `URL`, which works on the
// Node 24 runtime CI/local use. `testDb.ts` rewrites the scheme to `http://` before
// parsing as extra insurance for "some runtime"; the divergence is intentional and
// FAILS CLOSED here - if a runtime could not parse the scheme, `new URL` would throw
// "not a valid URL" and the guard refuses to run (no escape path), rather than
// silently passing.
/** Parse a connection string and return its hostname, or throw a credential-free error. */
function hostnameOf(label: string, raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    // Never echo `raw` - it carries credentials.
    throw new Error(`[integration-guard] ${label} is not a valid URL; refusing to run.`)
  }
  return url.hostname
}

/**
 * Assert the integration-project database target(s) are strict-loopback. Throws BEFORE
 * any Prisma client or migration connects. Validates DATABASE_URL and TEST_DATABASE_URL
 * INDEPENDENTLY. Never logs/throws the full connection string or credentials.
 */
export function assertIntegrationDbLoopback(env: IntegrationDbEnv): void {
  // DATABASE_URL: required + loopback (the 89 raw suites + prisma migrate use it).
  const dbUrl = env.DATABASE_URL
  if (!dbUrl || dbUrl.trim() === '') {
    throw new Error(
      '[integration-guard] DATABASE_URL is required for the integration project and was ' +
        'unset/empty. Point it at a DISPOSABLE LOOPBACK Postgres (127.0.0.1) - see ' +
        'docs/runbooks/insights-test-db.md. Refusing to run.',
    )
  }
  const dbHost = hostnameOf('DATABASE_URL', dbUrl)
  if (!LOOPBACK_HOSTS.has(dbHost)) {
    throw new Error(
      `[integration-guard] DATABASE_URL host "${dbHost}" is not loopback. Integration suites ` +
        'may target ONLY a disposable loopback DB (127.0.0.1 / localhost / ::1). Refusing to ' +
        'run to avoid touching shared Neon / Railway / staging.',
    )
  }

  // TEST_DATABASE_URL: optional, but if present it must INDEPENDENTLY be loopback (the
  // Insights suites use it; a loopback TEST_DATABASE_URL must never mask a non-loopback
  // DATABASE_URL, which is why it is checked separately from DATABASE_URL above).
  const testUrl = env.TEST_DATABASE_URL
  if (testUrl && testUrl.trim() !== '') {
    const testHost = hostnameOf('TEST_DATABASE_URL', testUrl)
    if (!LOOPBACK_HOSTS.has(testHost)) {
      throw new Error(
        `[integration-guard] TEST_DATABASE_URL host "${testHost}" is not loopback. It may ` +
          'target ONLY a disposable loopback DB (127.0.0.1 / localhost / ::1). Refusing to run.',
      )
    }
  }
}
