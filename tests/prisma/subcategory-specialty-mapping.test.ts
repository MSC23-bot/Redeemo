import { describe, it, expect } from 'vitest'
import { SPECIALTY_BY_SUBCATEGORY } from '../../prisma/seed-data/subcategoryTags'
import { SPECIALTY_TAGS } from '../../prisma/seed-data/tags'
import { SUBCATEGORIES } from '../../prisma/seed-data/categories'

// Phase 1 specialty re-curation (2026-06-25). Pinned invariants for the
// SPECIALTY_BY_SUBCATEGORY map that replaced the old broad top-category
// fan-out. No DB — pure data validation, runs in the CI unit project.
// See docs/superpowers/plans/2026-06-25-merchant-onboarding-specialty-recuration.md.

const SPECIALTY_LABELS = new Set(SPECIALTY_TAGS.map((t) => t.label))
const SUBCATS_BY_PARENT = new Map<string, Set<string>>()
for (const s of SUBCATEGORIES) {
  if (!SUBCATS_BY_PARENT.has(s.parent)) SUBCATS_BY_PARENT.set(s.parent, new Set())
  SUBCATS_BY_PARENT.get(s.parent)!.add(s.name)
}

/** All specialty labels mapped to a given parent→subcategory, or [] if unmapped. */
function specialtiesFor(parent: string, subcategory: string): string[] {
  return SPECIALTY_BY_SUBCATEGORY[parent]?.[subcategory] ?? []
}

describe('SPECIALTY_BY_SUBCATEGORY — integrity', () => {
  it('every mapped specialty label is a real existing SPECIALTY tag (Phase 1: no new tags)', () => {
    const orphans: string[] = []
    for (const [parent, bySub] of Object.entries(SPECIALTY_BY_SUBCATEGORY)) {
      for (const [sub, labels] of Object.entries(bySub)) {
        for (const label of labels) {
          if (!SPECIALTY_LABELS.has(label)) orphans.push(`${parent} / ${sub} : ${label}`)
        }
      }
    }
    expect(orphans).toEqual([])
  })

  it('every mapped parent is a real top-level category and every mapped subcategory exists under it', () => {
    const bad: string[] = []
    for (const [parent, bySub] of Object.entries(SPECIALTY_BY_SUBCATEGORY)) {
      const subs = SUBCATS_BY_PARENT.get(parent)
      if (!subs) {
        bad.push(`unknown parent: ${parent}`)
        continue
      }
      for (const sub of Object.keys(bySub)) {
        if (!subs.has(sub)) bad.push(`${parent} / ${sub} (subcategory not under this parent)`)
      }
    }
    expect(bad).toEqual([])
  })

  it('sibling subcategories under a parent are differentiated (the old identical-set bug is gone)', () => {
    // The old bug attached the SAME full specialty pool to every subcategory of a
    // top-level, so siblings showed identical "known for" lists. Assert that any
    // parent with 2+ mapped subcategories has at least two DISTINCT specialty sets.
    // (A single broadly-relevant label like 'Independent' may still span all subs —
    // that is a valid curation choice, not the structural fan-out.)
    for (const [parent, bySub] of Object.entries(SPECIALTY_BY_SUBCATEGORY)) {
      const sets = Object.values(bySub).map((labels) => [...labels].sort().join('|'))
      if (sets.length > 1) {
        const distinct = new Set(sets)
        expect(distinct.size, `all mapped subs of ${parent} share an identical specialty set`).toBeGreaterThan(1)
      }
    }
  })
})

describe('SPECIALTY_BY_SUBCATEGORY — owner-reported cases', () => {
  it('Restaurant shows Pizza; Dessert Shop does NOT show Pizza but shows Gelato', () => {
    const restaurant = specialtiesFor('Food & Drink', 'Restaurant')
    const dessert = specialtiesFor('Food & Drink', 'Dessert Shop')
    expect(restaurant).toContain('Pizza')
    expect(dessert).not.toContain('Pizza')
    expect(dessert).toContain('Gelato')
    // The two sub-categories carry genuinely different worlds.
    expect(restaurant).not.toEqual(dessert)
  })

  it('Bakery and Cafe & Coffee do not inherit Restaurant-only specialties (no fan-out within Food & Drink)', () => {
    expect(specialtiesFor('Food & Drink', 'Bakery')).not.toContain('Pizza')
    expect(specialtiesFor('Food & Drink', 'Cafe & Coffee')).not.toContain('Steakhouse')
  })

  it('Dental Clinic shows Cosmetic Dentistry; Hearing Centre shows NO specialties (UI hides the step)', () => {
    expect(specialtiesFor('Health & Medical', 'Dental Clinic')).toContain('Cosmetic Dentistry')
    expect(specialtiesFor('Health & Medical', 'Hearing Centre')).toEqual([])
  })

  it('Aesthetics Clinic keeps separate worlds per parent (Beauty has Botox; Medical is a Phase-2 gap)', () => {
    expect(specialtiesFor('Beauty & Wellness', 'Aesthetics Clinic')).toContain('Botox')
    expect(specialtiesFor('Health & Medical', 'Aesthetics Clinic')).toEqual([])
  })
})
