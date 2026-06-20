import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

/**
 * M2 B2: merchant onboarding taxonomy READ + merchant identity WRITE.
 *
 * Taxonomy READ (`GET /api/v1/merchant/onboarding/taxonomy`): active top-level
 * categories with an RMV-eligible flag (active rmvTemplates >= 2, mirroring the
 * admin `listAdminCategories`) + their FULL subcategory list (NOT supply-filtered,
 * the opposite of the customer `listActiveCategories`) + per-subcategory
 * cuisine/specialty tags from SubcategoryTag (with isPrimaryEligible).
 *
 * Identity WRITE (`POST /api/v1/merchant/onboarding/identity`): sets
 * primaryCategoryId = the chosen SUBCATEGORY id + primaryDescriptorTagId (cuisine)
 * + MerchantTag rows (specialties) + a MerchantCategory(isPrimary) row.
 * Transactional + audited (actor MERCHANT_ADMIN). Validates the subcategory + tags
 * exist and the tags are eligible for the subcategory (via SubcategoryTag).
 */
describe('merchant onboarding taxonomy + identity routes (M2 B2)', () => {
  let app: FastifyInstance
  let merchantToken: string

  // Top-level categories. cat-food eligible (2 active templates); cat-pets
  // ineligible (1 active template) so the eligibility flag is exercised both ways.
  const topLevelRows = [
    { id: 'cat-food', name: 'Food & Drink', parentId: null, sortOrder: 0, _count: { rmvTemplates: 2 } },
    { id: 'cat-pets', name: 'Pet Services', parentId: null, sortOrder: 1, _count: { rmvTemplates: 1 } },
  ]

  // Subcategories (children). 'sub-newbie' has ZERO active merchants; it MUST
  // still appear (non-supply-filtered), unlike the customer endpoint which would
  // hide it.
  const subcategoryRows = [
    {
      id: 'sub-restaurant', name: 'Restaurant', parentId: 'cat-food', sortOrder: 0,
      tagLinks: [
        { isPrimaryEligible: true, tag: { id: 'tag-italian', label: 'Italian', type: 'CUISINE' } },
        { isPrimaryEligible: false, tag: { id: 'tag-pizza', label: 'Pizza', type: 'SPECIALTY' } },
        { isPrimaryEligible: false, tag: { id: 'tag-veg', label: 'Vegetarian', type: 'SPECIALTY' } },
      ],
    },
    {
      id: 'sub-newbie', name: 'Newly Listed Niche', parentId: 'cat-food', sortOrder: 1,
      tagLinks: [],
    },
    {
      id: 'sub-groomer', name: 'Dog Groomer', parentId: 'cat-pets', sortOrder: 0,
      tagLinks: [
        { isPrimaryEligible: false, tag: { id: 'tag-grooming', label: 'Grooming', type: 'SPECIALTY' } },
      ],
    },
  ]

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      category: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          // Top-level query (parentId: null) vs subcategory query (parentId not null).
          if (where?.parentId === null) return topLevelRows
          return subcategoryRows
        }),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      subcategoryTag: { findMany: vi.fn() },
      tag: { findMany: vi.fn() },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      merchantCategory: { updateMany: vi.fn().mockResolvedValue({}), upsert: vi.fn().mockResolvedValue({}) },
      merchantTag: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
      voucher: { findMany: vi.fn(), count: vi.fn() },
      rmvTemplate: { findMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // ── Taxonomy READ ───────────────────────────────────────────────────────────

  it('GET /onboarding/taxonomy returns 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/onboarding/taxonomy' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /onboarding/taxonomy returns active top-level categories with an RMV-eligible flag', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/onboarding/taxonomy',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.categories)).toBe(true)
    expect(body.categories).toHaveLength(2)

    const food = body.categories.find((c: any) => c.id === 'cat-food')
    const pets = body.categories.find((c: any) => c.id === 'cat-pets')
    expect(food.name).toBe('Food & Drink')
    // eligible = active rmvTemplates >= 2 (mirrors listAdminCategories)
    expect(food.eligible).toBe(true)
    expect(pets.eligible).toBe(false)
  })

  it('GET /onboarding/taxonomy includes the FULL subcategory list (non-supply-filtered)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/onboarding/taxonomy',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const food = body.categories.find((c: any) => c.id === 'cat-food')
    const subIds = food.subcategories.map((s: any) => s.id)
    // 'sub-newbie' has ZERO active merchants; it MUST still surface (the opposite
    // of the customer listActiveCategories, which supply-filters subcategories).
    expect(subIds).toContain('sub-restaurant')
    expect(subIds).toContain('sub-newbie')

    // The subcategory query must NOT carry a `merchants: { some: ... }` supply
    // filter. Inspect the call args passed to category.findMany for the subcat read.
    const subCall = (app.prisma.category.findMany as any).mock.calls.find(
      (c: any[]) => c[0]?.where?.parentId && c[0].where.parentId.not !== undefined
    )
    expect(subCall).toBeDefined()
    expect(subCall[0].where.merchants).toBeUndefined()
  })

  it('GET /onboarding/taxonomy returns per-subcategory cuisine/specialty tags with isPrimaryEligible', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/onboarding/taxonomy',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)

    const food = body.categories.find((c: any) => c.id === 'cat-food')
    const restaurant = food.subcategories.find((s: any) => s.id === 'sub-restaurant')
    expect(restaurant.tags).toHaveLength(3)

    const italian = restaurant.tags.find((t: any) => t.id === 'tag-italian')
    expect(italian).toMatchObject({ id: 'tag-italian', label: 'Italian', type: 'CUISINE', isPrimaryEligible: true })

    const pizza = restaurant.tags.find((t: any) => t.id === 'tag-pizza')
    expect(pizza).toMatchObject({ id: 'tag-pizza', label: 'Pizza', type: 'SPECIALTY', isPrimaryEligible: false })

    // A subcategory with no tag links exposes an empty list, not undefined.
    const newbie = food.subcategories.find((s: any) => s.id === 'sub-newbie')
    expect(newbie.tags).toEqual([])
  })

  // ── Identity WRITE ────────────────────────────────────────────────────────────

  it('POST /onboarding/identity sets the subcategory primaryCategoryId + descriptor + tags + MerchantCategory + audits', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null, status: 'REGISTERED', onboardingStep: null })
    // The chosen subcategory exists + is a real subcategory (parentId set).
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ id: 'sub-restaurant', parentId: 'cat-food', isActive: true })
    // The submitted tags are all eligible for sub-restaurant (SubcategoryTag links).
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([
      { tagId: 'tag-italian', isPrimaryEligible: true, tag: { id: 'tag-italian', type: 'CUISINE' } },
      { tagId: 'tag-pizza', isPrimaryEligible: false, tag: { id: 'tag-pizza', type: 'SPECIALTY' } },
      { tagId: 'tag-veg', isPrimaryEligible: false, tag: { id: 'tag-veg', type: 'SPECIALTY' } },
    ])
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'sub-restaurant', primaryDescriptorTagId: 'tag-italian' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        subcategoryId: 'sub-restaurant',
        primaryDescriptorTagId: 'tag-italian',
        specialtyTagIds: ['tag-pizza', 'tag-veg'],
      },
    })

    expect(res.statusCode).toBe(200)
    // primaryCategoryId is the SUBCATEGORY id (not the top-level parent).
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({
          primaryCategoryId: 'sub-restaurant',
          primaryDescriptorTagId: 'tag-italian',
        }),
      })
    )
    // MerchantCategory(isPrimary) maintained: demote others, then upsert primary.
    expect(app.prisma.merchantCategory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { merchantId: 'm1' }, data: { isPrimary: false } })
    )
    expect(app.prisma.merchantCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ merchantId: 'm1', categoryId: 'sub-restaurant', isPrimary: true }),
      })
    )
    // Specialty tags written as MerchantTag rows.
    expect(app.prisma.merchantTag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ merchantId: 'm1', tagId: 'tag-pizza' }),
          expect.objectContaining({ merchantId: 'm1', tagId: 'tag-veg' }),
        ]),
      })
    )
    // Transactional + MERCHANT_ADMIN-attributed audit.
    expect(app.prisma.$transaction).toHaveBeenCalled()
    expect(app.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorType: 'MERCHANT_ADMIN',
          actorId: 'ma1',
          entityType: 'merchant',
          entityId: 'm1',
        }),
      })
    )
  })

  it('POST /onboarding/identity allows a null descriptor (no cuisine) and no specialties', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null, status: 'REGISTERED', onboardingStep: null })
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ id: 'sub-groomer', parentId: 'cat-pets', isActive: true })
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([])
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'sub-groomer', primaryDescriptorTagId: null })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-groomer' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ primaryCategoryId: 'sub-groomer', primaryDescriptorTagId: null }),
      })
    )
  })

  it('POST /onboarding/identity rejects a non-existent subcategory (CATEGORY_NOT_FOUND)', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null, status: 'REGISTERED', onboardingStep: null })
    app.prisma.category.findUnique = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'nope' },
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('POST /onboarding/identity rejects a top-level category id (NOT_A_SUBCATEGORY)', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null, status: 'REGISTERED', onboardingStep: null })
    // A top-level category has parentId === null; not selectable as the identity.
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ id: 'cat-food', parentId: null, isActive: true })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'cat-food' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('NOT_A_SUBCATEGORY')
  })

  it('POST /onboarding/identity rejects a tag not eligible for the chosen subcategory (TAG_NOT_ELIGIBLE)', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null, status: 'REGISTERED', onboardingStep: null })
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ id: 'sub-restaurant', parentId: 'cat-food', isActive: true })
    // Only tag-italian + tag-pizza are linked to sub-restaurant ('tag-foreign' is not).
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([
      { tagId: 'tag-italian', isPrimaryEligible: true, tag: { id: 'tag-italian', type: 'CUISINE' } },
      { tagId: 'tag-pizza', isPrimaryEligible: false, tag: { id: 'tag-pizza', type: 'SPECIALTY' } },
    ])

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        subcategoryId: 'sub-restaurant',
        primaryDescriptorTagId: 'tag-italian',
        specialtyTagIds: ['tag-foreign'],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('TAG_NOT_ELIGIBLE')
  })

  it('POST /onboarding/identity rejects a descriptor tag not eligible as primary for the subcategory (TAG_NOT_ELIGIBLE)', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null, status: 'REGISTERED', onboardingStep: null })
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ id: 'sub-restaurant', parentId: 'cat-food', isActive: true })
    // tag-pizza is linked but isPrimaryEligible:false; it cannot be the descriptor.
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([
      { tagId: 'tag-pizza', isPrimaryEligible: false, tag: { id: 'tag-pizza', type: 'SPECIALTY' } },
    ])

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-restaurant', primaryDescriptorTagId: 'tag-pizza' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('TAG_NOT_ELIGIBLE')
  })
})

