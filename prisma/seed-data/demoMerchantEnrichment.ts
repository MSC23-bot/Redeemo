// prisma/seed-data/demoMerchantEnrichment.ts
//
// QA-only enrichment data for the 9 fake/demo taxonomy-seeded merchants
// + dev-merchant-001 (The Coffee House) partial enrichment.
//
// Real merchants (Karaara, My Kerala, Covelum) are NOT in this file —
// they receive PIN-only enrichment via a separate code path in
// seedDemoMerchantEnrichment() (and Covelum already has full media +
// hours from the older Covelum-specific block).
//
// This file is the deterministic source of truth: every field is
// hand-authored, plausible for QA, and contains no real PII (PINs are
// dev-only). Logo URLs use placehold.co (deterministic, brand
// colour). Banners use Unsplash imagery — category-appropriate but
// generic enough that no fake merchant is impersonating a real
// business. Website URLs use example.com placeholders.
//
// Plan: docs/superpowers/plans/2026-05-20-seed-merchant-enrichment.md
//   §0 D1-D7 owner-locked decisions
//   §Stage 2 final scope (locked 2026-05-20 post-implementation-pre-check)

/** DEV/QA ONLY — every dev/QA branch uses this PIN per the
 *  plan §0 D2 lock. NOT a production secret. */
export const DEV_QA_PIN = '1234'

export type DemoMerchantEnrichment = {
  merchantId: string
  logoUrl: string
  bannerUrl: string
  websiteUrl: string | null
  /** Vouchers to upsert by id (deterministic, idempotent). Empty array =
   *  partial enrichment: do NOT add vouchers (Cohort B / The Coffee House). */
  vouchers: Array<{
    id: string
    /** Globally-unique voucher code. Stable per merchant slug + index. */
    code: string
    title: string
    description: string
    type: 'BOGO' | 'DISCOUNT_PERCENT' | 'DISCOUNT_FIXED' | 'FREEBIE' | 'PACKAGE_DEAL'
    estimatedSaving: number
  }>
  /** Per-branch enrichment — keyed by branch.id. */
  branches: Record<string, DemoBranchEnrichment>
}

export type DemoBranchEnrichment = {
  /** AES-256-GCM-encrypted via the existing `encrypt` helper in the seed. */
  redemptionPinPlaintext: string
  /** 7-day schedule. dayOfWeek 0=Sunday … 6=Saturday.
   *  Single-session only — split sessions deferred to §SE.1. */
  openingHours: Array<{ dayOfWeek: 0|1|2|3|4|5|6; openTime: string | null; closeTime: string | null; isClosed: boolean }>
  /** Address gap-fills. Only set if the field is currently null on the branch. */
  phone?: string
  email?: string
}

