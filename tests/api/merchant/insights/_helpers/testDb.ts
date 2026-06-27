// Insights PR-A integration-test harness (loopback-guarded, DRY).
//
// Every Insights `*.integration.test.ts` obtains its real PrismaClient through
// makeTestPrisma() and seeds fixtures through the seedScenario / seed* helpers
// here, then cleans up via cleanup() in afterAll. This keeps the real-DB tests:
//   - SAFE: makeTestPrisma() refuses any TEST_DATABASE_URL whose host is not a
//     loopback address (127.0.0.1 / localhost). A stray pointer at shared Neon
//     staging / Railway / production can NEVER be opened by the suite. The guard
//     is pure URL parsing, so it throws BEFORE any connection is attempted.
//   - ISOLATED: fixtures carry UNIQUE ids (timestamp + random suffix) so suites
//     never collide, and cleanup() deletes only the tracked ids in FK-safe order.
//   - HONEST: isTestData defaults FALSE on seeded redemption/branch/merchant rows
//     (the Insights eligible rule excludes isTestData=true), so aggregation tests
//     exercise the real eligible path. This is acceptable ONLY because the target
//     is the disposable local DB (redeemo_insights_test on 127.0.0.1:54329).
//
// NOTE: this is a TEST helper. It is intentionally NOT under src/. It imports the
// generated client + the pg driver adapter directly (Prisma 7 requires a driver
// adapter; there is no DATABASE_URL-from-schema path).

import { PrismaClient } from '../../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Loopback hostnames the harness will open. Anything else is refused.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * Parse TEST_DATABASE_URL and assert its host is a loopback address, THROWING
 * (before any client is constructed) otherwise. Returns the validated
 * connection string. Exported for direct testing of the boundary.
 */
export function assertLoopbackTestDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL is not set. Insights integration tests require an ' +
        'isolated local Postgres (loopback 127.0.0.1). Source the gitignored ' +
        '.env.test before running the integration project.',
    )
  }

  let host: string
  try {
    // The WHATWG URL parser does not accept the "postgresql://" scheme cleanly
    // for hostname extraction in every runtime; normalise the scheme to http so
    // we get a reliable .hostname, then validate that host. We only read the
    // host - the original raw string is what we hand to the driver.
    const normalised = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, 'http://')
    host = new URL(normalised).hostname
  } catch {
    throw new Error(
      `TEST_DATABASE_URL is malformed and its host cannot be verified as ` +
        `loopback; refusing to connect. Value host could not be parsed.`,
    )
  }

  if (!host || !LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `TEST_DATABASE_URL host "${host}" is not a loopback address. Insights ` +
        `integration tests MUST run against the isolated local Postgres ` +
        `(127.0.0.1 / localhost) only, never shared Neon / Railway / production. ` +
        `Refusing to connect.`,
    )
  }

  return raw
}

/**
 * Construct a PrismaClient bound to the loopback-validated TEST_DATABASE_URL.
 * Throws (no client constructed, no socket opened) when the URL is unset or its
 * host is not a loopback address. This is THE safety boundary - every Insights
 * integration test must obtain its client here.
 */
