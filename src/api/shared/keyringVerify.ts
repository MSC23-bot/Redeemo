// src/api/shared/keyringVerify.ts
//
// The worker's `--verify-keyring-and-exit` body, EXTRACTED into a dependency-injected
// helper (Codex review finding 5) so it is unit-testable WITHOUT importing src/worker.ts
// — whose top-level BullMQ-processor imports + module-level main() would otherwise run
// (connect to the DB, register workers/repeatables) just by importing it.
//
// Guarantees (proven by behavioural tests, not static source matching):
//   - publish resolved true  → exit code 0
//   - publish resolved false → exit code 1   (a failed parity publish must NOT exit 0)
//   - any throw (connect / dynamic import / publish) → exit code 1
//   - prisma.$disconnect() ALWAYS runs (finally), on success / false / thrown
//   - registers NO BullMQ worker / queue / repeatable (it never references them)

import type { KeyringFingerprintWriter } from './keyring'

/** Minimal Prisma surface this helper needs (connect/disconnect + the fingerprint writer). */
export interface VerifyPrisma extends KeyringFingerprintWriter {
  $connect(): Promise<unknown>
  $disconnect(): Promise<unknown>
}

export interface VerifyKeyringDeps {
  /** Construct the Prisma client (real adapter in prod; a fake in tests). */
  makePrisma: () => VerifyPrisma
  /** Publish the worker's keyring fingerprint; resolves true on success, false otherwise. */
  publish: (prisma: VerifyPrisma) => Promise<boolean>
  /** Injectable loggers (default to console.*); kept injectable so tests can assert them. */
  log?: (message: string) => void
  errorLog?: (message: string, meta?: unknown) => void
}

export async function verifyKeyringAndExit(deps: VerifyKeyringDeps): Promise<number> {
  const info = deps.log ?? ((m: string) => console.info(m))
  const errorLog = deps.errorLog ?? ((m: string, meta?: unknown) => console.error(m, meta))
  const prisma = deps.makePrisma()
  try {
    await prisma.$connect()
    const ok = await deps.publish(prisma)
    info(`[worker] --verify-keyring-and-exit: fingerprint published=${ok}; exiting without starting BullMQ.`)
    return ok ? 0 : 1
  } catch (err) {
    // Redacted: only the error message (build/connect/publish errors carry config
    // labels, never key bytes — the fingerprint itself contains no key material).
    errorLog('[worker] --verify-keyring-and-exit failed (best-effort verify path)', {
      reason: err instanceof Error ? err.message : String(err),
    })
    return 1
  } finally {
    // GUARANTEED on every path — success, false publication, or a thrown error.
    await prisma.$disconnect().catch(() => undefined)
  }
}
