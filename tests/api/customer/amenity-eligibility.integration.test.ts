import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { getEligibleAmenitiesForSubcategory } from '../../../src/api/lib/amenity'

// Plan 1.5 Task 22 — exercises the eligible-amenity resolver end-to-end
// against the real Plan 1.5 Neon DB. Mirrors the production lookup path
// (subcategory rules ∪ parent top-level rules, filtered to Amenity.isActive=true,
// deduped, sorted by name). Catches schema/seed drift the unit tests' Prisma
// mocks would miss.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

afterAll(async () => {
  await prisma.$disconnect()
})

// Resolve seeded category IDs once for the whole file.
let restaurantSubcatId: string
let vetSubcatId:        string

beforeAll(async () => {
  const restaurant = await prisma.category.findFirst({
    where:  { name: 'Restaurant', parentId: { not: null } },
    select: { id: true },
  })
  if (!restaurant) throw new Error('Restaurant subcategory not seeded')
  restaurantSubcatId = restaurant.id

  const vet = await prisma.category.findFirst({
    where:  { name: 'Vet', parentId: { not: null } },
    select: { id: true },
  })
  if (!vet) throw new Error('Vet subcategory not seeded')
  vetSubcatId = vet.id
})

describe('getEligibleAmenitiesForSubcategory — Restaurant (Food & Drink)', () => {
  it('inherits the Food & Drink top-level amenities', async () => {
    const amenities = await getEligibleAmenitiesForSubcategory(prisma, restaurantSubcatId)
    const names = amenities.map((a) => a.name)
    // Food & Drink top-level rules per seed-data/categoryAmenities.ts:
    // Wi-Fi, Wheelchair Access, Online Booking, Outdoor Seating, Group Bookings
    expect(names).toContain('Wi-Fi')
    expect(names).toContain('Wheelchair Access')
    expect(names).toContain('Online Booking')
    expect(names).toContain('Outdoor Seating')
    expect(names).toContain('Group Bookings')
  })

  it('excludes amenities scoped to other categories', async () => {
    const amenities = await getEligibleAmenitiesForSubcategory(prisma, restaurantSubcatId)
    const names = amenities.map((a) => a.name)
    // Hotel-only (subcategory of Travel & Hotels)
    expect(names).not.toContain('Room Service')
    // Health & Fitness top-level
    expect(names).not.toContain('Showers')
    // Pet Services top-level
    expect(names).not.toContain('Boarding Available')
  })

  it('excludes Late-Night Service (which is direct-attached only to Bar / Pub & Gastropub, not the Food & Drink top-level)', async () => {
    const amenities = await getEligibleAmenitiesForSubcategory(prisma, restaurantSubcatId)
    const names = amenities.map((a) => a.name)
    expect(names).not.toContain('Late-Night Service')
  })

  it('returns amenities sorted by name (locale-aware compare)', async () => {
    const amenities = await getEligibleAmenitiesForSubcategory(prisma, restaurantSubcatId)
    const sorted = [...amenities.map((a) => a.name)].sort((a, b) => a.localeCompare(b))
    expect(amenities.map((a) => a.name)).toEqual(sorted)
  })
})

describe('getEligibleAmenitiesForSubcategory — Vet (Pet Services)', () => {
  it('inherits the Pet Services top-level amenities', async () => {
    const amenities = await getEligibleAmenitiesForSubcategory(prisma, vetSubcatId)
    const names = amenities.map((a) => a.name)
    // Pet Services top-level rules per seed: Wheelchair Access, Online Booking,
    // Pickup & Drop-off, Boarding Available.
    expect(names).toContain('Wheelchair Access')
    expect(names).toContain('Online Booking')
    expect(names).toContain('Pickup & Drop-off')
    expect(names).toContain('Boarding Available')
  })

  it('excludes amenities scoped to other top-levels', async () => {
    const amenities = await getEligibleAmenitiesForSubcategory(prisma, vetSubcatId)
    const names = amenities.map((a) => a.name)
    expect(names).not.toContain('Wi-Fi')           // Food & Drink, Beauty, Out, Travel
    expect(names).not.toContain('Outdoor Seating') // Food & Drink only
    expect(names).not.toContain('Room Service')    // Hotel only
  })
})

describe('getEligibleAmenitiesForSubcategory — Amenity.isActive filter', () => {
  // Round-trips Wi-Fi.isActive between true → false → true and asserts the
  // helper excludes the amenity while it is inactive. Wrapped in try/finally
  // so the restore happens even if assertions throw — keeps the seed clean.

  it('excludes an amenity when its isActive flag is false, includes it again on restore', async () => {
    const wifi = await prisma.amenity.findFirst({
      where:  { name: 'Wi-Fi' },
      select: { id: true, isActive: true },
    })
    if (!wifi) throw new Error('Wi-Fi amenity not seeded')
    if (!wifi.isActive) {
      throw new Error('Pre-condition: Wi-Fi must be isActive=true at start of test')
    }

    // Sanity: helper includes Wi-Fi for Restaurant in its baseline state.
    const baseline = await getEligibleAmenitiesForSubcategory(prisma, restaurantSubcatId)
    expect(baseline.map((a) => a.name)).toContain('Wi-Fi')

    try {
      await prisma.amenity.update({
        where: { id: wifi.id },
        data:  { isActive: false },
      })

      const inactivePass = await getEligibleAmenitiesForSubcategory(prisma, restaurantSubcatId)
      expect(inactivePass.map((a) => a.name)).not.toContain('Wi-Fi')
    } finally {
      // Always restore — assertion failures upstream must not leave Wi-Fi
      // disabled in the shared dev DB.
      await prisma.amenity.update({
        where: { id: wifi.id },
        data:  { isActive: true },
      })
    }

    // Confirm the restore landed and the helper picks it back up.
    const restoredWifi = await prisma.amenity.findUnique({
      where:  { id: wifi.id },
      select: { isActive: true },
    })
    expect(restoredWifi?.isActive).toBe(true)

    const afterRestore = await getEligibleAmenitiesForSubcategory(prisma, restaurantSubcatId)
    expect(afterRestore.map((a) => a.name)).toContain('Wi-Fi')
  })
})
