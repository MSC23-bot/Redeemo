// M2 F5: voucher-builder CONFIG, ported VERBATIM from the S0 extraction (S0 §1).
// Keyed at TOP-LEVEL category granularity ONLY (11 keys + 1 fallback). There is NO
// subcategory-level config (CC-15). The chip lists per category x type drive the
// guided builder's suggestion chips; the per-category `terms` flags drive the
// category-conditional caution terms (see terms.ts).
//
// Source of truth: docs/superpowers/specs/2026-06-20-merchant-web-m2-voucher-builder-extraction.md

export type CategoryKey =
  | 'food_drink'
  | 'beauty_wellness'
  | 'health_fitness'
  | 'out_about'
  | 'shopping'
  | 'home_local'
  | 'travel_hotels'
  | 'health_medical'
  | 'family_kids'
  | 'auto_garage'
  | 'pet_services'
  | 'CATEGORY_FALLBACK'

export const CATEGORY_FALLBACK_KEY: CategoryKey = 'CATEGORY_FALLBACK'

// The per-category conditional-term flags (S0 §2.6). Pushed into terms.ts.
export interface CategoryTermFlags {
  booking: boolean
  fullPrice: boolean
  dineIn: boolean
  whileStocks: boolean
  subjectAvail: boolean
  oneTreatment: boolean
}

export interface CategoryDatum {
  bogoBuy: string[]
  freebie: string[]
  spendAmt: number[]
  spendSave: number[]
  terms: CategoryTermFlags
}

// S0 §1.1 (chips) + S0 §2.6 (term flags), verbatim.
export const CATEGORY_DATA: Record<CategoryKey, CategoryDatum> = {
  food_drink: {
    bogoBuy: ['A main', 'A hot drink', 'A starter'],
    freebie: ['A side', 'A dessert', 'A hot drink'],
    spendAmt: [15, 25, 40],
    spendSave: [5, 8, 10],
    terms: { booking: true, fullPrice: true, dineIn: true, whileStocks: false, subjectAvail: false, oneTreatment: false },
  },
  beauty_wellness: {
    bogoBuy: ['A treatment', 'A manicure', 'A blow dry'],
    freebie: ['An add on treatment', 'A consultation', 'A product sample'],
    spendAmt: [30, 50, 80],
    spendSave: [5, 10, 15],
    terms: { booking: true, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: true },
  },
  health_fitness: {
    bogoBuy: ['A class', 'A session', 'A day pass'],
    freebie: ['A guest pass', 'An intro session', 'A class'],
    spendAmt: [20, 40, 60],
    spendSave: [5, 10, 15],
    terms: { booking: true, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: true, oneTreatment: false },
  },
  shopping: {
    bogoBuy: ['A full price item', 'An accessory', 'A second item'],
    freebie: ['A gift with purchase', 'An accessory', 'A sample'],
    spendAmt: [25, 50, 100],
    spendSave: [5, 10, 20],
    terms: { booking: false, fullPrice: true, dineIn: false, whileStocks: true, subjectAvail: false, oneTreatment: false },
  },
  home_local: {
    bogoBuy: ['A service', 'A visit', 'A standard job'],
    freebie: ['A free callout', 'A quote', 'An add on'],
    spendAmt: [50, 100, 150],
    spendSave: [10, 20, 30],
    terms: { booking: false, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: false },
  },
  travel_hotels: {
    bogoBuy: ["A night's stay", 'A room', 'An experience'],
    freebie: ['A room upgrade', 'Breakfast', 'Late checkout'],
    spendAmt: [50, 100, 200],
    spendSave: [10, 20, 40],
    terms: { booking: true, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: true, oneTreatment: false },
  },
  out_about: {
    bogoBuy: ['A ticket', 'An entry', 'An activity'],
    freebie: ['An entry', 'An activity', 'An add on'],
    spendAmt: [20, 40, 60],
    spendSave: [5, 10, 15],
    terms: { booking: false, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: false },
  },
  auto_garage: {
    bogoBuy: ['A service', 'A wash', 'A standard check'],
    freebie: ['A wash', 'A check', 'A top up'],
    spendAmt: [50, 100, 150],
    spendSave: [10, 20, 30],
    terms: { booking: false, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: false },
  },
  pet_services: {
    bogoBuy: ['A groom', 'A session', 'A walk'],
    freebie: ['A nail trim', 'A treat', 'An add on'],
    spendAmt: [20, 40, 60],
    spendSave: [5, 10, 15],
    terms: { booking: true, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: false },
  },
  family_kids: {
    bogoBuy: ['A session', 'An entry', 'A class'],
    freebie: ['An entry', 'An activity', 'An add on'],
    spendAmt: [15, 30, 50],
    spendSave: [5, 10, 15],
    terms: { booking: false, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: false },
  },
  health_medical: {
    bogoBuy: ['A consultation', 'A check', 'A treatment'],
    freebie: ['A consultation', 'A check', 'An add on'],
    spendAmt: [40, 80, 120],
    spendSave: [10, 20, 30],
    terms: { booking: true, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: true },
  },
  CATEGORY_FALLBACK: {
    bogoBuy: ['A full price item', 'An item', 'A service'],
    freebie: ['A free item', 'An add on', 'A sample'],
    spendAmt: [20, 40, 60],
    spendSave: [5, 10, 15],
    terms: { booking: false, fullPrice: false, dineIn: false, whileStocks: false, subjectAvail: false, oneTreatment: false },
  },
}

