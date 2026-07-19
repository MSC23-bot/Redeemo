/**
 * Pure helpers for prisma/cleanup-agreement-probe.ts, extracted so they are unit-testable without
 * executing the script (which connects to a database on import of its main flow).
 */
import { randomUUID } from 'node:crypto'

/** The namespace the capability sentinel lives in. Inside the tool's permitted `document/` prefix,
 * under a marker segment that no application code ever writes to (application keys are
 * `document/<merchantId>/<random>.<ext>`; merchant ids never equal the marker). */
export const CAPABILITY_SENTINEL_NAMESPACE = 'document/__cleanup-capability-probe__/'

/**
 * Build a FRESH, collision-resistant capability-sentinel key for one probe call.
 * NEVER a fixed/shared key: a fixed key could coincidentally exist and would then be DELETED by
 * the capability probe, touching an object outside any approved rehearsal prefix. A per-call
 * random UUID leaf makes an accidental collision with any real object practically impossible, and
 * S3/R2 DeleteObject on a nonexistent key still returns success, which is exactly the capability
 * signal the probe needs.
 */
export function buildCapabilitySentinelKey(): string {
  return `${CAPABILITY_SENTINEL_NAMESPACE}${randomUUID()}`
}

/**
 * Anchored target-identity check (shared by the script and its tests): `target` must EQUAL the
 * full hostname or its exact first label (the Neon endpoint id). Substrings/partials never match.
 */
export function targetMatchesHost(target: string, host: string): boolean {
  if (!target || target.length < 8) return false
  return target === host || target === host.split('.')[0]
}
