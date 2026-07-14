import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'
import {
  provisionRmvVouchers,
  handleCategoryChange,
  updateRmvVoucherCore,
} from '../../../src/api/merchant/voucher/service'
import { setMerchantCategoryCore } from '../../../src/api/merchant/profile/service'
import { requestVoucherChanges } from '../../../src/api/admin/approvals/voucherApprover'
import {
  SUBMIT_CONTRACT_KEY as RUNTIME_KEY,
  STRICT_SUBMIT_CONTRACT as RUNTIME_VALUE,
} from '../../../src/api/merchant/voucher/submitValidation'
import {
  SUBMIT_CONTRACT_KEY,
  STRICT_SUBMIT_CONTRACT,
  withStrictContract,
  COMPLETE_MECHANICS,
} from '../../fixtures/voucher-submit-validity-cases'

// ─────────────────────────────────────────────────────────────────────────────
// S6: server-owned strict submission contract (owner-approved 2026-07-14).
//
// A backend-owned, versioned marker (`__submitContract: 'strict-v1'`) stamped into
// Voucher.merchantFields at every voucher-birth path. A merchant/admin API caller can
// never SET, OVERWRITE, BLANK or REMOVE it, and its PRESENCE drives the submit gate to
// enforce the per-type mechanic matrix (derived from the AUTHORITATIVE Voucher.type), so a
// strict row with an empty / opaque bag FAILS CLOSED (VOUCHER_INCOMPLETE) instead of
// slipping through on the universal invariants (the S5-bypass fix). Its ABSENCE keeps a
// genuine markerless legacy row submittable, unchanged.
//
// This suite proves: (1) fixture/runtime constant parity; (2) every creation/provisioning
// path stamps the marker; (3) the custom + flagship create-then-submit bypass now fails
// closed; (4) STRICT_CONTRACT_CASES (indicator-present); (5) tamper (PATCH set/blank/
// overwrite) cannot re-exempt and the server value persists; (6) updates / resubmit /
// admin co-build preserve it; (7) a genuine markerless legacy row still submits.
// ─────────────────────────────────────────────────────────────────────────────

const CTX = { ipAddress: '127.0.0.1', userAgent: 'test' }

// ── route harness (mirrors the merged voucher suites) ─────────────────────────

function makeRoutePrisma() {
  const prismaMock: any = {
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
      findMany: vi.fn().mockResolvedValue([
        { id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] },
      ]),
    },
    merchant: { findUnique: vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'sub-food' }) },
    category: { findUnique: vi.fn().mockResolvedValue({ parentId: 'cat-food' }) },
    voucher: {
      findFirst: vi.fn(),
      create: vi.fn().mockImplementation(async (a: any) => ({ id: 'v-new', ...a.data })),
      update: vi.fn().mockImplementation(async (a: any) => ({ id: a.where.id, ...a.data })),
      count: vi.fn().mockResolvedValue(0),
    },
    rmvTemplate: { findFirst: vi.fn() },
    adminApproval: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'appr1' }),
      update: vi.fn().mockResolvedValue({ id: 'appr1' }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
  return prismaMock
}

