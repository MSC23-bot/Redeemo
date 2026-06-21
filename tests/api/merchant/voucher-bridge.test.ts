import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// ─────────────────────────────────────────────────────────────────────────────
// M2 flagship voucher bridge: submitRmvVoucherCore PROMOTES the merchant-authored
// fields out of the merchantFields bag into the top-level Voucher columns, and
// RE-LINKS the discount type/template when the merchant flipped fixed<->percent in
// the builder. The F5 builder PATCHes the whole body into merchantFields (via
// updateRmvVoucherCore, B5.1 unchanged) leaving the top-level columns at template
// defaults; customer + admin reads use the top-level columns, so without this
// promotion they surface the template default, not the merchant's offer.
//
// Stored bag shape after a builder save:
//   merchantFields = {
//     title, description, estimatedSaving, terms, imageUrl,     // top-level of bag
//     merchantFields: { builderType, discountKind, ...draft }   // nested one deeper
//   }
// The promoted FIELDS read from bag.title / bag.description / bag.estimatedSaving /
// bag.terms / bag.imageUrl. discountKind reads from bag.merchantFields.discountKind.
// ─────────────────────────────────────────────────────────────────────────────

describe('M2 flagship voucher bridge (submitRmvVoucherCore promotion + re-link)', () => {
  let app: FastifyInstance
  let merchantToken: string

  // Discount templates for one top-level category (cat1). Both kinds are seeded
  // per category, so a fixed<->percent flip always finds the sibling.
  const percentTemplate = {
    id: 'tmpl-pct', categoryId: 'cat1', voucherType: 'DISCOUNT_PERCENT',
    title: 'Percentage Discount', description: 'Save a percentage on your order.',
    allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'],
    minimumSaving: 5.0, isActive: true,
  }
  const fixedTemplate = {
    id: 'tmpl-fixed', categoryId: 'cat1', voucherType: 'DISCOUNT_FIXED',
    title: 'Fixed Discount', description: 'Save a fixed amount on your order.',
    allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'],
    minimumSaving: 5.0, isActive: true,
  }
  const bogoTemplate = {
    id: 'tmpl-bogo', categoryId: 'cat1', voucherType: 'BOGO',
    title: 'Buy One Get One Free', description: 'Get a second item free.',
    allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'],
    minimumSaving: 5.0, isActive: true,
  }

  // A DRAFT RMV at template defaults, whose merchantFields bag carries the
  // merchant-authored edits. Per-test overrides `type`, `rmvTemplateId`,
  // `merchantFields`, and `rmvTemplate`.
  function draftRmv(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rmv1', merchantId: 'm1', code: 'RMV-ABC12345', isRmv: true,
      rmvTemplateId: 'tmpl-pct', type: 'DISCOUNT_PERCENT',
      title: 'Percentage Discount', description: 'Save a percentage on your order.',
      estimatedSaving: 5.0, terms: null, imageUrl: null,
      status: 'DRAFT', approvalStatus: 'PENDING', isMandatory: true,
      merchantFields: null, rmvTemplate: percentTemplate, publishedAt: null,
      ...overrides,
    }
  }

  // The merchant-authored bag the F5 builder writes (no discount flip).
  const authoredBag = {
    title: 'Half Price Pizza Tuesdays',
    description: 'Enjoy 50% off all pizzas every Tuesday evening.',
    estimatedSaving: 12.5,
    terms: 'Dine-in only. Cannot be combined with other offers.',
    imageUrl: 'https://cdn.example/pizza.jpg',
    merchantFields: { builderType: 'discount', discountKind: 'percent', discPercent: 50 },
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      voucher: { findFirst: vi.fn(), update: vi.fn() },
      rmvTemplate: { findFirst: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    // The submit core wraps voucher.update + writeAuditLogTx in $transaction; the
    // mock runs the callback with the SAME mock as the tx client.
    prismaMock.$transaction = vi.fn().mockImplementation(async (fn: any) => fn(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  async function submit() {
    return app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/rmv1/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
  }

  // Read the `data` arg of the FIRST voucher.update call. `app.prisma` is typed as
  // the strict PrismaClient, so reach the vi mock through an `as any` cast (repo
  // convention for prisma-mock introspection).
  function firstUpdateData(): Record<string, unknown> {
    return (app.prisma.voucher.update as any).mock.calls[0][0].data
  }

  // ── Promotion ────────────────────────────────────────────────────────────

  it('promotes title/description/estimatedSaving/terms/imageUrl from the bag into the top-level update', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(draftRmv({ merchantFields: authoredBag }))
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Half Price Pizza Tuesdays',
          description: 'Enjoy 50% off all pizzas every Tuesday evening.',
          estimatedSaving: 12.5,
          terms: 'Dine-in only. Cannot be combined with other offers.',
          imageUrl: 'https://cdn.example/pizza.jpg',
          status: 'PENDING_APPROVAL',
        }),
      })
    )
  })

  it('keeps the existing imageUrl when the bag omits it (no photo set)', async () => {
    const bagNoImage = { ...authoredBag }
    delete (bagNoImage as Record<string, unknown>).imageUrl
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: bagNoImage, imageUrl: 'https://cdn.example/existing.jpg' })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    const data = firstUpdateData()
    // imageUrl absent from the bag -> the update must NOT write imageUrl (keeps the
    // existing column value).
    expect('imageUrl' in data).toBe(false)
    expect(data.title).toBe('Half Price Pizza Tuesdays')
  })

  it('keeps template defaults when the bag is empty (DRAFT never edited)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(draftRmv({ merchantFields: {} }))
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    const data = firstUpdateData()
    // No promotable keys present -> only the status/publishedAt write, no spurious
    // overwrite of the template defaults.
    expect('title' in data).toBe(false)
    expect('description' in data).toBe(false)
    expect('estimatedSaving' in data).toBe(false)
    expect('terms' in data).toBe(false)
    expect('imageUrl' in data).toBe(false)
    expect(data.status).toBe('PENDING_APPROVAL')
  })

  it('keeps template defaults when merchantFields is null', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(draftRmv({ merchantFields: null }))
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    const data = firstUpdateData()
    expect('title' in data).toBe(false)
    expect(data.status).toBe('PENDING_APPROVAL')
  })

  // ── Discount re-link ─────────────────────────────────────────────────────

  it('re-links DISCOUNT_PERCENT -> DISCOUNT_FIXED when the bag discountKind is "fixed"', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct', rmvTemplate: percentTemplate,
        merchantFields: {
          title: 'A Tenner Off', description: 'Get a fixed amount off.', estimatedSaving: 10,
          terms: 'T&Cs apply.',
          merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 10 },
        },
      })
    )
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(fixedTemplate)
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    // The sibling lookup uses the SAME top-level category as the current template.
    expect(app.prisma.rmvTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: 'cat1', voucherType: 'DISCOUNT_FIXED' }),
      })
    )
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DISCOUNT_FIXED', rmvTemplateId: 'tmpl-fixed' }),
      })
    )
  })

  it('re-links DISCOUNT_FIXED -> DISCOUNT_PERCENT when the bag discountKind is "percent"', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_FIXED', rmvTemplateId: 'tmpl-fixed', rmvTemplate: fixedTemplate,
        merchantFields: {
          title: 'Twenty Percent Off', description: 'Save a percentage.', estimatedSaving: 8,
          merchantFields: { builderType: 'discount', discountKind: 'percent', discPercent: 20 },
        },
      })
    )
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(percentTemplate)
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: 'cat1', voucherType: 'DISCOUNT_PERCENT' }),
      })
    )
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct' }),
      })
    )
  })

  it('does NOT change type when the discountKind already matches the current type', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct', rmvTemplate: percentTemplate,
        merchantFields: authoredBag, // discountKind: 'percent' == current type
      })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    const data = firstUpdateData()
    expect('type' in data).toBe(false)
    expect('rmvTemplateId' in data).toBe(false)
  })

  it('does NOT change type for a non-discount voucher (BOGO) regardless of the bag', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'BOGO', rmvTemplateId: 'tmpl-bogo', rmvTemplate: bogoTemplate,
        merchantFields: {
          title: 'BOGO Burgers', description: 'Buy one burger get one free.', estimatedSaving: 9,
          merchantFields: { builderType: 'bogo', discountKind: 'fixed' /* irrelevant on BOGO */ },
        },
      })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    const data = firstUpdateData()
    expect('type' in data).toBe(false)
    expect('rmvTemplateId' in data).toBe(false)
    // Promotion still happens on a non-discount voucher.
    expect(data.title).toBe('BOGO Burgers')
  })

  it('does NOT change type when the bag has no discountKind', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct', rmvTemplate: percentTemplate,
        merchantFields: { title: 'No Kind Here', estimatedSaving: 6, merchantFields: { builderType: 'discount' } },
      })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    const data = firstUpdateData()
    expect('type' in data).toBe(false)
  })

  it('defensively keeps the current type/template when the sibling discount template is missing', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct', rmvTemplate: percentTemplate,
        merchantFields: {
          title: 'Fixed But No Sibling', estimatedSaving: 7,
          merchantFields: { builderType: 'discount', discountKind: 'fixed' },
        },
      })
    )
    // Sibling lookup returns null (should not happen in seeded data, but defend).
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    // Submit must NOT fail.
    expect(res.statusCode).toBe(200)
    const data = firstUpdateData()
    expect('type' in data).toBe(false)
    expect('rmvTemplateId' in data).toBe(false)
    // Promotion still happens.
    expect(data.title).toBe('Fixed But No Sibling')
  })

  // ── Resubmit after NEEDS_CHANGES re-promotes the latest edits ─────────────

  it('re-promotes the latest bag values on a re-submit (NEEDS_CHANGES -> DRAFT -> submit again)', async () => {
    // First submit promotes the first bag.
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { ...authoredBag, title: 'First Title' } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))
    await submit()
    expect(firstUpdateData().title).toBe('First Title')

    // Admin sends back to DRAFT, merchant re-edits -> new bag. Second submit
    // promotes the LATEST bag values.
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { ...authoredBag, title: 'Second Title', estimatedSaving: 99 } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))
    await submit()
    const second = firstUpdateData()
    expect(second.title).toBe('Second Title')
    expect(second.estimatedSaving).toBe(99)
  })

  // ── Status guard still enforced before promotion ──────────────────────────

  it('rejects a non-DRAFT voucher with VOUCHER_NOT_SUBMITTABLE (no promotion attempted)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ status: 'PENDING_APPROVAL', merchantFields: authoredBag })
    )

    const res = await submit()
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_SUBMITTABLE')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  // ── Type-guarded promotion against a poisoned bag ──────────────────────────
  //
  // The RMV PATCH body is z.record(z.string(), z.unknown()) and B5.1 validates
  // allowed KEYS but NOT value TYPES, so an off-contract direct API caller can
  // store a malformed value in the bag. The bridge must never pass a wrong-typed
  // or out-of-range value through to Prisma.
  //
  // Strings: a non-string value is IGNORED (the column keeps its template
  // default), same philosophy as the existing presence check (a malformed value
  // is treated like an absent key).

  it.each([
    ['title', { title: 123 }],
    ['description', { description: 123 }],
    ['terms', { terms: { nested: true } }],
    ['imageUrl', { imageUrl: 42 }],
  ] as const)(
    'ignores a non-string %s in the bag (column keeps its default, no 500)',
    async (field, partial) => {
      app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
        draftRmv({ merchantFields: { ...partial } })
      )
      app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

      const res = await submit()
      expect(res.statusCode).toBe(200)
      const data = firstUpdateData()
      expect(field in data).toBe(false)
      expect(data.status).toBe('PENDING_APPROVAL')
    }
  )

  it('promotes a valid string sibling but ignores a non-string title (mixed bag)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { title: 123, description: 'Good desc' } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    const data = firstUpdateData()
    expect('title' in data).toBe(false)
    expect(data.description).toBe('Good desc')
  })

  it('rejects a non-number estimatedSaving with SAVING_INVALID (no update)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { estimatedSaving: 'abc' } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SAVING_INVALID')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it.each([
    ['negative', -5],
    ['zero', 0],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['object', {}],
    ['1e12 overflow', 1e12],
  ] as const)(
    'rejects an out-of-contract estimatedSaving (%s) with SAVING_INVALID (no update)',
    async (_label, value) => {
      app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
        // NaN / Infinity / object do not survive JSON, so they are constructed
        // directly in the mock bag here.
        draftRmv({ merchantFields: { estimatedSaving: value } })
      )
      app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

      const res = await submit()
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error.code).toBe('SAVING_INVALID')
      expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    }
  )

  it('promotes a valid numeric estimatedSaving (12.5)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { estimatedSaving: 12.5 } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(firstUpdateData().estimatedSaving).toBe(12.5)
  })

  it('is poison-safe when merchantFields is a non-object string (no re-link, valid fields still promote)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct', rmvTemplate: percentTemplate,
        merchantFields: {
          title: 'Still Promotes', description: 'Good copy', estimatedSaving: 7,
          merchantFields: 'garbage', // non-object: discountKind read is a safe no-op
        },
      })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    // No re-link attempted (discountKind unreadable from a string).
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    const data = firstUpdateData()
    expect('type' in data).toBe(false)
    expect('rmvTemplateId' in data).toBe(false)
    // Valid top-level fields still promote.
    expect(data.title).toBe('Still Promotes')
    expect(data.description).toBe('Good copy')
    expect(data.estimatedSaving).toBe(7)
  })
})