/**
 * M2 B2 (review fix): the identity write is an ONBOARDING-only action (spec D5).
 * It is gated to the draft window (status REGISTERED, or onboardingStep
 * NEEDS_CHANGES) so it can never flip Merchant.primaryCategoryId AFTER submission
 * and decouple the customer-facing descriptor + MerchantCategory(isPrimary) from
 * already-submitted/active RMVs (the CATEGORY_CHANGE_BLOCKED rule, spec section
 * 4.2). Within the draft window, if the chosen subcategory's top-level parent
 * differs from the merchant's current top-level parent, existing DRAFT RMVs are
 * discarded (set INACTIVE) in the SAME transaction so the descriptor + RMVs stay
 * coherent (mirrors handleCategoryChange's DRAFT-discard; no re-provisioning here,
 * that is B3).
 */
describe('merchant identity write: draft-window gate + DRAFT-RMV discard (M2 B2 review fix)', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    const prismaMock: any = {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: { findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1' }) },
      category: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      subcategoryTag: { findMany: vi.fn().mockResolvedValue([]) },
      tag: { findMany: vi.fn() },
      merchant: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({ id: 'm1' }) },
      merchantCategory: { updateMany: vi.fn().mockResolvedValue({}), upsert: vi.fn().mockResolvedValue({}) },
      merchantTag: { deleteMany: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
      voucher: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      rmvTemplate: { findMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    prismaMock.$transaction = vi.fn().mockImplementation(async (cb: any) => cb(prismaMock))
    app.decorate('prisma', prismaMock as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), exists: vi.fn().mockResolvedValue(1) } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // (a) Non-draft merchant: REFUSED with IDENTITY_EDIT_REQUIRES_DRAFT.

  it('REFUSES the identity write on an ACTIVE merchant (IDENTITY_EDIT_REQUIRES_DRAFT)', async () => {
    // ACTIVE merchant, onboardingStep beyond NEEDS_CHANGES: NOT in the draft window.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1', primaryCategoryId: 'sub-restaurant', primaryDescriptorTagId: null,
      status: 'ACTIVE', onboardingStep: 'LIVE',
    })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-other' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('IDENTITY_EDIT_REQUIRES_DRAFT')
    // The gate is the FIRST thing: no validation/lookup/write should have run.
    expect(app.prisma.category.findUnique).not.toHaveBeenCalled()
    expect(app.prisma.merchant.update).not.toHaveBeenCalled()
    expect(app.prisma.voucher.updateMany).not.toHaveBeenCalled()
  })

  it('REFUSES the identity write on a PENDING_APPROVAL/SUBMITTED merchant (IDENTITY_EDIT_REQUIRES_DRAFT)', async () => {
    // Submitted but not yet asked for changes: SUBMITTED/UNDER_REVIEW are NOT in the
    // draft window, so the post-submission category flip is blocked.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1', primaryCategoryId: 'sub-restaurant', primaryDescriptorTagId: null,
      status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED',
    })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-other' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('IDENTITY_EDIT_REQUIRES_DRAFT')
  })

  // (b) Draft window + top-level CHANGE: discard existing DRAFT RMVs (INACTIVE) in tx.

  it('in the draft window, changing the top-level category discards DRAFT RMVs (INACTIVE) in the same transaction', async () => {
    // REGISTERED (draft window). Current category sub-restaurant -> top-level cat-food;
    // new category sub-groomer -> top-level cat-pets. Top-level CHANGES.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1', primaryCategoryId: 'sub-restaurant', primaryDescriptorTagId: null,
      status: 'REGISTERED', onboardingStep: null,
    })
    // category.findUnique resolves the subcategory existence check AND both parent-walks.
    app.prisma.category.findUnique = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.id === 'sub-groomer') return { id: 'sub-groomer', parentId: 'cat-pets', isActive: true }
      if (where.id === 'sub-restaurant') return { id: 'sub-restaurant', parentId: 'cat-food', isActive: true }
      return null
    })
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-groomer' },
    })

    expect(res.statusCode).toBe(200)
    // DRAFT RMVs discarded (set INACTIVE), scoped to this merchant's RMV drafts.
    expect(app.prisma.voucher.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ merchantId: 'm1', isRmv: true, status: 'DRAFT' }),
        data: { status: 'INACTIVE' },
      })
    )
    // Identity still written + transactional.
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ primaryCategoryId: 'sub-groomer' }) })
    )
    expect(app.prisma.$transaction).toHaveBeenCalled()
    // No re-provisioning here (that is B3): no RMV vouchers created.
    expect(app.prisma.rmvTemplate.findMany).not.toHaveBeenCalled()
  })

  // (c) Draft window + SAME top-level: RMVs untouched.

  it('in the draft window, a same-top-level subcategory change leaves DRAFT RMVs untouched', async () => {
    // Current sub-restaurant -> cat-food; new sub-cafe -> cat-food. Same top-level.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1', primaryCategoryId: 'sub-restaurant', primaryDescriptorTagId: null,
      status: 'REGISTERED', onboardingStep: null,
    })
    app.prisma.category.findUnique = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.id === 'sub-cafe') return { id: 'sub-cafe', parentId: 'cat-food', isActive: true }
      if (where.id === 'sub-restaurant') return { id: 'sub-restaurant', parentId: 'cat-food', isActive: true }
      return null
    })
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-cafe' },
    })

    expect(res.statusCode).toBe(200)
    // Same top-level: RMVs are NOT discarded.
    expect(app.prisma.voucher.updateMany).not.toHaveBeenCalled()
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ primaryCategoryId: 'sub-cafe' }) })
    )
  })

  it('in the draft window, a first-time identity set (no current category) leaves DRAFT RMVs untouched', async () => {
    // primaryCategoryId null: first-time set, no top-level to compare, nothing to discard.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1', primaryCategoryId: null, primaryDescriptorTagId: null,
      status: 'REGISTERED', onboardingStep: null,
    })
    app.prisma.category.findUnique = vi.fn().mockResolvedValue({ id: 'sub-restaurant', parentId: 'cat-food', isActive: true })
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-restaurant' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.updateMany).not.toHaveBeenCalled()
  })

  it('allows the identity write when onboardingStep is NEEDS_CHANGES (draft window via admin change-request)', async () => {
    // status PENDING_APPROVAL but onboardingStep NEEDS_CHANGES: still the draft window.
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1', primaryCategoryId: 'sub-restaurant', primaryDescriptorTagId: null,
      status: 'PENDING_APPROVAL', onboardingStep: 'NEEDS_CHANGES',
    })
    app.prisma.category.findUnique = vi.fn().mockImplementation(async ({ where }: any) => {
      if (where.id === 'sub-cafe') return { id: 'sub-cafe', parentId: 'cat-food', isActive: true }
      if (where.id === 'sub-restaurant') return { id: 'sub-restaurant', parentId: 'cat-food', isActive: true }
      return null
    })
    app.prisma.subcategoryTag.findMany = vi.fn().mockResolvedValue([])

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/onboarding/identity',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { subcategoryId: 'sub-cafe' },
    })

    expect(res.statusCode).toBe(200)
  })
})