describe('S6 server-owned strict submission contract', () => {
  let app: FastifyInstance
  let token: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', makeRoutePrisma() as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    token = (app.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
  })
  afterEach(async () => { await app.close() })

  const hdr = () => ({ authorization: `Bearer ${token}` })
  const createCustom = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers', headers: hdr(), payload })
  const createFlagship = (voucherType: string) =>
    app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/rmv/create-flagship', headers: hdr(), payload: { voucherType } })
  const patchCustom = (payload: Record<string, unknown>) =>
    app.inject({ method: 'PATCH', url: '/api/v1/merchant/vouchers/v1', headers: hdr(), payload })
  const submitCustom = () =>
    app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/v1/submit', headers: hdr() })
  const submitFlagship = () =>
    app.inject({ method: 'POST', url: '/api/v1/merchant/vouchers/rmv/rmv1/submit', headers: hdr() })
  const createArg = () => (app.prisma.voucher.create as any).mock.calls[0][0].data
  const updateArg = () => (app.prisma.voucher.update as any).mock.calls[0][0].data

  const customDraft = (bag: unknown, over: Record<string, unknown> = {}) => ({
    id: 'v1', merchantId: 'm1', code: 'RCV-ABC12345', isRmv: false, isMandatory: false,
    rmvTemplateId: null, type: 'BOGO', title: 'A voucher title', estimatedSaving: 5,
    status: 'DRAFT', approvalStatus: 'PENDING', merchantFields: bag,
    availabilityWindows: [], cooldownSeconds: null, publishedAt: null, ...over,
  })
  const flagshipDraft = (bag: unknown, over: Record<string, unknown> = {}) => ({
    id: 'rmv1', merchantId: 'm1', code: 'RMV-ABC12345', isRmv: true, isMandatory: true,
    rmvTemplateId: 'tmpl1', type: 'BOGO', title: 'A voucher title', estimatedSaving: 5,
    status: 'DRAFT', approvalStatus: 'PENDING', merchantFields: bag,
    rmvTemplate: { id: 'tmpl1', categoryId: 'cat1', voucherType: 'BOGO', allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'] },
    ...over,
  })

  // ── (1) parity ──────────────────────────────────────────────────────────────

  it('the shared fixture marker constants mirror the runtime source of truth', () => {
    expect(SUBMIT_CONTRACT_KEY).toBe(RUNTIME_KEY)
    expect(STRICT_SUBMIT_CONTRACT).toBe(RUNTIME_VALUE)
  })

  // ── (2) creation / provisioning paths stamp the marker ────────────────────────

  it('createVoucher (custom) stamps the strict marker on the stored bag', async () => {
    const res = await createCustom({ type: 'BOGO', title: 'BOGO', estimatedSaving: 5, merchantFields: { askHelp: false, builderType: 'bogo' } })
    expect(res.statusCode).toBe(201)
    expect((createArg().merchantFields as any)[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
  })

  it('createVoucher stamps the marker even when the caller omits merchantFields entirely', async () => {
    const res = await createCustom({ type: 'BOGO', title: 'BOGO', estimatedSaving: 5 })
    expect(res.statusCode).toBe(201)
    expect((createArg().merchantFields as any)[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
  })

  it('createFlagshipRmvVoucher stamps the marker (template-default draft is born strict)', async () => {
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue({
      id: 'tmpl-bogo', categoryId: 'cat-food', voucherType: 'BOGO', title: 'BOGO', description: 'd', minimumSaving: 15, isActive: true,
    })
    const res = await createFlagship('BOGO')
    expect(res.statusCode).toBe(201)
    expect(createArg().merchantFields).toEqual({ [SUBMIT_CONTRACT_KEY]: STRICT_SUBMIT_CONTRACT })
  })

  it('provisionRmvVouchers stamps the marker on every provisioned flagship', async () => {
    const prisma: any = {
      rmvTemplate: { findMany: vi.fn().mockResolvedValue([
        { id: 't1', voucherType: 'BOGO', title: 'a', description: 'b', minimumSaving: 5 },
        { id: 't2', voucherType: 'DISCOUNT_PERCENT', title: 'c', description: 'd', minimumSaving: 5 },
      ]) },
      voucher: { create: vi.fn().mockImplementation(async (a: any) => ({ id: 'x', ...a.data })) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    await provisionRmvVouchers(prisma, 'm1', 'cat1', CTX)
    expect(prisma.voucher.create).toHaveBeenCalledTimes(2)
    for (const call of prisma.voucher.create.mock.calls) {
      expect((call[0].data.merchantFields as any)[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
    }
  })

  it('handleCategoryChange re-provisions strict-stamped flagships on a confirmed category change', async () => {
    const prisma: any = {
      voucher: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockImplementation(async (a: any) => ({ id: 'x', ...a.data })),
      },
      merchant: { findUnique: vi.fn().mockResolvedValue({ primaryCategoryId: 'old' }), update: vi.fn().mockResolvedValue({}) },
      rmvTemplate: { findMany: vi.fn().mockResolvedValue([
        { id: 't1', voucherType: 'BOGO', title: 'a', description: 'b', minimumSaving: 5 },
        { id: 't2', voucherType: 'DISCOUNT_PERCENT', title: 'c', description: 'd', minimumSaving: 5 },
      ]) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prisma.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prisma))
    const res = await handleCategoryChange(prisma, { merchantId: 'm1', actor: { type: 'MERCHANT_ADMIN', id: 'ma1' } }, 'newcat', true, CTX)
    expect(res).toEqual({ changed: true })
    expect(prisma.voucher.create).toHaveBeenCalledTimes(2)
    for (const call of prisma.voucher.create.mock.calls) {
      expect((call[0].data.merchantFields as any)[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
    }
  })

  it('setMerchantCategoryCore first-set provisioning stamps the marker', async () => {
    const prisma: any = {
      merchant: { findUnique: vi.fn().mockResolvedValue({ primaryCategoryId: null }), update: vi.fn().mockResolvedValue({}) },
      rmvTemplate: { findMany: vi.fn().mockResolvedValue([
        { id: 't1', voucherType: 'BOGO', title: 'a', description: 'b', minimumSaving: 5 },
        { id: 't2', voucherType: 'DISCOUNT_PERCENT', title: 'c', description: 'd', minimumSaving: 5 },
      ]) },
      voucher: { create: vi.fn().mockImplementation(async (a: any) => ({ id: 'x', ...a.data })) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prisma.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prisma))
    const res = await setMerchantCategoryCore(prisma, { merchantId: 'm1', actor: { type: 'MERCHANT_ADMIN', id: 'ma1' } }, 'newcat', false, CTX)
    expect(res).toEqual({ provisioned: true })
    expect(prisma.voucher.create).toHaveBeenCalledTimes(2)
    for (const call of prisma.voucher.create.mock.calls) {
      expect((call[0].data.merchantFields as any)[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
    }
  })

  // ── (3) create-then-submit bypass now fails closed (E2E chain) ────────────────

  it('CUSTOM create-then-submit bypass fails closed: the stamped {} bag cannot submit, zero writes', async () => {
    // Create captures the exact bag the server stamped (withStrictContract({}))...
    const created = await createCustom({ type: 'BOGO', title: 'Bypass', estimatedSaving: 5, merchantFields: {} })
    expect(created.statusCode).toBe(201)
    const stampedBag = createArg().merchantFields
    expect(stampedBag).toEqual({ [SUBMIT_CONTRACT_KEY]: STRICT_SUBMIT_CONTRACT })

    // ...then submitting THAT row (empty structured bag) fails closed on the type mechanic.
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(customDraft(stampedBag))
    app.prisma.voucher.update = vi.fn()
    const res = await submitCustom()
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('VOUCHER_INCOMPLETE')
    expect(body.error.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'bogoBuy', code: 'REQUIRED' })]))
    // Fail closed BEFORE any status / voucher / audit write.
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.adminApproval.create).not.toHaveBeenCalled()
    expect(app.prisma.adminApproval.update).not.toHaveBeenCalled()
  })

  it('FLAGSHIP create-then-submit bypass fails closed: the strict template-default draft cannot submit, zero writes', async () => {
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue({
      id: 'tmpl-bogo', categoryId: 'cat-food', voucherType: 'BOGO', title: 'BOGO', description: 'd', minimumSaving: 15, isActive: true,
    })
    const created = await createFlagship('BOGO')
    expect(created.statusCode).toBe(201)
    const stampedBag = createArg().merchantFields
    expect(stampedBag).toEqual({ [SUBMIT_CONTRACT_KEY]: STRICT_SUBMIT_CONTRACT })

    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(flagshipDraft(stampedBag))
    app.prisma.voucher.update = vi.fn()
    const res = await submitFlagship()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_INCOMPLETE')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  // (4) STRICT_CONTRACT_CASES (indicator-present) are driven fixture-first across BOTH
  // submit lanes in the canonical suite tests/api/merchant/voucher-submit-validity.test.ts.

  // ── (5) tamper cannot re-exempt; the server value persists ─────────────────────

  const storedStrictBuilderBag = withStrictContract({ askHelp: false, builderType: 'bogo', draftFields: { type: 'bogo', ...COMPLETE_MECHANICS.BOGO } })

  it.each([
    { name: 'set to a fake downgrade value', value: 'legacy-exempt' },
    { name: 'blank (empty string)', value: '' },
    { name: 'overwrite with a different strict-looking token', value: 'strict-v0' },
    { name: 'null out the marker', value: null },
  ])('CUSTOM PATCH cannot $name the marker (server value persists, tamper dropped)', async ({ value }) => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(customDraft(storedStrictBuilderBag))
    const res = await patchCustom({ merchantFields: { [SUBMIT_CONTRACT_KEY]: value, askHelp: true } })
    expect(res.statusCode).toBe(200)
    const written = updateArg().merchantFields as Record<string, unknown>
    // Server value survives; the caller's tamper value never lands.
    expect(written[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
    // The merchant's own (allowed) field still applied.
    expect(written.askHelp).toBe(true)
  })

  it('RMV PATCH (merchant or admin co-build core) drops a caller __submitContract and preserves the stored marker', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(flagshipDraft(withStrictContract({ askHelp: false })))
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv1', headers: hdr(),
      payload: { title: 'Edited title', [SUBMIT_CONTRACT_KEY]: 'legacy-exempt' },
    })
    expect(res.statusCode).toBe(200)
    const written = updateArg().merchantFields as Record<string, unknown>
    expect(written[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
    expect(written.title).toBe('Edited title')
  })

  it('the admin edit-on-behalf core (updateRmvVoucherCore, actor ADMIN) also preserves the marker', async () => {
    const prisma: any = {
      voucher: {
        findFirst: vi.fn().mockResolvedValue(flagshipDraft(withStrictContract({ askHelp: false }))),
        update: vi.fn().mockImplementation(async (a: any) => ({ id: a.where.id, ...a.data })),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prisma.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prisma))
    await updateRmvVoucherCore(
      prisma,
      { merchantId: 'm1', actor: { type: 'ADMIN', id: 'admin1', reason: 'co-build' } },
      'rmv1',
      { title: 'Admin edit', [SUBMIT_CONTRACT_KEY]: 'evil' },
      CTX,
    )
    const written = prisma.voucher.update.mock.calls[0][0].data.merchantFields
    expect(written[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
    expect(written.title).toBe('Admin edit')
  })

  // ── (6) preservation across the remaining write paths ─────────────────────────

  it('a benign CUSTOM edit preserves the marker (merge never drops it)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(customDraft(withStrictContract({ askHelp: false, builderType: 'bogo' })))
    const res = await patchCustom({ title: 'A new title', merchantFields: { askHelp: true } })
    expect(res.statusCode).toBe(200)
    expect((updateArg().merchantFields as any)[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT)
  })

  it('submit (resubmit) clears the concierge keys but PRESERVES the strict marker', async () => {
    // A complete strict custom voucher whose stored bag also carries a prior concierge round.
    const bag = withStrictContract({
      askHelp: false, builderType: 'bogo', draftFields: { type: 'bogo', ...COMPLETE_MECHANICS.BOGO },
      adminProposed: { title: 'Better' }, adminNote: 'please tweak',
    })
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(customDraft(bag, { approvalStatus: 'CHANGES_REQUESTED' }))
    app.prisma.adminApproval.findFirst = vi.fn().mockResolvedValue({ id: 'appr-existing', status: 'CHANGES_REQUESTED' })
    const res = await submitCustom()
    expect(res.statusCode).toBe(200)
    const written = updateArg().merchantFields as Record<string, unknown>
    expect(written[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT) // survives the resubmit clear
    expect(written.adminProposed).toBeUndefined()                     // concierge cleared
    expect(written.adminNote).toBeUndefined()
  })

  it('the admin concierge request-changes preserves the marker while writing adminProposed/adminNote', async () => {
    const prisma: any = {
      adminApproval: {
        findUnique: vi.fn().mockResolvedValue({ id: 'appr1', type: 'VOUCHER', status: 'PENDING', referenceId: 'v1' }),
        update: vi.fn().mockResolvedValue({}),
      },
      voucher: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'v1', merchantId: 'm1', title: 't', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING',
          merchantFields: withStrictContract({ askHelp: false, builderType: 'bogo', adminProposed: { title: 'stale' } }),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue(null) }, // getMerchantOwner -> null -> no notify
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prisma.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prisma))
    const redis: any = {}
    await requestVoucherChanges(prisma, redis, 'appr1', 'admin1', { proposed: { title: 'New' }, note: 'fix the title' }, CTX)
    const written = prisma.voucher.update.mock.calls[0][0].data.merchantFields
    expect(written[SUBMIT_CONTRACT_KEY]).toBe(STRICT_SUBMIT_CONTRACT) // marker survives the concierge REPLACE
    expect(written.adminProposed).toEqual({ title: 'New' })            // fresh proposal replaces stale
    expect(written.adminNote).toBe('fix the title')
  })

  // ── (7) genuine markerless legacy row still submits ───────────────────────────

  it('a genuine INDICATOR-ABSENT (markerless) empty-bag row still submits (legacy compatibility)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(customDraft({})) // NO marker
    const res = await submitCustom()
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) }),
    )
  })

  it('a genuine markerless null-bag row still submits (legacy compatibility)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(customDraft(null))
    const res = await submitCustom()
    expect(res.statusCode).toBe(200)
  })
})
