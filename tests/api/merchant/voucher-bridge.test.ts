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
  // S5: the nested structured bag is matrix-complete (DISCOUNT_PERCENT needs a
  // percentage + a pricing basis) so the submit fail-closed gate passes; the bridge
  // promotion/re-link assertions read the bag TOP-LEVEL copy fields, untouched here.
  const authoredBag = {
    title: 'Half Price Pizza Tuesdays',
    description: 'Enjoy 50% off all pizzas every Tuesday evening.',
    estimatedSaving: 12.5,
    terms: 'Dine-in only. Cannot be combined with other offers.',
    imageUrl: 'https://cdn.example/pizza.jpg',
    merchantFields: { builderType: 'discount', discountKind: 'percent', discPercent: 50, discMin: 25 },
  }

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }),
        // Staff & Access PR-B: voucher service resolves via resolveMerchantContext (OWNER row -> voucher power by role).
        findMany: vi.fn().mockResolvedValue([{ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role: 'OWNER', allBranches: true, canManageVouchers: false, merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [] }]),
      },
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

  // Round-2 sweep closure (flip-at-submit): a copy field the DESTINATION template forbids
  // must NOT be promoted onto the column, even though the SOURCE template allowed it. This
  // guards a legacy draft (bag written before draft-time relinking) submitted with an
  // imageUrl the fixed template does not permit. The flip still relinks; imageUrl is dropped.
  it('does NOT promote a copy field forbidden by the destination template on a flip-at-submit', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct',
        // Source (percent) template allows imageUrl.
        rmvTemplate: { ...percentTemplate, allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'] },
        imageUrl: 'https://cdn.example/existing.jpg',
        merchantFields: {
          title: 'A Tenner Off', estimatedSaving: 10, imageUrl: 'https://cdn.example/new.jpg',
          merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 10 },
        },
      })
    )
    // Destination (fixed) sibling FORBIDS imageUrl.
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue({
      ...fixedTemplate, allowedFields: ['title', 'description', 'estimatedSaving', 'terms'],
    })
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    const data = firstUpdateData()
    // Relinked to the destination, title promoted (allowed), imageUrl DROPPED (forbidden).
    expect(data.type).toBe('DISCOUNT_FIXED')
    expect(data.rmvTemplateId).toBe('tmpl-fixed')
    expect(data.title).toBe('A Tenner Off')
    expect('imageUrl' in data).toBe(false)
  })

  it('re-links DISCOUNT_FIXED -> DISCOUNT_PERCENT when the bag discountKind is "percent"', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_FIXED', rmvTemplateId: 'tmpl-fixed', rmvTemplate: fixedTemplate,
        merchantFields: {
          title: 'Twenty Percent Off', description: 'Save a percentage.', estimatedSaving: 8,
          merchantFields: { builderType: 'discount', discountKind: 'percent', discPercent: 20, discMin: 40 },
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
          merchantFields: { builderType: 'bogo', discountKind: 'fixed' /* irrelevant on BOGO */, bogoBuy: 'A burger', bogoFree: 'A burger', bogoFreePrice: 9 },
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
        merchantFields: { title: 'No Kind Here', estimatedSaving: 6, merchantFields: { builderType: 'discount', discPercent: 20, discMin: 30 } },
      })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    const data = firstUpdateData()
    expect('type' in data).toBe(false)
  })

  // S5 item 1 (fail-closed sibling relink): when the bag's discountKind requires the
  // OTHER discount template but the ACTIVE sibling cannot be resolved, the submit is
  // REJECTED with the typed 422 RMV_TEMPLATE_UNAVAILABLE and NOTHING is written (no
  // voucher update, so no status transition and no promotion; no audit). The previous
  // behaviour (silently keeping the old type while submitting the new mechanic's
  // fields) put a dishonest offer in front of admin review.
  it('fails closed (422 RMV_TEMPLATE_UNAVAILABLE, zero writes) when the sibling discount template is missing', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct', rmvTemplate: percentTemplate,
        merchantFields: {
          title: 'Fixed But No Sibling', estimatedSaving: 7,
          merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 7 },
        },
      })
    )
    // Sibling lookup returns null (row missing or inactive).
    app.prisma.rmvTemplate.findFirst = vi.fn().mockResolvedValue(null)
    app.prisma.voucher.update = vi.fn()

    const res = await submit()
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.body).error.code).toBe('RMV_TEMPLATE_UNAVAILABLE')
    // Zero writes.
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.auditLog.create).not.toHaveBeenCalled()
  })

  // Same class: the voucher's OWN template link is unreadable (relation null) while a
  // flip is implied: also fail closed, never a silent keep and never a 5xx.
  it('fails closed (422) when a flip is implied but the voucher has no readable template link', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({
        type: 'DISCOUNT_PERCENT', rmvTemplateId: 'tmpl-pct', rmvTemplate: null,
        merchantFields: {
          title: 'Fixed But No Template Link', estimatedSaving: 7,
          merchantFields: { builderType: 'discount', discountKind: 'fixed', discAmount: 7 },
        },
      })
    )
    app.prisma.voucher.update = vi.fn()

    const res = await submit()
    expect(res.statusCode).toBe(422)
    expect(JSON.parse(res.body).error.code).toBe('RMV_TEMPLATE_UNAVAILABLE')
    // No sibling lookup is even attempted (categoryId unreadable) and nothing is written.
    expect(app.prisma.rmvTemplate.findFirst).not.toHaveBeenCalled()
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
    expect(app.prisma.auditLog.create).not.toHaveBeenCalled()
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

  // ── Decimal(10,2) scale-2 rounding boundary (column-overflow guard) ─────────
  //
  // Postgres rounds a numeric(10,2) input half-away-from-zero to scale 2 BEFORE
  // the precision check. A raw value in [99999999.995, 100000000) is strictly
  // below RMV_SAVING_COLUMN_MAX (1e8) so the naive `>= max` guard passes it, but
  // Postgres rounds it up to 100000000.00 (9 integer digits) which overflows the
  // numeric(10,2) column (precision 10, scale 2) and raises a Prisma 500. The
  // bridge rounds to scale 2 in JS to MATCH what Postgres stores, bound-checks the
  // ROUNDED value, and promotes the rounded value so Postgres receives an
  // already-scale-2 number it cannot re-round into an overflow.

  it('promotes the exact column max that fits (99999999.99)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { estimatedSaving: 99999999.99 } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(firstUpdateData().estimatedSaving).toBe(99999999.99)
  })

  it('rejects a value that rounds UP to the column overflow (99999999.995) with SAVING_INVALID (no update)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { estimatedSaving: 99999999.995 } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SAVING_INVALID')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('rejects 99999999.996 (also rounds up to 1e8) with SAVING_INVALID (no update)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { estimatedSaving: 99999999.996 } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SAVING_INVALID')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('rejects the exact RMV_SAVING_COLUMN_MAX (100000000) with SAVING_INVALID (no update)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { estimatedSaving: 100000000 } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SAVING_INVALID')
    expect(app.prisma.voucher.update).not.toHaveBeenCalled()
  })

  it('promotes a value that rounds DOWN to a fitting scale-2 number (99999999.994 -> 99999999.99)', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue(
      draftRmv({ merchantFields: { estimatedSaving: 99999999.994 } })
    )
    app.prisma.voucher.update = vi.fn().mockResolvedValue(draftRmv({ status: 'PENDING_APPROVAL' }))

    const res = await submit()
    expect(res.statusCode).toBe(200)
    expect(firstUpdateData().estimatedSaving).toBe(99999999.99)
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