export function makeTestPrisma(): PrismaClient {
  const connectionString = assertLoopbackTestDatabaseUrl()
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

// --- Fixture id helpers -----------------------------------------------------

let counter = 0
/** A collision-resistant unique suffix (timestamp + per-process counter + random). */
function uniq(): string {
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// --- Tracked-id ledger ------------------------------------------------------

/**
 * The set of fixture ids a suite created, so cleanup() can delete exactly those
 * rows in FK-safe order. Pass the same ledger to every seed* call + cleanup().
 */
export type FixtureIds = {
  redemptions: string[]
  vouchers: string[]
  branches: string[]
  memberships: string[]
  merchants: string[]
  merchantAdmins: string[]
  users: string[]
}

/** A fresh, empty ledger. */
export function newFixtureIds(): FixtureIds {
  return {
    redemptions: [],
    vouchers: [],
    branches: [],
    memberships: [],
    merchants: [],
    merchantAdmins: [],
    users: [],
  }
}

// --- Seed helpers -----------------------------------------------------------

type MerchantStatus =
  | 'REGISTERED'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'DELETED'

type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'DELETED'

type VoucherType =
  | 'BOGO'
  | 'SPEND_AND_SAVE'
  | 'DISCOUNT_FIXED'
  | 'DISCOUNT_PERCENT'
  | 'FREEBIE'
  | 'PACKAGE_DEAL'
  | 'TIME_LIMITED'
  | 'REUSABLE'

type ValidationMethod = 'PIN' | 'QR_SCAN' | 'MANUAL'

/**
 * Seed a Merchant. Defaults: ACTIVE + isTestData=false (a real, eligible
 * merchant). Tracks the id in `ids`. Returns the merchant id.
 */
export async function seedMerchant(
  prisma: PrismaClient,
  ids: FixtureIds,
  overrides: { status?: MerchantStatus; isTestData?: boolean; businessName?: string } = {},
): Promise<string> {
  const m = await prisma.merchant.create({
    data: {
      businessName: overrides.businessName ?? `INSIGHTS-TEST merchant ${uniq()}`,
      status: overrides.status ?? 'ACTIVE',
      isTestData: overrides.isTestData ?? false,
    },
    select: { id: true },
  })
  ids.merchants.push(m.id)
  return m.id
}

/**
 * Seed a Branch under a merchant. Defaults: LIVE + isActive + isTestData=false.
 * Tracks the id in `ids`. Returns the branch id.
 */
export async function seedBranch(
  prisma: PrismaClient,
  ids: FixtureIds,
  merchantId: string,
  overrides: {
    name?: string
    isTestData?: boolean
    isMainBranch?: boolean
    isActive?: boolean
    city?: string
    postcode?: string
  } = {},
): Promise<string> {
  const b = await prisma.branch.create({
    data: {
      merchantId,
      name: overrides.name ?? `INSIGHTS-TEST branch ${uniq()}`,
      isMainBranch: overrides.isMainBranch ?? false,
      addressLine1: '1 Test Street',
      city: overrides.city ?? 'London',
      postcode: overrides.postcode ?? 'EC1A 1AA',
      isActive: overrides.isActive ?? true,
      isTestData: overrides.isTestData ?? false,
    },
    select: { id: true },
  })
  ids.branches.push(b.id)
  return b.id
}

/**
 * Seed a User. Defaults: ACTIVE + a unique non-QA email + isTestData? (User has
 * no isTestData column - it is excluded via status<>'DELETED' and the QA-email
 * filter instead). Tracks the id in `ids`. Returns the user id.
 */
export async function seedUser(
  prisma: PrismaClient,
  ids: FixtureIds,
  overrides: { status?: UserStatus; email?: string } = {},
): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: overrides.email ?? `insights-test-${uniq()}@example.com`,
      status: overrides.status ?? 'ACTIVE',
    },
    select: { id: true },
  })
  ids.users.push(u.id)
  return u.id
}

/**
 * Seed a Voucher under a merchant. Defaults: DISCOUNT_FIXED, isTestData=false.
 * `code` is unique. Tracks the id in `ids`. Returns the voucher id.
 */
export async function seedVoucher(
  prisma: PrismaClient,
  ids: FixtureIds,
  merchantId: string,
  overrides: {
    type?: VoucherType
    title?: string
    estimatedSaving?: number
    isTestData?: boolean
    code?: string
  } = {},
): Promise<string> {
  const v = await prisma.voucher.create({
    data: {
      merchantId,
      code: overrides.code ?? `INS-${uniq()}`,
      type: overrides.type ?? 'DISCOUNT_FIXED',
      title: overrides.title ?? 'INSIGHTS-TEST voucher',
      estimatedSaving: overrides.estimatedSaving ?? 5,
      isTestData: overrides.isTestData ?? false,
    },
    select: { id: true },
  })
  ids.vouchers.push(v.id)
  return v.id
}

/**
 * Seed a VoucherRedemption. Defaults: NOT validated (awaiting), isTestData=false,
 * redeemedAt=now, estimatedSaving=5. Set isValidated:true (+ optional validatedAt /
 * validationMethod) for a confirmed row. `redemptionCode` is unique. Tracks the id
 * in `ids`. Returns the redemption id.
 */
