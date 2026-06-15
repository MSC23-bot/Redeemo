import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { listAdminCategories } from '../../../src/api/admin/merchants/service'

// Option B B2.3-read: real-DB proof that listAdminCategories derives `eligible`
// from the count of ACTIVE RMV templates (>= 2). Seeds a category with 2 active
// templates (eligible), one with 1 active + 1 inactive (ineligible), and one
// with none (ineligible).

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const PREFIX = `b23-cats-it-${Date.now()}`
let eligibleId = ''
let ineligibleId = ''
let noneId = ''

let templateSeq = 0
async function addTemplate(categoryId: string, isActive: boolean) {
  // RmvTemplate has a unique (categoryId, title), so each title must be distinct.
  await prisma.rmvTemplate.create({
    data: {
      categoryId,
      voucherType: 'DISCOUNT_FIXED',
      title: `T-${templateSeq++}`,
      description: 'D',
      allowedFields: [],
      minimumSaving: 5,
      isActive,
    },
  })
}

beforeAll(async () => {
  const eligible = await prisma.category.create({ data: { name: `${PREFIX} Eligible`, isActive: true } })
  const ineligible = await prisma.category.create({ data: { name: `${PREFIX} Ineligible`, isActive: true } })
  const none = await prisma.category.create({ data: { name: `${PREFIX} None`, isActive: true } })
  eligibleId = eligible.id
  ineligibleId = ineligible.id
  noneId = none.id

  await addTemplate(eligibleId, true)
  await addTemplate(eligibleId, true) // 2 active -> eligible
  await addTemplate(ineligibleId, true)
  await addTemplate(ineligibleId, false) // 1 active + 1 inactive -> NOT eligible
  // none: 0 templates
})

afterAll(async () => {
  const ids = (
    await prisma.category.findMany({ where: { name: { startsWith: PREFIX } }, select: { id: true } })
  ).map((c) => c.id)
  if (ids.length) {
    await prisma.rmvTemplate.deleteMany({ where: { categoryId: { in: ids } } })
    await prisma.category.deleteMany({ where: { id: { in: ids } } })
  }
  await prisma.$disconnect()
}, 60000)

describe('listAdminCategories (real DB)', () => {
  it('marks a category eligible only with >= 2 ACTIVE RMV templates', async () => {
    const { categories } = await listAdminCategories(prisma)
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]))
    expect(byId[eligibleId]?.eligible).toBe(true)
    expect(byId[ineligibleId]?.eligible).toBe(false)
    expect(byId[noneId]?.eligible).toBe(false)
    // Shape: id / name / parentId / eligible only (no _count leak).
    expect(Object.keys(byId[eligibleId]).sort()).toEqual(['eligible', 'id', 'name', 'parentId'])
  })
})