// Top-level category NAME (as seeded in the DB) -> S0 config key.
const NAME_TO_KEY: Record<string, CategoryKey> = {
  'Food & Drink': 'food_drink',
  'Beauty & Wellness': 'beauty_wellness',
  'Health & Fitness': 'health_fitness',
  'Out & About': 'out_about',
  'Shopping': 'shopping',
  'Home & Local Services': 'home_local',
  'Travel & Hotels': 'travel_hotels',
  'Health & Medical': 'health_medical',
  'Family & Kids': 'family_kids',
  'Auto & Garage': 'auto_garage',
  'Pet Services': 'pet_services',
}

export function resolveCategoryKey(name: string | null | undefined): CategoryKey {
  if (!name) return CATEGORY_FALLBACK_KEY
  return NAME_TO_KEY[name] ?? CATEGORY_FALLBACK_KEY
}

function datumFor(key: CategoryKey): CategoryDatum {
  return CATEGORY_DATA[key] ?? CATEGORY_DATA[CATEGORY_FALLBACK_KEY]
}

// --- Freebie qualifying-purchase chips (S0 §1.2 FREE_QUAL_SUGGEST) ------------
export const FREE_QUAL_SUGGEST: Partial<Record<CategoryKey, string[]>> = {
  food_drink: ['Any main', 'Any meal', 'A spend of £15 or more'],
  health_fitness: ['Any class', 'Any day pass', 'A spend of £20 or more'],
  beauty_wellness: ['Any treatment', 'Any appointment', 'A spend of £30 or more'],
  shopping: ['Any full price item', 'Two or more items', 'A spend of £25 or more'],
  travel_hotels: ['Any overnight stay', 'Any booking', 'A spend of £50 or more'],
  home_local: ['Any service', 'Any appointment', 'A spend of £40 or more'],
  out_about: ['Any ticket', 'Any entry', 'A spend of £20 or more'],
  auto_garage: ['Any service', 'Any standard job', 'A spend of £50 or more'],
  pet_services: ['Any groom', 'Any session', 'A spend of £20 or more'],
  family_kids: ['Any entry', 'Any session', 'A spend of £15 or more'],
  health_medical: ['Any consultation', 'Any appointment', 'A spend of £40 or more'],
}

const FREE_QUAL_FALLBACK = ['Any full price item', 'Any purchase', 'A spend of £25 or more']

// --- Package item-suggest chips (S0 §1.2 PKG_ITEM_SUGGEST) --------------------
export const PKG_ITEM_SUGGEST: Partial<Record<CategoryKey, string[]>> = {
  food_drink: ['A starter, main and dessert', 'Two mains and a side', 'A sharing platter for two'],
  beauty_wellness: ['A facial and a massage', 'A cut and blow dry', 'A mani and a pedi'],
  health_fitness: ['Five classes', 'A month of sessions', 'An induction and three sessions'],
  shopping: ['Three items together', 'A gift set', 'A bundle of essentials'],
  home_local: ['A service and a follow up', 'Two rooms done', 'A set of jobs'],
  travel_hotels: ['A night plus breakfast', 'A room and dinner', 'A two night break'],
  out_about: ['Entry for two', 'A tour and a drink', 'A day pass for the group'],
  auto_garage: ['A service and MOT', 'A wash and full valet', 'Tyres and alignment'],
  pet_services: ['A groom and nail trim', 'Three walks', 'A wash and tidy'],
  family_kids: ['Entry for four', 'A party package', 'Two sessions and a snack'],
  health_medical: ['A consultation and a follow up', 'A check and a report'],
}

