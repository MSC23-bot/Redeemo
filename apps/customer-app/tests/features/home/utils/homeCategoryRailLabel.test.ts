import { homeCategoryRailLabel } from '@/features/home/utils/homeCategoryRailLabel'

// v1.6 (PR #126 device-QA-4 2026-05-23) — Home NearbyByCategory rail header
// label.  Sentence-cases the parent category name, suffixes with " picks",
// and applies identically to local + cascade rails (no cascade-specific
// variant any more — the banner does that work).

describe('homeCategoryRailLabel (v1.6)', () => {
  it('sentence-cases multi-word parent names + appends " picks"', () => {
    expect(homeCategoryRailLabel('Food & Drink')).toBe('Food & drink picks')
    expect(homeCategoryRailLabel('Beauty & Wellness')).toBe('Beauty & wellness picks')
    expect(homeCategoryRailLabel('Health & Fitness')).toBe('Health & fitness picks')
    expect(homeCategoryRailLabel('Out & About')).toBe('Out & about picks')
  })

  it('single-word parent names: capitalise first letter + append " picks"', () => {
    expect(homeCategoryRailLabel('Shopping')).toBe('Shopping picks')
    expect(homeCategoryRailLabel('Education')).toBe('Education picks')
  })

  it('already-lowercase input: capitalises first letter', () => {
    expect(homeCategoryRailLabel('food & drink')).toBe('Food & drink picks')
  })

  it('already-uppercase input: sentence-cases', () => {
    expect(homeCategoryRailLabel('FOOD & DRINK')).toBe('Food & drink picks')
  })

  it('whitespace-padded input: trims before formatting', () => {
    expect(homeCategoryRailLabel('  Food & Drink  ')).toBe('Food & drink picks')
  })

  it('empty / whitespace-only input: defensive fallback to bare "picks"', () => {
    expect(homeCategoryRailLabel('')).toBe('picks')
    expect(homeCategoryRailLabel('   ')).toBe('picks')
  })
})
