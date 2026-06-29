import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { encryptWith, decryptWith } from '../../src/api/shared/encryption'
import {
  countAffected,
  dryRunDecrypt,
  migrate,
  verify,
  assertExpectHost,
  parseAndValidateKeys,
} from '../../prisma/reencrypt-branch-pins'

// TEST-ONLY keys generated locally (NEVER a real/staging key). 64-hex (32 bytes).
const TEST_OLD_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const TEST_NEW_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
const PLACEHOLDER_KEY = 'a'.repeat(64)

// Unique fixture ids so this suite never collides with other integration suites.
const SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const MERCHANT_ID = `reencrypt-test-merchant-${SUFFIX}`
const BRANCH_IDS = [
  `reencrypt-test-branch-a-${SUFFIX}`,
  `reencrypt-test-branch-b-${SUFFIX}`,
  `reencrypt-test-branch-c-${SUFFIX}`,
]
// A branch with redemptionPin = null — must be ignored by all tallies.
const NULL_PIN_BRANCH_ID = `reencrypt-test-branch-null-${SUFFIX}`

// Plaintext PINs the fixtures encrypt under TEST_OLD_KEY. (These are TEST-ONLY
// 4-digit strings; they are NOT a real branch PIN and never appear in logs.)
const PINS: Record<string, string> = {
  [BRANCH_IDS[0]]: '1111',
  [BRANCH_IDS[1]]: '2222',
  [BRANCH_IDS[2]]: '3333',
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function deleteFixtures(): Promise<void> {
  await prisma.branch.deleteMany({
    where: { id: { in: [...BRANCH_IDS, NULL_PIN_BRANCH_ID] } },
  })
  await prisma.merchant.deleteMany({ where: { id: MERCHANT_ID } })
}

/** (Re)create the merchant + the three encrypted branches + one null-pin branch. */
async function seedFixtures(): Promise<void> {
  await deleteFixtures()
  await prisma.merchant.create({
    data: { id: MERCHANT_ID, businessName: `Reencrypt Test Merchant ${SUFFIX}` },
  })
  for (const branchId of BRANCH_IDS) {
    await prisma.branch.create({
      data: {
        id: branchId,
        merchantId: MERCHANT_ID,
        name: `Branch ${branchId}`,
        addressLine1: '1 Test Street',
        city: 'Testville',
        postcode: 'T1 1ST',
        redemptionPin: encryptWith(PINS[branchId], TEST_OLD_KEY),
      },
    })
  }
  // Null-pin branch (same merchant) — must never be counted/migrated.
  await prisma.branch.create({
    data: {
      id: NULL_PIN_BRANCH_ID,
      merchantId: MERCHANT_ID,
      name: `Branch ${NULL_PIN_BRANCH_ID}`,
      addressLine1: '2 Test Street',
      city: 'Testville',
      postcode: 'T2 2ST',
      redemptionPin: null,
    },
  })
}

/** Read current redemptionPin ciphertext for each tracked branch. */
async function currentPins(): Promise<Record<string, string | null>> {
  const rows = await prisma.branch.findMany({
    where: { id: { in: [...BRANCH_IDS, NULL_PIN_BRANCH_ID] } },
    select: { id: true, redemptionPin: true },
  })
  const out: Record<string, string | null> = {}
  for (const r of rows) out[r.id] = r.redemptionPin
  return out
}

// The migrate/verify helpers scope their reads to a caller-supplied id set so a
// shared loopback DB (other suites' rows) can't perturb the assertions. The
// production CLI uses no scope (whole table); these tests pass branchIds.
const scope = { branchIds: [...BRANCH_IDS, NULL_PIN_BRANCH_ID] }

beforeAll(async () => {
  // Hard guard against ever hitting a non-loopback DB even if the project guard
  // were bypassed: the integration project's setupFile already enforces this.
  const host = new URL(process.env.DATABASE_URL ?? '').hostname
  expect(['127.0.0.1', 'localhost', '::1', '[::1]']).toContain(host)
})

beforeEach(async () => {
  await seedFixtures()
})

afterAll(async () => {
  await deleteFixtures()
  await prisma.$disconnect()
})

describe('reencrypt-branch-pins — integration (loopback)', () => {
  // 1 ─────────────────────────────────────────────────────────────────────
  it('countAffected returns the number of non-null-pin branches (read-only)', async () => {
    const before = await currentPins()
    const n = await countAffected(prisma, scope)
    expect(n).toBe(BRANCH_IDS.length) // 3 (null-pin branch excluded)
    // read-only: nothing changed
    expect(await currentPins()).toEqual(before)
  })

  // 2 ─────────────────────────────────────────────────────────────────────
  it('dryRunDecrypt reports all OK under OLD, 0 under NEW, no plaintext leaked', async () => {
    const r = await dryRunDecrypt(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, ...scope })
    expect(r.okOld).toBe(3)
    expect(r.failOld).toBe(0)
    expect(r.alreadyNew).toBe(0)
    expect(r.toMigrate.sort()).toEqual([...BRANCH_IDS].sort())
    // No plaintext anywhere in the returned object.
    const json = JSON.stringify(r)
    for (const pin of Object.values(PINS)) expect(json).not.toContain(pin)
    // read-only
    const pins = await currentPins()
    for (const id of BRANCH_IDS) {
      expect(decryptWith(pins[id] as string, TEST_OLD_KEY)).toBe(PINS[id])
    }
  })

  // 3 ─────────────────────────────────────────────────────────────────────
  it('migrate re-encrypts atomically: every row decrypts under NEW, none under OLD', async () => {
    const res = await migrate(prisma, {
      oldKey: TEST_OLD_KEY,
      newKey: TEST_NEW_KEY,
      expectRows: 3,
      ...scope,
    })
    expect(res.migrated).toBe(3)
    const pins = await currentPins()
    for (const id of BRANCH_IDS) {
      const ct = pins[id] as string
      // decrypts under NEW to the SAME plaintext...
      expect(decryptWith(ct, TEST_NEW_KEY)).toBe(PINS[id])
      // ...and FAILS under OLD (GCM auth tag).
      expect(() => decryptWith(ct, TEST_OLD_KEY)).toThrow()
    }
    // null-pin branch untouched.
    expect(pins[NULL_PIN_BRANCH_ID]).toBeNull()
  })

  // 4 ─────────────────────────────────────────────────────────────────────
  it('verify passes after a good migration', async () => {
    await migrate(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, expectRows: 3, ...scope })
    const v = await verify(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, ...scope })
    expect(v.pass).toBe(true)
    expect(v.okNew).toBe(3)
    expect(v.stillOld).toBe(0)
  })

  // 5 ─────────────────────────────────────────────────────────────────────
  it('idempotent rerun: a second migrate is a no-op (already-NEW rows skipped)', async () => {
    await migrate(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, expectRows: 3, ...scope })
    const afterFirst = await currentPins()
    // Second pass: every row already decrypts under NEW → nothing to migrate.
    const res = await migrate(prisma, {
      oldKey: TEST_OLD_KEY,
      newKey: TEST_NEW_KEY,
      expectRows: 3,
      ...scope,
    })
    expect(res.migrated).toBe(0)
    expect(res.skippedAlreadyNew).toBe(3)
    // Ciphertext unchanged by the no-op pass.
    expect(await currentPins()).toEqual(afterFirst)
  })

  // 6 ─────────────────────────────────────────────────────────────────────
  it('rollback-on-error: a malformed-ciphertext row aborts migrate and changes NOTHING', async () => {
    // Inject a malformed (non-3-part) ciphertext into one branch.
    await prisma.branch.update({
      where: { id: BRANCH_IDS[1] },
      data: { redemptionPin: 'not-a-valid-encrypted-value' },
    })
    const before = await currentPins()
    await expect(
      migrate(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, expectRows: 3, ...scope }),
    ).rejects.toThrow()
    // The good rows must STILL hold their ORIGINAL old-key ciphertext (tx rolled back).
    const after = await currentPins()
    expect(after).toEqual(before)
    for (const id of [BRANCH_IDS[0], BRANCH_IDS[2]]) {
      expect(decryptWith(after[id] as string, TEST_OLD_KEY)).toBe(PINS[id])
    }
  })

  // 7 ─────────────────────────────────────────────────────────────────────
  it('host refusal: a mismatched expect-host aborts before any read/write', async () => {
    const before = await currentPins()
    expect(() => assertExpectHost(process.env.DATABASE_URL ?? '', 'some-neon-host.neon.tech')).toThrow()
    // Nothing changed (the guard throws before any DB access).
    expect(await currentPins()).toEqual(before)
  })

  it('host refusal: the loopback host PASSES assertExpectHost (127.0.0.1)', () => {
    expect(() => assertExpectHost(process.env.DATABASE_URL ?? '', '127.0.0.1')).not.toThrow()
  })

  // 8 ─────────────────────────────────────────────────────────────────────
  it('malformed-key refusal: a non-64-hex OLD or NEW aborts', () => {
    expect(() => parseAndValidateKeys('not-hex', TEST_NEW_KEY)).toThrow()
    expect(() => parseAndValidateKeys(TEST_OLD_KEY, 'too-short')).toThrow()
  })

  // 9 ─────────────────────────────────────────────────────────────────────
  it('placeholder-key refusal: the repo-public placeholder aborts', () => {
    expect(() => parseAndValidateKeys(PLACEHOLDER_KEY, TEST_NEW_KEY)).toThrow()
    expect(() => parseAndValidateKeys(TEST_OLD_KEY, PLACEHOLDER_KEY)).toThrow()
  })

  // 10 ────────────────────────────────────────────────────────────────────
  it('OLD === NEW refusal: aborts', () => {
    expect(() => parseAndValidateKeys(TEST_OLD_KEY, TEST_OLD_KEY)).toThrow()
  })

  // 11 ────────────────────────────────────────────────────────────────────
  it('expected-row mismatch: expectRows !== actual aborts before writing', async () => {
    const before = await currentPins()
    await expect(
      migrate(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, expectRows: 99, ...scope }),
    ).rejects.toThrow(/expect/i)
    expect(await currentPins()).toEqual(before)
  })

  // 12 ────────────────────────────────────────────────────────────────────
  it('over-500 refusal: count > boundMax aborts before writing', async () => {
    const before = await currentPins()
    // Drive the guard via a small boundMax so the 3 fixtures exceed it. This
    // exercises the SAME count>boundMax abort path as a >500 production table.
    await expect(
      migrate(prisma, {
        oldKey: TEST_OLD_KEY,
        newKey: TEST_NEW_KEY,
        expectRows: 3,
        boundMax: 2,
        ...scope,
      }),
    ).rejects.toThrow(/bound|max|500|2/i)
    expect(await currentPins()).toEqual(before)
  })

  // 13 ────────────────────────────────────────────────────────────────────
  it('zero secret/plaintext leakage across count/dry-run/migrate/verify console output', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await countAffected(prisma, scope)
      await dryRunDecrypt(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, ...scope })
      await migrate(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, expectRows: 3, ...scope })
      await verify(prisma, { oldKey: TEST_OLD_KEY, newKey: TEST_NEW_KEY, ...scope })

      const allOutput = [...logSpy.mock.calls, ...errSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
        .join('\n')

      // No plaintext PIN.
      for (const pin of Object.values(PINS)) {
        expect(allOutput).not.toContain(pin)
      }
      // No key material.
      expect(allOutput).not.toContain(TEST_OLD_KEY)
      expect(allOutput).not.toContain(TEST_NEW_KEY)
      // No full connection string.
      expect(allOutput).not.toContain('postgresql://')
      expect(allOutput).not.toContain(process.env.DATABASE_URL as string)
    } finally {
      logSpy.mockRestore()
      errSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })
})
