// Map Phase 2 Slice S3 (pin v2, 2026-07-10) — category pin glyph matcher.
//
// Mirrors RailHeader's CATEGORY_ICONS test coverage pattern: pin every
// known top-level category name to its expected glyph component, plus
// the ordering-sensitive 'medical' vs 'health' precedence and the
// null/unmatched default-glyph fallback.

import {
  Utensils, Scissors, Stethoscope, Dumbbell, Compass, ShoppingBag,
  Home, Plane, Baby, Car, PawPrint, MapPin,
} from '@/design-system/icons'
import { getCategoryPinGlyph } from '@/features/map/utils/categoryPinGlyph'

describe('getCategoryPinGlyph', () => {
  it.each([
    ['Food & Drink', Utensils],
    ['Beauty & Wellness', Scissors],
    ['Health & Medical', Stethoscope],
    ['Health & Fitness', Dumbbell],
    ['Out & About', Compass],
    ['Shopping', ShoppingBag],
    ['Home & Local Services', Home],
    ['Travel & Hotels', Plane],
    ['Family & Kids', Baby],
    ['Auto & Garage', Car],
    ['Pets', PawPrint],
  ])('matches %s to its glyph', (name, expected) => {
    expect(getCategoryPinGlyph(name)).toBe(expected)
  })

  it("'medical' takes precedence over 'health' (mirrors RailHeader ordering)", () => {
    // "Health & Medical" contains BOTH "health" and "medical" — the
    // medical-specific glyph must win, not the fitness/health glyph.
    expect(getCategoryPinGlyph('Health & Medical')).toBe(Stethoscope)
    expect(getCategoryPinGlyph('Health & Medical')).not.toBe(Dumbbell)
  })

  it('is case-insensitive', () => {
    expect(getCategoryPinGlyph('FOOD & DRINK')).toBe(Utensils)
    expect(getCategoryPinGlyph('food & drink')).toBe(Utensils)
  })

  it('falls back to the default glyph for an unmatched category name', () => {
    expect(getCategoryPinGlyph('Some Brand New Category')).toBe(MapPin)
  })

  it('falls back to the default glyph for null', () => {
    expect(getCategoryPinGlyph(null)).toBe(MapPin)
  })

  it('falls back to the default glyph for undefined', () => {
    expect(getCategoryPinGlyph(undefined)).toBe(MapPin)
  })

  it('falls back to the default glyph for an empty string', () => {
    expect(getCategoryPinGlyph('')).toBe(MapPin)
  })

  it('is deterministic: repeated calls with the same input return the same glyph', () => {
    expect(getCategoryPinGlyph('Food & Drink')).toBe(getCategoryPinGlyph('Food & Drink'))
  })
})