export async function seedRedemption(
  prisma: PrismaClient,
  ids: FixtureIds,
  args: {
    userId: string
    voucherId: string
    branchId: string
    redeemedAt?: Date
    isValidated?: boolean
    validatedAt?: Date | null
    validationMethod?: ValidationMethod | null
    estimatedSaving?: number
    isTestData?: boolean
    redemptionCode?: string
  },
): Promise<string> {
  const r = await prisma.voucherRedemption.create({
    data: {
      userId: args.userId,
      voucherId: args.voucherId,
      branchId: args.branchId,
      redemptionCode: args.redemptionCode ?? `RC-${uniq()}`.toUpperCase().slice(0, 24),
      redeemedAt: args.redeemedAt ?? new Date(),
      isValidated: args.isValidated ?? false,
      validatedAt: args.validatedAt ?? null,
      validationMethod: args.validationMethod ?? null,
      estimatedSaving: args.estimatedSaving ?? 5,
      isTestData: args.isTestData ?? false,
    },
    select: { id: true },
  })
  ids.redemptions.push(r.id)
  return r.id
}

/**
 * Seed a MerchantMembership (OWNER by default) for a merchant. Needs a
 * MerchantAdmin row, which it creates (tracked so cleanup can remove it). Returns
 * { membershipId, merchantAdminId }. Only needed by suites that exercise the
 * membership-resolved scope path; aggregation tests usually do not need it.
 */
export async function seedOwnerMembership(
  prisma: PrismaClient,
  ids: FixtureIds,
  merchantId: string,
  overrides: { allBranches?: boolean; status?: UserStatus } = {},
): Promise<{ membershipId: string; merchantAdminId: string }> {
  const admin = await prisma.merchantAdmin.create({
    data: {
      email: `insights-test-admin-${uniq()}@example.com`,
      passwordHash: 'x',
      firstName: 'Test',
      lastName: 'Owner',
    },
    select: { id: true },
  })
  ids.merchantAdmins.push(admin.id)
  const mm = await prisma.merchantMembership.create({
    data: {
      merchantId,
      merchantAdminId: admin.id,
      role: 'OWNER',
      allBranches: overrides.allBranches ?? true,
      status: overrides.status ?? 'ACTIVE',
    },
    select: { id: true },
  })
  ids.memberships.push(mm.id)
  return { membershipId: mm.id, merchantAdminId: admin.id }
}

/**
 * Convenience: seed one ACTIVE merchant + one LIVE branch + one ACTIVE user +
 * one DISCOUNT_FIXED voucher (all real, isTestData=false). Returns the ids so a
 * suite can then seed redemptions against them. Tracks every id in `ids`.
 */
export async function seedScenario(
  prisma: PrismaClient,
  ids: FixtureIds,
  overrides: {
    merchant?: Parameters<typeof seedMerchant>[2]
    branch?: Parameters<typeof seedBranch>[3]
    user?: Parameters<typeof seedUser>[2]
    voucher?: Parameters<typeof seedVoucher>[3]
  } = {},
): Promise<{ merchantId: string; branchId: string; userId: string; voucherId: string }> {
  const merchantId = await seedMerchant(prisma, ids, overrides.merchant)
  const branchId = await seedBranch(prisma, ids, merchantId, overrides.branch)
  const userId = await seedUser(prisma, ids, overrides.user)
  const voucherId = await seedVoucher(prisma, ids, merchantId, overrides.voucher)
  return { merchantId, branchId, userId, voucherId }
}

// --- Cleanup ----------------------------------------------------------------

/**
 * Delete every tracked fixture id in FK-safe order:
 *   redemptions -> vouchers -> branches -> memberships -> merchantAdmins ->
 *   merchants -> users
 * Limited strictly to the ids the ledger tracked (never a blanket deleteMany).
 * Idempotent: empty arrays are no-ops. Call from afterAll. Does NOT $disconnect
 * (the suite owns the client lifecycle).
 */
export async function cleanup(prisma: PrismaClient, ids: FixtureIds): Promise<void> {
  if (ids.redemptions.length)
    await prisma.voucherRedemption.deleteMany({ where: { id: { in: ids.redemptions } } })
  if (ids.vouchers.length)
    await prisma.voucher.deleteMany({ where: { id: { in: ids.vouchers } } })
  if (ids.branches.length)
    await prisma.branch.deleteMany({ where: { id: { in: ids.branches } } })
  if (ids.memberships.length)
    await prisma.merchantMembership.deleteMany({ where: { id: { in: ids.memberships } } })
  if (ids.merchantAdmins.length)
    await prisma.merchantAdmin.deleteMany({ where: { id: { in: ids.merchantAdmins } } })
  if (ids.merchants.length)
    await prisma.merchant.deleteMany({ where: { id: { in: ids.merchants } } })
  if (ids.users.length)
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } })
}