export const DEMO_MERCHANT_ENRICHMENT: DemoMerchantEnrichment[] = [
  // ───────────────────────────────────────────────────────────────────
  // 1. Bean & Brew Specialty — speciality café (Shoreditch)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-cafe-001',
    logoUrl: 'https://placehold.co/200x200/8B4513/FFFFFF.png?text=B%26B',
    bannerUrl: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=1200',
    websiteUrl: 'https://example.com/bean-and-brew',
    vouchers: [
      {
        id: 'tax-voucher-cafe-rcv-1',
        code: 'CAFE-RCV-001',
        title: '20% off any breakfast',
        description: 'Valid Mon-Fri 7am-11am. One voucher per customer per visit.',
        type: 'DISCOUNT_PERCENT',
        estimatedSaving: 3.50,
      },
      {
        id: 'tax-voucher-cafe-rcv-2',
        code: 'CAFE-RCV-002',
        title: 'BOGO any speciality coffee',
        description: 'Buy one get one free on any flat white, latte, or cappuccino.',
        type: 'BOGO',
        estimatedSaving: 4.20,
      },
      {
        id: 'tax-voucher-cafe-rcv-3',
        code: 'CAFE-RCV-003',
        title: 'Free pastry with any hot drink',
        description: 'Add a croissant or muffin free of charge when you order any hot drink.',
        type: 'FREEBIE',
        estimatedSaving: 2.80,
      },
    ],
    branches: {
      'tax-branch-cafe-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: '08:00', closeTime: '15:00', isClosed: false }, // Sun
          { dayOfWeek: 1, openTime: '07:00', closeTime: '17:00', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '07:00', closeTime: '17:00', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '07:00', closeTime: '17:00', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '07:00', closeTime: '17:00', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '07:00', closeTime: '17:00', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '08:00', closeTime: '15:00', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 2. Core Reform Studio — pilates studio (Clapham)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-pilates-001',
    logoUrl: 'https://placehold.co/200x200/2D4A3E/FFFFFF.png?text=CR',
    bannerUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200',
    websiteUrl: 'https://example.com/core-reform',
    vouchers: [
      {
        id: 'tax-voucher-pilates-rcv-1',
        code: 'PIL-RCV-001',
        title: 'First reformer class free',
        description: 'New clients only. Book any reformer class and the first session is on us.',
        type: 'FREEBIE',
        estimatedSaving: 28.00,
      },
      {
        id: 'tax-voucher-pilates-rcv-2',
        code: 'PIL-RCV-002',
        title: '15% off a 5-class pass',
        description: 'Save 15% when you buy a 5-class reformer or mat pass. Pass valid for 60 days.',
        type: 'DISCOUNT_PERCENT',
        estimatedSaving: 18.75,
      },
      {
        id: 'tax-voucher-pilates-rcv-3',
        code: 'PIL-RCV-003',
        title: '£10 off any private session',
        description: 'Save £10 on a 1-to-1 reformer session with one of our instructors.',
        type: 'DISCOUNT_FIXED',
        estimatedSaving: 10.00,
      },
    ],
    branches: {
      'tax-branch-pilates-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: '09:00', closeTime: '14:00', isClosed: false }, // Sun
          { dayOfWeek: 1, openTime: '06:30', closeTime: '20:30', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '06:30', closeTime: '20:30', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '06:30', closeTime: '20:30', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '06:30', closeTime: '20:30', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '06:30', closeTime: '19:00', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '08:00', closeTime: '15:00', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 3. Iron Forge Gym — gym (Marsden)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-iron-forge-gym-001',
    logoUrl: 'https://placehold.co/200x200/1A1A1A/F5C518.png?text=IF',
    bannerUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200',
    websiteUrl: 'https://example.com/iron-forge',
    vouchers: [
      {
        id: 'tax-voucher-iron-forge-gym-rcv-1',
        code: 'IFG-RCV-001',
        title: '£20 off a monthly membership',
        description: 'Save £20 on your first month. No joining fee. Cancel anytime.',
        type: 'DISCOUNT_FIXED',
        estimatedSaving: 20.00,
      },
      {
        id: 'tax-voucher-iron-forge-gym-rcv-2',
        code: 'IFG-RCV-002',
        title: 'Free personal training intro',
        description: 'Complimentary 30-minute introductory PT session with a qualified coach.',
        type: 'FREEBIE',
        estimatedSaving: 35.00,
      },
      {
        id: 'tax-voucher-iron-forge-gym-rcv-3',
        code: 'IFG-RCV-003',
        title: '25% off a 5-pack of PT sessions',
        description: 'Save a quarter when you buy 5 personal training sessions in a single pack.',
        type: 'PACKAGE_DEAL',
        estimatedSaving: 50.00,
      },
    ],
    branches: {
      'tax-branch-iron-forge-gym-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: '08:00', closeTime: '18:00', isClosed: false }, // Sun
          { dayOfWeek: 1, openTime: '06:00', closeTime: '22:00', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '06:00', closeTime: '22:00', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '06:00', closeTime: '22:00', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '06:00', closeTime: '22:00', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '06:00', closeTime: '21:00', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '07:00', closeTime: '19:00', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 4. Lumière Aesthetics — beauty / aesthetics (Marylebone)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-aesthetics-001',
    logoUrl: 'https://placehold.co/200x200/B08C7A/FFFFFF.png?text=LA',
    bannerUrl: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc?w=1200',
    websiteUrl: 'https://example.com/lumiere',
    vouchers: [
      {
        id: 'tax-voucher-aesthetics-rcv-1',
        code: 'LUM-RCV-001',
        title: '£25 off any facial treatment',
        description: 'Save £25 on any signature facial. Valid for first-time clients.',
        type: 'DISCOUNT_FIXED',
        estimatedSaving: 25.00,
      },
      {
        id: 'tax-voucher-aesthetics-rcv-2',
        code: 'LUM-RCV-002',
        title: '15% off any aesthetic package',
        description: 'Save 15% when you book a 3-session package of any non-surgical treatment.',
        type: 'DISCOUNT_PERCENT',
        estimatedSaving: 45.00,
      },
      {
        id: 'tax-voucher-aesthetics-rcv-3',
        code: 'LUM-RCV-003',
        title: 'Free skin consultation',
        description: 'Complimentary 20-minute skin-mapping consultation with a clinical aesthetician.',
        type: 'FREEBIE',
        estimatedSaving: 40.00,
      },
    ],
    branches: {
      'tax-branch-aesthetics-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },         // Sun
          { dayOfWeek: 1, openTime: '10:00', closeTime: '19:00', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '10:00', closeTime: '19:00', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '10:00', closeTime: '19:00', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '10:00', closeTime: '20:00', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '10:00', closeTime: '19:00', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 5. Market Quarter Food Hall — food hall (Borough)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-foodhall-001',
    logoUrl: 'https://placehold.co/200x200/C84B31/FFFFFF.png?text=MQ',
    bannerUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200',
    websiteUrl: 'https://example.com/market-quarter',
    vouchers: [
      {
        id: 'tax-voucher-foodhall-rcv-1',
        code: 'FH-RCV-001',
        title: '£10 off when you spend £30',
        description: 'Save £10 across any food traders inside the hall when you spend £30 or more.',
        type: 'DISCOUNT_FIXED',
        estimatedSaving: 10.00,
      },
      {
        id: 'tax-voucher-foodhall-rcv-2',
        code: 'FH-RCV-002',
        title: 'BOGO any street-food main',
        description: 'Buy one main from any participating trader and get a second main free.',
        type: 'BOGO',
        estimatedSaving: 11.50,
      },
      {
        id: 'tax-voucher-foodhall-rcv-3',
        code: 'FH-RCV-003',
        title: 'Free dessert with any main',
        description: 'Order any main course and add a free dessert from the dessert bar.',
        type: 'FREEBIE',
        estimatedSaving: 6.50,
      },
    ],
    branches: {
      'tax-branch-foodhall-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: '11:00', closeTime: '21:00', isClosed: false }, // Sun
          { dayOfWeek: 1, openTime: '11:00', closeTime: '22:00', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '11:00', closeTime: '22:00', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '11:00', closeTime: '22:00', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '11:00', closeTime: '23:00', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '11:00', closeTime: '23:30', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '10:00', closeTime: '23:30', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 6. Pinos Pizzeria — pizzeria (Huddersfield)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-pinos-pizzeria-001',
    logoUrl: 'https://placehold.co/200x200/D62828/FFFFFF.png?text=PP',
    bannerUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200',
    websiteUrl: 'https://example.com/pinos',
    vouchers: [
      {
        id: 'tax-voucher-pinos-pizzeria-rcv-1',
        code: 'PIN-RCV-001',
        title: 'BOGO on any classic pizza',
        description: 'Buy any 12-inch classic pizza and get a second one free. Dine-in or takeaway.',
        type: 'BOGO',
        estimatedSaving: 11.95,
      },
      {
        id: 'tax-voucher-pinos-pizzeria-rcv-2',
        code: 'PIN-RCV-002',
        title: '£15 family deal: 2 pizzas + sides',
        description: 'Two 12-inch pizzas, garlic bread, and a bottle of soft drink, all for £15.',
        type: 'PACKAGE_DEAL',
        estimatedSaving: 9.50,
      },
      {
        id: 'tax-voucher-pinos-pizzeria-rcv-3',
        code: 'PIN-RCV-003',
        title: 'Free garlic bread with any pizza',
        description: 'Add a portion of garlic bread free with any pizza order over £10.',
        type: 'FREEBIE',
        estimatedSaving: 4.50,
      },
    ],
    branches: {
      'tax-branch-pinos-pizzeria-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: '12:00', closeTime: '22:00', isClosed: false }, // Sun
          { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },         // Mon (closed)
          { dayOfWeek: 2, openTime: '16:00', closeTime: '22:30', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '16:00', closeTime: '22:30', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '16:00', closeTime: '22:30', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '12:00', closeTime: '23:00', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '12:00', closeTime: '23:00', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 7. Polish Nail Studio — nail salon (Holmfirth)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-polish-nails-001',
    logoUrl: 'https://placehold.co/200x200/E91E63/FFFFFF.png?text=PN',
    bannerUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1200',
    websiteUrl: 'https://example.com/polish-nails',
    vouchers: [
      {
        id: 'tax-voucher-polish-nails-rcv-1',
        code: 'PNS-RCV-001',
        title: '20% off any gel manicure',
        description: 'Save 20% on any signature gel manicure. Pick from over 40 colours.',
        type: 'DISCOUNT_PERCENT',
        estimatedSaving: 6.00,
      },
      {
        id: 'tax-voucher-polish-nails-rcv-2',
        code: 'PNS-RCV-002',
        title: 'Free nail art with any gel set',
        description: 'Add a free accent nail or simple design when you book a gel manicure.',
        type: 'FREEBIE',
        estimatedSaving: 5.00,
      },
      {
        id: 'tax-voucher-polish-nails-rcv-3',
        code: 'PNS-RCV-003',
        title: 'Mani + pedi combo: £10 off',
        description: 'Book a manicure and pedicure together and save £10 on the combined price.',
        type: 'PACKAGE_DEAL',
        estimatedSaving: 10.00,
      },
    ],
    branches: {
      'tax-branch-polish-nails-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },         // Sun (closed)
          { dayOfWeek: 1, openTime: null, closeTime: null, isClosed: true },         // Mon (closed)
          { dayOfWeek: 2, openTime: '09:30', closeTime: '18:00', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '09:30', closeTime: '18:00', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '09:30', closeTime: '19:30', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '09:30', closeTime: '18:00', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '09:00', closeTime: '17:00', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 8. Trim & Co Barbers — barbershop (Huddersfield)
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-trim-co-barbers-001',
    logoUrl: 'https://placehold.co/200x200/2F3E46/FFFFFF.png?text=T%26C',
    bannerUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200',
    websiteUrl: 'https://example.com/trim-co',
    vouchers: [
      {
        id: 'tax-voucher-trim-co-barbers-rcv-1',
        code: 'TCB-RCV-001',
        title: '£5 off any haircut + beard trim',
        description: 'Save a fiver when you book a haircut and beard trim together.',
        type: 'DISCOUNT_FIXED',
        estimatedSaving: 5.00,
      },
      {
        id: 'tax-voucher-trim-co-barbers-rcv-2',
        code: 'TCB-RCV-002',
        title: 'Free hot towel shave upgrade',
        description: 'Upgrade any beard trim to a hot towel finish at no extra cost.',
        type: 'FREEBIE',
        estimatedSaving: 8.00,
      },
      {
        id: 'tax-voucher-trim-co-barbers-rcv-3',
        code: 'TCB-RCV-003',
        title: '15% off a 3-cut pass',
        description: 'Pre-pay for three haircuts and save 15% on the total. Pass valid 6 months.',
        type: 'DISCOUNT_PERCENT',
        estimatedSaving: 10.00,
      },
    ],
    branches: {
      'tax-branch-trim-co-barbers-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },         // Sun (closed)
          { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '09:00', closeTime: '19:30', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '09:00', closeTime: '19:30', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '08:30', closeTime: '17:00', isClosed: false }, // Sat
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 9. Wagtail Veterinary Practice — vet (Hackney)
  // EXCEPTION (D3): only 2 vouchers — "BOGO vet consultations" is not
  // realistic for a regulated medical service. 2 vouchers still exercise
  // the multi-voucher carousel in QA.
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'tax-merchant-vet-001',
    logoUrl: 'https://placehold.co/200x200/4A6741/FFFFFF.png?text=WV',
    bannerUrl: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=1200',
    websiteUrl: 'https://example.com/wagtail-vets',
    vouchers: [
      {
        id: 'tax-voucher-vet-rcv-1',
        code: 'WAG-RCV-001',
        title: 'Free first consultation',
        description: 'New clients: complimentary 15-minute first consultation for any pet.',
        type: 'FREEBIE',
        estimatedSaving: 35.00,
      },
      {
        id: 'tax-voucher-vet-rcv-2',
        code: 'WAG-RCV-002',
        title: '15% off annual booster vaccinations',
        description: 'Save 15% on your pet’s annual booster vaccination course.',
        type: 'DISCOUNT_PERCENT',
        estimatedSaving: 9.00,
      },
    ],
    branches: {
      'tax-branch-vet-001': {
        redemptionPinPlaintext: DEV_QA_PIN,
        openingHours: [
          { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true },         // Sun (closed; emergency referrals only)
          { dayOfWeek: 1, openTime: '08:30', closeTime: '19:00', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '08:30', closeTime: '19:00', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '08:30', closeTime: '19:00', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '08:30', closeTime: '19:00', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '08:30', closeTime: '18:30', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '09:00', closeTime: '13:00', isClosed: false }, // Sat (half-day)
        ],
      },
    },
  },

  // ───────────────────────────────────────────────────────────────────
  // 10. The Coffee House — dev-merchant-001 PARTIAL enrichment
  // (Cohort B per Stage 2 scope lock). vouchers: [] signals "do not
  // upsert vouchers" — The Coffee House already has 2 ACTIVE+APPROVED
  // RMV vouchers (RMV-001, RMV-002) from the auth-flow demo fixture.
  // PIN already SET in the existing seed — branch entry omits PIN
  // overwrite by passing the placeholder; the seed wrapper only writes
  // PIN if currently null on the branch (idempotent guard).
  // ───────────────────────────────────────────────────────────────────
  {
    merchantId: 'dev-merchant-001',
    logoUrl: 'https://placehold.co/200x200/6F4E37/FFFFFF.png?text=TCH',
    bannerUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=1200',
    websiteUrl: 'https://example.com/the-coffee-house',
    vouchers: [], // Cohort B partial: do NOT add vouchers (already has 2)
    branches: {
      'dev-branch-001': {
        redemptionPinPlaintext: DEV_QA_PIN, // already-set PIN is preserved by the idempotency guard in seed.ts
        openingHours: [
          { dayOfWeek: 0, openTime: '08:00', closeTime: '17:00', isClosed: false }, // Sun
          { dayOfWeek: 1, openTime: '07:00', closeTime: '18:30', isClosed: false }, // Mon
          { dayOfWeek: 2, openTime: '07:00', closeTime: '18:30', isClosed: false }, // Tue
          { dayOfWeek: 3, openTime: '07:00', closeTime: '18:30', isClosed: false }, // Wed
          { dayOfWeek: 4, openTime: '07:00', closeTime: '18:30', isClosed: false }, // Thu
          { dayOfWeek: 5, openTime: '07:00', closeTime: '19:00', isClosed: false }, // Fri
          { dayOfWeek: 6, openTime: '08:00', closeTime: '17:00', isClosed: false }, // Sat
        ],
      },
    },
  },
]

/** Cohort C — real-merchant branches receiving PIN-only enrichment IFF
 *  redemptionPin is currently null. NO other field touched. */
export const REAL_MERCHANT_PIN_BRANCH_IDS = [
  'tax-branch-karaara-001',
  'tax-branch-mykerala-001',
  'tax-branch-covelum-001',
  'tax-branch-covelum-002',
] as const
