// prisma/seed-data/requireEncryptionKey.ts
//
// F8 (SEC): the seed scripts encrypt branch redemption PINs with ENCRYPTION_KEY.
// They MUST use the REAL key (the same value the API uses) — never a repo-public
// fallback. Two compounding reasons:
//   1. A known constant key (e.g. 'a'.repeat(64)) makes seeded PINs decryptable
//      by anyone with the repo + DB read access (they could forge redemptions).
//   2. The fail-closed API (SEC-C2) uses the real key, so PINs encrypted under any
//      other key are undecryptable at runtime — the seeded data would be broken.
//
// THE REAL PROTECTION is requiring a valid real key. The NODE_ENV==='production'
// refuse below is defense-in-depth ONLY: it does not reliably distinguish a remote
// prod DB from the remote (Neon) dev DB — both are non-local and selected by the
// connection string, not NODE_ENV — so never rely on it as the guard.

const PUBLIC_PLACEHOLDER_KEY = 'a'.repeat(64)

/**
 * Fail fast (with a clear, plain-English message) unless ENCRYPTION_KEY is set to
 * a real 64-character hex key. Call at the very top of each seed script, before
 * any encrypt() runs. Does NOT change the encryption format or runtime logic.
 */
export function requireSeedEncryptionKey(): void {
  // Defense-in-depth: never seed a production environment (seed is a dev/demo tool).
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run a seed script with NODE_ENV=production. Seed scripts are a dev/demo ' +
        'tool and must never run against a production environment.',
    )
  }

  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Seeding encrypts branch PINs, so it requires the real ' +
        'ENCRYPTION_KEY — set it in .env to the SAME value the API uses, then re-run the seed.',
    )
  }

  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). The current value is ' +
        'malformed — set it in .env to the real key the API uses, then re-run the seed.',
    )
  }

  if (key === PUBLIC_PLACEHOLDER_KEY) {
    throw new Error(
      'ENCRYPTION_KEY is set to the repo-public placeholder key. Refusing to seed: this key is ' +
        'known to anyone with the repo, so seeded branch PINs would be crackable. Set ENCRYPTION_KEY ' +
        'in .env to a real secret key (the same one the API uses).',
    )
  }
}
