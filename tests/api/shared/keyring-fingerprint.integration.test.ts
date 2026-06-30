import 'dotenv/config'
import { describe, it, expect, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { publishKeyringFingerprint, keyringFingerprint, buildKeyProviderFromEnv } from '../../../src/api/shared/keyring'

// Loopback integration (encryption key-rotation R1, spec §3.9 / Amendment R3-#1).
//
// Proves the fingerprint-publication path (the --verify-keyring-and-exit primitive
// the worker uses, and the web boot publish) WRITES/UPDATES a KeyringFingerprint
// row. This file carries the `.integration.test.ts` suffix so it runs ONLY in the
// serial integration project, behind the project-global strict-loopback guard
// (tests/integration.setup.ts) — it NEVER connects to Neon. It is intentionally
// NOT run during R1 implementation (the controller runs it behind the loopback
// gate after `prisma migrate deploy` applies the KeyringFingerprint migration to a
// disposable loopback Postgres).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// Use unique synthetic service labels so the test is hermetic and never collides
// with a real 'web'/'worker' row, and track them for FK-safe cleanup.
const SERVICE_A = `it-web-${Date.now()}`
const SERVICE_B = `it-worker-${Date.now()}`
const createdServices: string[] = [SERVICE_A, SERVICE_B]

// A 64-hex TEST key (NOT a real secret) so the single-var bridge forms a valid ring.
const TEST_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const testEnv = { ENCRYPTION_KEY: TEST_KEY } as NodeJS.ProcessEnv

afterAll(async () => {
  // KeyringFingerprint has no FK relations, so a direct deleteMany is FK-safe.
  await prisma.keyringFingerprint.deleteMany({ where: { service: { in: createdServices } } })
  await prisma.$disconnect()
})

describe('publishKeyringFingerprint — real loopback DB', () => {
  it('inserts a KeyringFingerprint row with the canonical fingerprint + codeCapability', async () => {
    const ok = await publishKeyringFingerprint(prisma, SERVICE_A as any, testEnv)
    expect(ok).toBe(true)

    const row = await prisma.keyringFingerprint.findUnique({ where: { service: SERVICE_A } })
    expect(row).not.toBeNull()
    expect(row?.codeCapability).toBe('v2-reader-v1')
    // Matches the in-process canonical computation; contains no raw key bytes.
    const expected = keyringFingerprint(buildKeyProviderFromEnv(testEnv))
    expect(row?.fingerprint).toBe(expected)
    expect(row?.fingerprint).not.toContain(TEST_KEY)
  })

  it('a second publish for the same service UPDATES the existing row (upsert, not a duplicate)', async () => {
    await publishKeyringFingerprint(prisma, SERVICE_A as any, testEnv)
    const first = await prisma.keyringFingerprint.findUnique({ where: { service: SERVICE_A } })
    expect(first).not.toBeNull()

    await publishKeyringFingerprint(prisma, SERVICE_A as any, testEnv)
    const count = await prisma.keyringFingerprint.count({ where: { service: SERVICE_A } })
    expect(count).toBe(1)

    const second = await prisma.keyringFingerprint.findUnique({ where: { service: SERVICE_A } })
    // @updatedAt advances (or stays equal) on the upsert; bootedAt is preserved.
    expect(second?.id).toBe(first?.id)
    expect(second?.bootedAt.getTime()).toBe(first?.bootedAt.getTime())
  })

  it('publishes independent rows per service', async () => {
    await publishKeyringFingerprint(prisma, SERVICE_B as any, testEnv)
    const rowB = await prisma.keyringFingerprint.findUnique({ where: { service: SERVICE_B } })
    expect(rowB?.service).toBe(SERVICE_B)
  })
})
