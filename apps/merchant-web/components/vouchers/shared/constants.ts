// Voucher Builder shared core: visual + copy constants, prototype-faithful.
//
// PROVENANCE: docs/design/merchant-portal/voucher-builder-prototype-2026-07-13/
//   Redeemo-for-Business.FULL.html (TYPE_BANNER ~L12556, type accents / picker copy)
//   + PROTOTYPE-INVENTORY.md sections 2.1 / 6.

import type { DayTwoPickerId } from '../builder/builderModel'
import type { BuilderType } from '@/lib/voucher/terms'

// Per-type accent (design-system voucher-type tokens; matches components/ui/chip.tsx).
export const TYPE_ACCENT: Record<DayTwoPickerId, string> = {
  bogo: '#7C3AED',
  spend: '#E84A00',
  discount: '#E20C04',
  freebie: '#16A34A',
  package: '#2563EB',
  time: '#D97706',
  reusable: '#0D9488',
}

// Photo-less preview banner: per-type brand gradient (FULL.html TYPE_BANNER, L12556).
export const TYPE_BANNER: Record<DayTwoPickerId, string> = {
  bogo: 'radial-gradient(circle at 82% 18%,rgba(255,255,255,0.24),transparent 55%),linear-gradient(135deg,#B7A4F2 0%,#6E3DD3 100%)',
  discount: 'radial-gradient(circle at 82% 18%,rgba(255,255,255,0.24),transparent 55%),linear-gradient(135deg,#FB8896 0%,#D8302A 100%)',
  freebie: 'radial-gradient(circle at 82% 18%,rgba(255,255,255,0.24),transparent 55%),linear-gradient(135deg,#A0E5BA 0%,#208E50 100%)',
  spend: 'radial-gradient(circle at 82% 18%,rgba(255,255,255,0.24),transparent 55%),linear-gradient(135deg,#FAB78E 0%,#D6531B 100%)',
  package: 'radial-gradient(circle at 82% 18%,rgba(255,255,255,0.24),transparent 55%),linear-gradient(135deg,#9CC0F5 0%,#2D5BCC 100%)',
  time: 'radial-gradient(circle at 82% 18%,rgba(255,255,255,0.24),transparent 55%),linear-gradient(135deg,#F4D072 0%,#BC6D1C 100%)',
  reusable: 'radial-gradient(circle at 82% 18%,rgba(255,255,255,0.24),transparent 55%),linear-gradient(135deg,#84DCC2 0%,#198375 100%)',
}

// Preview pill label per type (uppercase on the card banner).
export const TYPE_PILL: Record<DayTwoPickerId, string> = {
  bogo: 'BUY ONE, GET ONE FREE',
  spend: 'SPEND & SAVE',
  discount: 'DISCOUNT',
  freebie: 'FREEBIE',
  package: 'PACKAGE DEAL',
  time: 'TIME LIMITED',
  reusable: 'REUSABLE',
}

export interface TypeCardMeta {
  id: DayTwoPickerId
  label: string
  blurb: string
  accent: string
  /** "Builds on another voucher" pill for the wrapper types (INVENTORY 2.1). */
  wrapper?: boolean
}

// The 7-card custom-lane type picker (INVENTORY 2.1; all 8 backend types, discount
// is one card with an internal fixed/percent toggle).
export const TYPE_CARDS: TypeCardMeta[] = [
  { id: 'discount', label: 'Discount', blurb: 'A straight saving off the price, fixed or a percentage.', accent: TYPE_ACCENT.discount },
  { id: 'bogo', label: 'Buy one, get one free', blurb: 'The easiest to understand and the strongest at bringing people in.', accent: TYPE_ACCENT.bogo },
  { id: 'freebie', label: 'Freebie', blurb: 'Give a free item, on its own or with a purchase.', accent: TYPE_ACCENT.freebie },
  { id: 'spend', label: 'Spend & save', blurb: 'Reward customers who spend a little more in one visit.', accent: TYPE_ACCENT.spend },
  { id: 'package', label: 'Package deal', blurb: 'Bundle a few items together at one set price.', accent: TYPE_ACCENT.package },
  { id: 'time', label: 'Time limited', blurb: 'A saving on your quieter days or hours.', accent: TYPE_ACCENT.time, wrapper: true },
  { id: 'reusable', label: 'Reusable', blurb: 'A small offer customers can come back and use again.', accent: TYPE_ACCENT.reusable, wrapper: true },
]

// The 5 base-mechanic cards for a wrapper's Step 1.
export const BASE_MECHANIC_CARDS: Array<{ id: BuilderType; label: string; blurb: string; accent: string }> = [
  { id: 'discount', label: 'Discount', blurb: 'A straight saving off the price.', accent: TYPE_ACCENT.discount },
  { id: 'bogo', label: 'Buy one, get one free', blurb: 'Buy an item, get a second one free.', accent: TYPE_ACCENT.bogo },
  { id: 'freebie', label: 'Freebie', blurb: 'A free item, on its own or with a purchase.', accent: TYPE_ACCENT.freebie },
  { id: 'spend', label: 'Spend & save', blurb: 'Spend a set amount, save a set amount.', accent: TYPE_ACCENT.spend },
  { id: 'package', label: 'Package deal', blurb: 'A few items together at one set price.', accent: TYPE_ACCENT.package },
]
