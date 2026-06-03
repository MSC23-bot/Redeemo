import { homeCategoryRailLabel } from '@/features/home/utils/homeCategoryRailLabel'

// 2026-06-03 (owner direction) — Home NearbyByCategory rail header label.
// Title-cases the parent category name ("Food & Drink", not "Food & drink") and
// suffixes with " picks". Applies identically to local + cascade rails.

describe('homeCategoryRailLabel', () => {
  it('title-cases multi-word parent names + appends " picks"', () => {
    expect(homeCategoryRailLabel('Food & Drink')).toBe('Food & Drink picks')
    expect(homeCategoryRailLabel('Beauty & Wellness')).toBe('Beauty & Wellness picks')
    expect(homeCategoryRailLabel('Health & Fitness')).toBe('Health & Fitness picks')
    expect(homeCategoryRailLabel('Out & About')).toBe('Out & About picks')
  })

  it('single-word parent names: capitalise first letter + append " picks"', () => {
    expect(homeCategoryRailLabel('Shopping')).toBe('Shopping picks')
    expect(homeCategoryRailLabel('Education')).toBe('Education picks')
  })

  it('already-lowercase input: title-cases each word', () => {
    expect(homeCategoryRailLabel('food & drink')).toBe('Food & Drink picks')
  })

  it('already-uppercase input: title-cases each word', () => {
    expect(homeCategoryRailLabel('FOOD & DRINK')).toBe('Food & Drink picks')
  })

  it('whitespace-padded input: trims before formatting', () => {
    expect(homeCategoryRailLabel('  Food & Drink  ')).toBe('Food & Drink picks')
  })

  it('empty / whitespace-only input: defensive fallback to bare "picks"', () => {
    expect(homeCategoryRailLabel('')).toBe('picks')
    expect(homeCategoryRailLabel('   ')).toBe('picks')
  })
})