const PKG_ITEM_FALLBACK = ['A bundle of items', 'Two things together', 'A set']

// --- Package list-mode placeholders (S0 §1.2 PKG_ITEM_PLACEHOLDERS) -----------
export const PKG_ITEM_PLACEHOLDERS: Partial<Record<CategoryKey, string[]>> = {
  food_drink: ['e.g. a starter', 'e.g. a main', 'e.g. a drink', 'e.g. a side', 'e.g. a dessert'],
  beauty_wellness: ['e.g. a treatment', 'e.g. a finishing touch', 'e.g. a product', 'e.g. a consultation'],
  health_fitness: ['e.g. a class', 'e.g. a session', 'e.g. a guest pass', 'e.g. an assessment'],
  shopping: ['e.g. an item', 'e.g. a matching piece', 'e.g. an accessory', 'e.g. a gift'],
  home_local: ['e.g. a service', 'e.g. a follow up', 'e.g. a visit', 'e.g. a job'],
  travel_hotels: ['e.g. a night stay', 'e.g. breakfast', 'e.g. a welcome drink', 'e.g. a late checkout'],
  out_about: ['e.g. an entry', 'e.g. an activity', 'e.g. a ticket', 'e.g. a drink'],
  auto_garage: ['e.g. a service', 'e.g. a wash', 'e.g. a check', 'e.g. a valet'],
  pet_services: ['e.g. a groom', 'e.g. a nail trim', 'e.g. a walk', 'e.g. a wash'],
  family_kids: ['e.g. an entry', 'e.g. an activity', 'e.g. a session', 'e.g. a snack'],
  health_medical: ['e.g. a consultation', 'e.g. a check', 'e.g. a follow up', 'e.g. a report'],
}

const PKG_PLACEHOLDER_FALLBACK = ['e.g. an item']

// --- Consumers (S0 §1.2) -----------------------------------------------------

// BOGO buy chips: literal "Any full price item" + category bogoBuy, capped at 4.
export function buySuggestChips(key: CategoryKey): string[] {
  return ['Any full price item', ...datumFor(key).bogoBuy].slice(0, 4)
}

// BOGO free chips: FIXED 3-item list (not category-driven, CC-6).
export function freeBogoChips(): string[] {
  return ['A second of equal or lower value', 'Another of the same item', 'A second item']
}

export function freebieItemChips(key: CategoryKey): string[] {
  return datumFor(key).freebie.slice(0, 4)
}

export function freeQualifyChips(key: CategoryKey): string[] {
  return (FREE_QUAL_SUGGEST[key] ?? FREE_QUAL_FALLBACK).slice(0, 3)
}

// Freebie "what is it worth": FIXED amounts.
export function freebieWorthChips(): number[] {
  return [4, 6, 8]
}

export function spendChips(key: CategoryKey): number[] {
  return datumFor(key).spendAmt
}

export function saveChips(key: CategoryKey): number[] {
  return datumFor(key).spendSave
}

// Discount: FIXED numeric chips (not category-keyed, CC-4).
export function discountAmountChips(): number[] {
  return [5, 10, 15]
}
export function discountPercentChips(): number[] {
  return [10, 15, 20]
}
export function discountTypicalOrderChips(): number[] {
  return [20, 30, 50]
}
export function discountMinSpendChips(): number[] {
  return [15, 25, 40]
}

export function packageItemChips(key: CategoryKey): string[] {
  return (PKG_ITEM_SUGGEST[key] ?? PKG_ITEM_FALLBACK).slice(0, 3)
}

export function packagePriceChips(): number[] {
  return [25, 40, 60]
}
export function packageNormalChips(): number[] {
  return [35, 55, 80]
}

export function packageItemPlaceholders(key: CategoryKey): string[] {
  return PKG_ITEM_PLACEHOLDERS[key] ?? PKG_PLACEHOLDER_FALLBACK
}
