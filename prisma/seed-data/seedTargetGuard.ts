// prisma/seed-data/seedTargetGuard.ts
//
// Fail-closed database-identity guard for the demo seed (PR #400 review
// blocker 1). The seed and its teardown mutate whichever database
// DATABASE_URL happens to point at; this guard refuses to run unless the
// operator has explicitly confirmed THAT database by name.
//
// Contract:
// - Production is always refused, confirmation or not (REDEEMO_DEPLOY_ENV
//   or NODE_ENV set to 'production').
// - The operator must set SEED_DEMO_TARGET_DB to the exact "host/dbname"
//   identity of DATABASE_URL. Anything else (unset, empty, mismatch,
//   unparseable URL) refuses with a message that shows the resolved
//   identity so the operator can consciously confirm it.

export const SEED_TARGET_ENV_VAR = 'SEED_DEMO_TARGET_DB'

/** Credential-free identity of a postgres connection URL: "host/dbname". */
export function dbIdentity(databaseUrl: string): string {
  const u = new URL(databaseUrl)
  const db = u.pathname.replace(/^\//, '').split('?')[0]
  if (!u.hostname || !db) throw new Error('DATABASE_URL has no host or database name')
  return `${u.hostname}/${db}`
}

export type SeedTargetEnv = {
  databaseUrl: string | undefined
  confirm: string | undefined
  deployEnv: string | undefined
  nodeEnv: string | undefined
}

/**
 * Throws unless the target database is explicitly confirmed and not
 * production. Returns the confirmed identity for logging.
 */
export function assertConfirmedSeedTarget(env: SeedTargetEnv): string {
  if (env.deployEnv === 'production' || env.nodeEnv === 'production') {
    throw new Error(
      'seed-demo refuses to run in production (REDEEMO_DEPLOY_ENV/NODE_ENV). ' +
        'Demo display data is dev-only; the launch path is the seed-scrub, not this script.',
    )
  }
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not set; refusing to run seed-demo.')
  }
  let identity: string
  try {
    identity = dbIdentity(env.databaseUrl)
  } catch (e) {
    throw new Error(`DATABASE_URL could not be parsed (${(e as Error).message}); refusing to run seed-demo.`)
  }
  if (!env.confirm || env.confirm !== identity) {
    throw new Error(
      `Target database not confirmed. DATABASE_URL resolves to "${identity}". ` +
        `If (and only if) that is the database you intend to mutate, re-run with ` +
        `${SEED_TARGET_ENV_VAR}="${identity}".`,
    )
  }
  return identity
}
