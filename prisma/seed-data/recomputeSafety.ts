// ─────────────────────────────────────────────────────────────────────────────
// Recompute-runner safety gates
//
// Opt-in + target-confirmation gates for prisma/recompute-counts.ts. Pure and
// side-effect-free so they can be unit-tested without a database. They take an
// env-like object.
//
// DATABASE_URL validation + redaction are REUSED from referenceSeedSafety (D3) —
// they are generic and already tested; this module does not duplicate them.
// ─────────────────────────────────────────────────────────────────────────────

type EnvLike = Record<string, string | undefined>

/** ALLOW_RECOMPUTE_COUNTS=true is required — refuse otherwise. */
export function requireRecomputeOptIn(env: EnvLike): void {
  if (env.ALLOW_RECOMPUTE_COUNTS !== 'true') {
    throw new Error(
      'Refusing to run the recompute runner: set ALLOW_RECOMPUTE_COUNTS=true to confirm you ' +
        'intend to rewrite the denormalized category/tag counts in the target database.',
    )
  }
}

/**
 * RECOMPUTE_CONFIRM must be set AND appear in the redacted target string (the
 * operator confirms the DB they intend to write to). Non-interactive / CI-safe:
 * set it to the unique DB host.
 */
export function requireRecomputeConfirm(env: EnvLike, target: string): void {
  const confirm = env.RECOMPUTE_CONFIRM?.trim()
  if (!confirm) {
    throw new Error(
      `Refusing to run the recompute runner: set RECOMPUTE_CONFIRM to confirm the target ` +
        `database shown above (prefer the unique host). Target: ${target}`,
    )
  }
  if (!target.includes(confirm)) {
    throw new Error(
      `RECOMPUTE_CONFIRM ("${confirm}") does not match the target database ("${target}"). ` +
        `Refusing — this guards against pointing the recompute runner at the wrong database.`,
    )
  }
}
