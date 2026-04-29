import { describe, it, expect } from 'vitest'
import { buildDescriptor, filterVisibleHighlights } from '../../../src/api/lib/tile'

describe('buildDescriptor', () => {
  it('renders tag + suffix when both present', () => {
    expect(buildDescriptor('Italian', 'Restaurant')).toBe('Italian Restaurant')
  })

  it('renders subcategory.descriptorSuffix when no tag', () => {
    expect(buildDescriptor(null, 'Restaurant')).toBe('Restaurant')
  })

  it('drops suffix when tag label already contains it (de-dup forward)', () => {
    // "Cookery Class" tag, "Class & Workshop" suffix → "Cookery Class"
    expect(buildDescriptor('Cookery Class', 'Class & Workshop')).toBe('Cookery Class')
  })

  it('drops tag when suffix already contains it (de-dup reverse)', () => {
    // "Boutique" tag, "Boutique Hotel" suffix → "Boutique Hotel"
    expect(buildDescriptor('Boutique', 'Boutique Hotel')).toBe('Boutique Hotel')
  })

  it('is case-insensitive in de-dup', () => {
    expect(buildDescriptor('boutique', 'Boutique Hotel')).toBe('Boutique Hotel')
    expect(buildDescriptor('BOUTIQUE', 'boutique hotel')).toBe('boutique hotel')
  })

  it('returns subcategory name when both inputs null/empty', () => {
    expect(buildDescriptor(null, 'Vet')).toBe('Vet')
  })
})

describe('filterVisibleHighlights', () => {
  it('returns empty array when input is empty (regardless of redundant set)', () => {
    expect(filterVisibleHighlights([], new Set())).toEqual([])
    expect(filterVisibleHighlights([], new Set(['h1', 'h2']))).toEqual([])
  })

  it('returns all highlights when redundant set is empty', () => {
    const highlights = [
      { id: 'h1', label: 'Pet-Friendly' },
      { id: 'h2', label: 'Independent' },
    ]
    expect(filterVisibleHighlights(highlights, new Set())).toEqual(highlights)
  })

  it('filters out a single redundant highlight, preserves the rest in order', () => {
    const highlights = [
      { id: 'h1', label: 'Pet-Friendly' },
      { id: 'h2', label: 'Independent' },
      { id: 'h3', label: 'Family-Friendly' },
    ]
    expect(filterVisibleHighlights(highlights, new Set(['h1']))).toEqual([
      { id: 'h2', label: 'Independent' },
      { id: 'h3', label: 'Family-Friendly' },
    ])
  })

  it('returns empty array when ALL highlights are in the redundant set', () => {
    const highlights = [
      { id: 'h1', label: 'Pet-Friendly' },
      { id: 'h2', label: 'Independent' },
    ]
    expect(filterVisibleHighlights(highlights, new Set(['h1', 'h2']))).toEqual([])
  })
})
