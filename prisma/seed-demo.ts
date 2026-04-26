/**
 * Demo merchant seed — populates the backend with realistic sample merchants
 * so the customer website has something to display during UI review.
 *
 * Every record is id-prefixed `demo-` so they can be removed in one pass via
 * `npm run seed:demo:clear`.
 *
 * Safe to run multiple times (uses upsert on stable ids).
 */

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as crypto from 'crypto'
import { encrypt } from '../src/api/shared/encryption'

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? 'a'.repeat(64)

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function devHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// ─── Types ────────────────────────────────────────────────────────────────

type DemoBranch = {
  suffix: string                     // id suffix, e.g. "a"
  name: string
  isMainBranch?: boolean
  addressLine1: string
  addressLine2?: string
  city: string
  postcode: string
  latitude: number
  longitude: number
  phone: string
  email?: string
  hours: Array<[number, string, string] | [number, 'closed']> // [dayOfWeek, open, close] | [dayOfWeek, 'closed']
  amenityNames: string[]
  reviews: Array<{ reviewerIdx: number; rating: number; comment: string }>
}

type DemoVoucher = {
  code: string                       // e.g. RMV-001 or RCV-A01
  type: 'BOGO' | 'DISCOUNT_PERCENT' | 'DISCOUNT_FIXED' | 'FREEBIE' | 'SPEND_AND_SAVE' | 'PACKAGE_DEAL' | 'TIME_LIMITED' | 'REUSABLE'
  title: string
  description: string
  terms: string
  estimatedSaving: number
  isMandatory?: boolean
}

type DemoMerchant = {
  id: string                         // e.g. "demo-merchant-01"
  businessName: string
  tradingName: string
  description: string
  websiteUrl: string
  logoUrl: string
  bannerUrl: string
  adminEmail: string                 // must be globally unique
  primaryCategoryName: string        // matches seeded Category.name
  additionalCategoryNames?: string[]
  featured?: boolean                 // if true, adds a FeaturedMerchant record
  branches: DemoBranch[]
  vouchers: DemoVoucher[]
}

// ─── Demo reviewer users (shared across all merchants) ────────────────────

const REVIEWERS = [
  { id: 'demo-user-reviewer-1', email: 'demo-reviewer-1@redeemo.local', firstName: 'Ava',   lastName: 'Collins' },
  { id: 'demo-user-reviewer-2', email: 'demo-reviewer-2@redeemo.local', firstName: 'Marcus', lastName: 'Patel' },
  { id: 'demo-user-reviewer-3', email: 'demo-reviewer-3@redeemo.local', firstName: 'Sofia',  lastName: 'Nguyen' },
  { id: 'demo-user-reviewer-4', email: 'demo-reviewer-4@redeemo.local', firstName: 'James',  lastName: 'O’Brien' },
  { id: 'demo-user-reviewer-5', email: 'demo-reviewer-5@redeemo.local', firstName: 'Priya',  lastName: 'Mehta' },
]

// Unsplash photo ids chosen to fit category vibe. Stable URLs.
const U = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`

// ─── Demo merchants ───────────────────────────────────────────────────────

const DEMO_MERCHANTS: DemoMerchant[] = [
  {
    id: 'demo-merchant-01',
    businessName: 'Laneway Coffee Roasters',
    tradingName: 'Laneway',
    description:
      'Small-batch specialty roaster on Redchurch Street. Single-origin espresso, slow-drip filter, and sourdough from a sister bakery in Hackney. Quiet in the morning, loud with regulars by 11.',
    websiteUrl: 'https://laneway-demo.redeemo.co.uk',
    logoUrl:    U('photo-1511920170033-f8396924c348', 400),
    bannerUrl:  U('photo-1498804103079-a6351b050096'),
    adminEmail: 'demo-merchant-01@redeemo.local',
    primaryCategoryName: 'Cafes & Coffee',
    additionalCategoryNames: ['Food & Drink'],
    featured: true,
    branches: [
      {
        suffix: 'a',
        name: 'Shoreditch',
        isMainBranch: true,
        addressLine1: '42 Redchurch Street',
        city: 'London',
        postcode: 'E2 7DP',
        latitude: 51.5235, longitude: -0.0736,
        phone: '+442074187000',
        email: 'shoreditch@laneway-demo.redeemo.co.uk',
        hours: [
          [1, '07:30', '17:00'], [2, '07:30', '17:00'], [3, '07:30', '17:00'], [4, '07:30', '18:00'],
          [5, '07:30', '18:00'], [6, '08:30', '18:00'], [0, '09:00', '16:00'],
        ],
        amenityNames: ['Free WiFi', 'Outdoor Seating', 'Card Payment', 'Takeaway'],
        reviews: [
          { reviewerIdx: 0, rating: 5, comment: 'Genuinely the best flat white I\'ve had east of the river. Staff remember your order after two visits.' },
          { reviewerIdx: 1, rating: 4, comment: 'Beans are excellent. Seating is limited at weekends but that\'s the only knock.' },
          { reviewerIdx: 3, rating: 5, comment: 'The filter rotation is a proper highlight. Ethiopian natural last week was unreal.' },
        ],
      },
      {
        suffix: 'b',
        name: 'Borough Market',
        addressLine1: '3 Stoney Street',
        city: 'London',
        postcode: 'SE1 9AA',
        latitude: 51.5055, longitude: -0.0907,
        phone: '+442074184200',
        hours: [
          [1, '07:00', '16:00'], [2, '07:00', '16:00'], [3, '07:00', '16:00'], [4, '07:00', '17:00'],
          [5, '07:00', '18:00'], [6, '08:00', '18:00'], [0, 'closed'],
        ],
        amenityNames: ['Card Payment', 'Takeaway'],
        reviews: [
          { reviewerIdx: 2, rating: 5, comment: 'Perfect pit stop before the market. Worth the short queue.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-01a', isMandatory: true, type: 'BOGO', title: 'Buy One Get One Free Coffee',
        description: 'Buy any hot drink and get a second of equal or lesser value on us.',
        terms: 'In-house or takeaway. Once per member per cycle. Excludes bottled drinks.',
        estimatedSaving: 3.75 },
      { code: 'RMV-demo-01b', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '20% Off Any Pastry',
        description: 'Twenty percent off any pastry or baked good from the counter.',
        terms: 'Single item. Cannot be combined with other offers.',
        estimatedSaving: 1.20 },
      { code: 'RCV-demo-01c', type: 'PACKAGE_DEAL', title: 'Coffee + Pastry for £6',
        description: 'Any filter coffee with a pastry of your choice for a flat £6.',
        terms: 'Dine-in only. Valid all day.',
        estimatedSaving: 2.80 },
    ],
  },
  {
    id: 'demo-merchant-02',
    businessName: 'The Old Foundry Kitchen',
    tradingName: 'The Old Foundry',
    description:
      'Modern British plates in a converted Victorian foundry. The menu changes weekly with what the local farms send in. Cask ales, natural wines, and a wood-fired oven that runs from breakfast to close.',
    websiteUrl: 'https://oldfoundry-demo.redeemo.co.uk',
    logoUrl:    U('photo-1550966871-3ed3cdb5ed0c', 400),
    bannerUrl:  U('photo-1552566626-52f8b828add9'),
    adminEmail: 'demo-merchant-02@redeemo.local',
    primaryCategoryName: 'Restaurants',
    additionalCategoryNames: ['Food & Drink'],
    featured: true,
    branches: [
      {
        suffix: 'a',
        name: 'Clerkenwell',
        isMainBranch: true,
        addressLine1: '114 St John Street',
        city: 'London',
        postcode: 'EC1V 4JS',
        latitude: 51.5245, longitude: -0.1036,
        phone: '+442072539800',
        email: 'hello@oldfoundry-demo.redeemo.co.uk',
        hours: [
          [1, 'closed'], [2, '12:00', '22:30'], [3, '12:00', '22:30'], [4, '12:00', '23:00'],
          [5, '12:00', '23:30'], [6, '11:00', '23:30'], [0, '11:00', '21:00'],
        ],
        amenityNames: ['Card Payment', 'Outdoor Seating', 'Accessible'],
        reviews: [
          { reviewerIdx: 4, rating: 5, comment: 'The lamb shoulder is unreal. Service is calm and confident. Will return.' },
          { reviewerIdx: 0, rating: 4, comment: 'Great food, room can get loud on a Friday. Book ahead for the window tables.' },
          { reviewerIdx: 2, rating: 5, comment: 'Sourdough and cultured butter alone is worth a detour.' },
          { reviewerIdx: 3, rating: 4, comment: 'Wine list has real personality. Prices are fair for the area.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-02a', isMandatory: true, type: 'BOGO', title: '2-for-1 Mains Tuesday to Thursday',
        description: 'Buy one main and get a second main of equal or lesser value free, Tuesday to Thursday.',
        terms: 'Dinner service only. Two-course minimum. Excludes specials.',
        estimatedSaving: 18.50 },
      { code: 'RMV-demo-02b', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '25% Off Food Bill',
        description: 'Twenty-five percent off your food total. Drinks full price.',
        terms: 'Lunch or dinner. One table per visit.',
        estimatedSaving: 12.00 },
      { code: 'RCV-demo-02c', type: 'SPEND_AND_SAVE', title: 'Spend £60, Save £15',
        description: 'Save £15 when your bill reaches £60 or more.',
        terms: 'Excludes service charge. One per table.',
        estimatedSaving: 15.00 },
      { code: 'RCV-demo-02d', type: 'FREEBIE', title: 'Complimentary Dessert with Any Main',
        description: 'A dessert of the day on the house with every main ordered.',
        terms: 'Dine-in. Choice of two desserts rotated weekly.',
        estimatedSaving: 8.00 },
    ],
  },
  {
    id: 'demo-merchant-03',
    businessName: 'Fleet Street Barbering Co',
    tradingName: 'Fleet Street Barbers',
    description:
      'Traditional barbering for the way people actually dress now. Hot towel shaves, skin fades, beard work. Walk-ins welcome but we prefer a booking.',
    websiteUrl: 'https://fleetbarbers-demo.redeemo.co.uk',
    logoUrl:    U('photo-1521572163474-6864f9cf17ab', 400),
    bannerUrl:  U('photo-1503951914875-452162b0f3f1'),
    adminEmail: 'demo-merchant-03@redeemo.local',
    primaryCategoryName: 'Hair Salons',
    additionalCategoryNames: ['Beauty & Wellness'],
    branches: [
      {
        suffix: 'a',
        name: 'Covent Garden',
        isMainBranch: true,
        addressLine1: '18 Floral Street',
        city: 'London',
        postcode: 'WC2E 9DS',
        latitude: 51.5122, longitude: -0.1234,
        phone: '+442072400099',
        hours: [
          [1, '10:00', '19:00'], [2, '09:00', '19:00'], [3, '09:00', '19:00'], [4, '09:00', '20:00'],
          [5, '09:00', '20:00'], [6, '09:00', '18:00'], [0, '11:00', '16:00'],
        ],
        amenityNames: ['Card Payment', 'Accessible'],
        reviews: [
          { reviewerIdx: 1, rating: 5, comment: 'Best fade I\'ve had in years. Listens properly and takes their time.' },
          { reviewerIdx: 3, rating: 4, comment: 'Great cut, hot towel is a nice touch. Gets busy Saturday afternoon.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-03a', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '20% Off First Cut',
        description: 'New members receive twenty percent off their first haircut with any of our barbers.',
        terms: 'New members only. Excludes senior barbers at weekends.',
        estimatedSaving: 8.00 },
      { code: 'RMV-demo-03b', isMandatory: true, type: 'FREEBIE', title: 'Complimentary Hot Towel Shave Add-on',
        description: 'Free hot towel shave finish with any full-price cut.',
        terms: 'Add-on service, fifteen minutes. Pre-book to guarantee slot.',
        estimatedSaving: 10.00 },
      { code: 'RCV-demo-03c', type: 'PACKAGE_DEAL', title: 'Cut + Beard Trim £38',
        description: 'Haircut and beard trim combined at a flat rate.',
        terms: 'Monday to Thursday. Two-week beard minimum for proper shape.',
        estimatedSaving: 12.00 },
    ],
  },
  {
    id: 'demo-merchant-04',
    businessName: 'Edge Strength & Conditioning',
    tradingName: 'Edge S&C',
    description:
      'Small-group training in an independent gym in Bermondsey. Coaches programme your session, you just turn up. Focus on strength, conditioning, and long-term movement quality, not classes that count burpees.',
    websiteUrl: 'https://edge-demo.redeemo.co.uk',
    logoUrl:    U('photo-1540497077202-7c8a3999166f', 400),
    bannerUrl:  U('photo-1534438327276-14e5300c3a48'),
    adminEmail: 'demo-merchant-04@redeemo.local',
    primaryCategoryName: 'Health & Fitness',
    featured: true,
    branches: [
      {
        suffix: 'a',
        name: 'Bermondsey',
        isMainBranch: true,
        addressLine1: '27 Tanner Street',
        city: 'London',
        postcode: 'SE1 3LE',
        latitude: 51.5009, longitude: -0.0793,
        phone: '+442074079200',
        email: 'train@edge-demo.redeemo.co.uk',
        hours: [
          [1, '06:00', '21:00'], [2, '06:00', '21:00'], [3, '06:00', '21:00'], [4, '06:00', '21:00'],
          [5, '06:00', '20:00'], [6, '08:00', '14:00'], [0, '08:00', '13:00'],
        ],
        amenityNames: ['Free WiFi', 'Accessible', 'Card Payment', 'Parking'],
        reviews: [
          { reviewerIdx: 2, rating: 5, comment: 'Three months in and I\'ve deadlifted a PB. Coaching is genuinely excellent.' },
          { reviewerIdx: 4, rating: 5, comment: 'Small groups means you\'re actually watched. Worth every penny.' },
          { reviewerIdx: 0, rating: 4, comment: 'Great gym, just gets busy in the 6pm slot. Go earlier if you can.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-04a', isMandatory: true, type: 'FREEBIE', title: 'Free Intro Session',
        description: 'One-hour introductory session with a coach. No obligation.',
        terms: 'New members only. Book online.',
        estimatedSaving: 25.00 },
      { code: 'RMV-demo-04b', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '15% Off First Month',
        description: 'Fifteen percent off your first month of any membership tier.',
        terms: 'One month only. Does not auto-renew at discount.',
        estimatedSaving: 18.00 },
      { code: 'RCV-demo-04c', type: 'SPEND_AND_SAVE', title: '£30 Off 10-Session Pack',
        description: 'Thirty pounds off a pre-paid pack of ten personal training sessions.',
        terms: 'Use within twelve weeks of purchase.',
        estimatedSaving: 30.00 },
    ],
  },
  {
    id: 'demo-merchant-05',
    businessName: 'Mirador Tapas & Wine',
    tradingName: 'Mirador',
    description:
      'Modern tapas, Spanish-leaning wine list, and a bar that welcomes solo diners. Proper jamón, grilled octopus, and a tortilla that people write about.',
    websiteUrl: 'https://mirador-demo.redeemo.co.uk',
    logoUrl:    U('photo-1555396273-367ea4eb4db5', 400),
    bannerUrl:  U('photo-1414235077428-338989a2e8c0'),
    adminEmail: 'demo-merchant-05@redeemo.local',
    primaryCategoryName: 'Restaurants',
    additionalCategoryNames: ['Food & Drink'],
    branches: [
      {
        suffix: 'a',
        name: 'Soho',
        isMainBranch: true,
        addressLine1: '31 Dean Street',
        city: 'London',
        postcode: 'W1D 4PT',
        latitude: 51.5140, longitude: -0.1324,
        phone: '+442074344100',
        email: 'soho@mirador-demo.redeemo.co.uk',
        hours: [
          [1, '17:00', '22:30'], [2, '17:00', '22:30'], [3, '12:00', '22:30'], [4, '12:00', '23:00'],
          [5, '12:00', '23:30'], [6, '12:00', '23:30'], [0, '13:00', '21:00'],
        ],
        amenityNames: ['Card Payment', 'Accessible'],
        reviews: [
          { reviewerIdx: 3, rating: 5, comment: 'Tortilla is the real deal. Great wines by the glass. Book a bar seat.' },
          { reviewerIdx: 1, rating: 4, comment: 'Service is warm, food is well-priced. Can get squeezed at peak.' },
          { reviewerIdx: 2, rating: 5, comment: 'Perfect date spot. Octopus and the jamón board are must-orders.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-05a', isMandatory: true, type: 'BOGO', title: '2-for-1 Tapas Selection',
        description: 'Buy any tapas from the selection menu and get a second free.',
        terms: 'Up to three matched pairs per table. Excludes charcuterie boards.',
        estimatedSaving: 12.00 },
      { code: 'RMV-demo-05b', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '20% Off Food Bill',
        description: 'Twenty percent off the food portion of your bill.',
        terms: 'Excludes drinks. One voucher per table.',
        estimatedSaving: 14.00 },
      { code: 'RCV-demo-05c', type: 'FREEBIE', title: 'Free Glass of Cava',
        description: 'Complimentary glass of cava when two or more mains are ordered.',
        terms: 'Per person. One glass each.',
        estimatedSaving: 7.50 },
    ],
  },
  {
    id: 'demo-merchant-06',
    businessName: 'Lumen Skin & Face',
    tradingName: 'Lumen Skin',
    description:
      'Evidence-led facial studio for people who care about what\'s actually in the products on their face. Results-focused treatments, no sales pressure, rooms you can fall asleep in.',
    websiteUrl: 'https://lumen-demo.redeemo.co.uk',
    logoUrl:    U('photo-1552693673-1bf958298935', 400),
    bannerUrl:  U('photo-1570172619644-dfd03ed5d881'),
    adminEmail: 'demo-merchant-06@redeemo.local',
    primaryCategoryName: 'Nail & Beauty',
    additionalCategoryNames: ['Beauty & Wellness'],
    branches: [
      {
        suffix: 'a',
        name: 'Marylebone',
        isMainBranch: true,
        addressLine1: '54 Marylebone High Street',
        city: 'London',
        postcode: 'W1U 5HR',
        latitude: 51.5204, longitude: -0.1512,
        phone: '+442074864433',
        email: 'hello@lumen-demo.redeemo.co.uk',
        hours: [
          [1, 'closed'], [2, '10:00', '19:00'], [3, '10:00', '20:00'], [4, '10:00', '20:00'],
          [5, '10:00', '20:00'], [6, '09:00', '18:00'], [0, '10:00', '16:00'],
        ],
        amenityNames: ['Card Payment', 'Accessible'],
        reviews: [
          { reviewerIdx: 0, rating: 5, comment: 'Proper consultation, honest about what my skin actually needed. No upsell.' },
          { reviewerIdx: 4, rating: 5, comment: 'Skin has never looked better. Worth the trip from South London.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-06a', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '25% Off Signature Facial',
        description: 'Twenty-five percent off our sixty-minute signature facial.',
        terms: 'New clients only. Weekdays before 4pm.',
        estimatedSaving: 22.50 },
      { code: 'RMV-demo-06b', isMandatory: true, type: 'FREEBIE', title: 'Free Product Consultation',
        description: 'Thirty-minute no-obligation skincare consultation with a trained therapist.',
        terms: 'Appointment required. No purchase necessary.',
        estimatedSaving: 30.00 },
      { code: 'RCV-demo-06c', type: 'PACKAGE_DEAL', title: 'Three Facial Course £210',
        description: 'A course of three signature facials at a reduced rate, booked across six weeks.',
        terms: 'Non-transferable. Book all three at time of purchase.',
        estimatedSaving: 60.00 },
    ],
  },
  {
    id: 'demo-merchant-07',
    businessName: 'Greenwich Yoga Loft',
    tradingName: 'Greenwich Yoga',
    description:
      'Independent yoga studio in a converted warehouse. Vinyasa, yin, restorative, and a Saturday morning slow flow that locals plan their weekends around.',
    websiteUrl: 'https://greenwichyoga-demo.redeemo.co.uk',
    logoUrl:    U('photo-1588286840104-8957b019727f', 400),
    bannerUrl:  U('photo-1545389336-cf090694435e'),
    adminEmail: 'demo-merchant-07@redeemo.local',
    primaryCategoryName: 'Health & Fitness',
    branches: [
      {
        suffix: 'a',
        name: 'Greenwich',
        isMainBranch: true,
        addressLine1: '8 Norman Road',
        city: 'London',
        postcode: 'SE10 9QX',
        latitude: 51.4765, longitude: -0.0176,
        phone: '+442083053800',
        hours: [
          [1, '07:00', '21:00'], [2, '07:00', '21:00'], [3, '07:00', '21:00'], [4, '07:00', '21:00'],
          [5, '07:00', '20:00'], [6, '08:00', '16:00'], [0, '08:00', '16:00'],
        ],
        amenityNames: ['Free WiFi', 'Accessible', 'Card Payment'],
        reviews: [
          { reviewerIdx: 2, rating: 5, comment: 'Teachers are brilliant, room is calm, studio feels like a proper community.' },
          { reviewerIdx: 3, rating: 4, comment: 'Great classes, just wish the evening slots were easier to book.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-07a', isMandatory: true, type: 'FREEBIE', title: 'First Class Free',
        description: 'First class on the house for new members.',
        terms: 'One per person. All mat-based classes included.',
        estimatedSaving: 16.00 },
      { code: 'RMV-demo-07b', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '20% Off First Month Unlimited',
        description: 'Twenty percent off your first month on the unlimited membership.',
        terms: 'Direct debit. Cancel anytime.',
        estimatedSaving: 22.00 },
    ],
  },
  {
    id: 'demo-merchant-08',
    businessName: 'North Bank Books',
    tradingName: 'North Bank Books',
    description:
      'Independent bookshop and small-press showcase. Carefully chosen fiction, non-fiction, and art monographs. Regular readings, always strong coffee on the counter.',
    websiteUrl: 'https://northbankbooks-demo.redeemo.co.uk',
    logoUrl:    U('photo-1507842217343-583bb7270b66', 400),
    bannerUrl:  U('photo-1519682337058-a94d519337bc'),
    adminEmail: 'demo-merchant-08@redeemo.local',
    primaryCategoryName: 'Retail & Shopping',
    branches: [
      {
        suffix: 'a',
        name: 'Islington',
        isMainBranch: true,
        addressLine1: '203 Upper Street',
        city: 'London',
        postcode: 'N1 1RQ',
        latitude: 51.5422, longitude: -0.1020,
        phone: '+442072265500',
        hours: [
          [1, '10:00', '18:00'], [2, '10:00', '18:00'], [3, '10:00', '18:00'], [4, '10:00', '19:00'],
          [5, '10:00', '19:00'], [6, '10:00', '19:00'], [0, '11:00', '17:00'],
        ],
        amenityNames: ['Card Payment', 'Accessible', 'Free WiFi'],
        reviews: [
          { reviewerIdx: 0, rating: 5, comment: 'Recommended a novel I never would have found. Proper bookseller energy.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-08a', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '15% Off Any Book',
        description: 'Fifteen percent off any single book in store.',
        terms: 'One book per visit. Excludes signed first editions.',
        estimatedSaving: 3.50 },
      { code: 'RMV-demo-08b', isMandatory: true, type: 'SPEND_AND_SAVE', title: 'Spend £30, Save £8',
        description: 'Eight pounds off when you spend thirty or more in a single transaction.',
        terms: 'One per visit. Full-price items only.',
        estimatedSaving: 8.00 },
    ],
  },
  {
    id: 'demo-merchant-09',
    businessName: 'Camden Cinema Social',
    tradingName: 'Camden Social',
    description:
      'A four-screen independent cinema with a proper bar and a programme that mixes new releases, restored classics, and director-led seasons.',
    websiteUrl: 'https://camdensocial-demo.redeemo.co.uk',
    logoUrl:    U('photo-1489599849927-2ee91cede3ba', 400),
    bannerUrl:  U('photo-1536440136628-849c177e76a1'),
    adminEmail: 'demo-merchant-09@redeemo.local',
    primaryCategoryName: 'Entertainment',
    branches: [
      {
        suffix: 'a',
        name: 'Camden',
        isMainBranch: true,
        addressLine1: '22 Parkway',
        city: 'London',
        postcode: 'NW1 7AA',
        latitude: 51.5390, longitude: -0.1441,
        phone: '+442074855000',
        hours: [
          [1, '14:00', '23:30'], [2, '14:00', '23:30'], [3, '14:00', '23:30'], [4, '14:00', '00:00'],
          [5, '12:00', '00:30'], [6, '11:00', '00:30'], [0, '11:00', '23:00'],
        ],
        amenityNames: ['Card Payment', 'Accessible'],
        reviews: [
          { reviewerIdx: 4, rating: 5, comment: 'Best seats in any cinema I\'ve been in. Bar after is a proper bonus.' },
          { reviewerIdx: 1, rating: 5, comment: 'Retrospective seasons are genuinely great. Staff care about the films.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-09a', isMandatory: true, type: 'BOGO', title: '2-for-1 Tuesdays',
        description: 'Buy one ticket, get one free on any film, all day Tuesday.',
        terms: 'Matched tickets must be for the same screening. Subject to availability.',
        estimatedSaving: 12.50 },
      { code: 'RMV-demo-09b', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '20% Off Any Screening',
        description: 'Twenty percent off a standard ticket, any day.',
        terms: 'One per member per visit. Excludes special events.',
        estimatedSaving: 3.00 },
      { code: 'RCV-demo-09c', type: 'PACKAGE_DEAL', title: 'Film + Drink £18',
        description: 'A standard ticket plus a beer, wine, or soft drink for £18.',
        terms: 'Before 6pm. Upgrade charges apply for special screenings.',
        estimatedSaving: 5.50 },
    ],
  },
  {
    id: 'demo-merchant-10',
    businessName: 'Pimlico Florals',
    tradingName: 'Pimlico Florals',
    description:
      'A small family-run florist supplying seasonal British-grown stems. Wedding work, subscriptions, and a weekly by-the-stem bar in the shop on Fridays.',
    websiteUrl: 'https://pimlicoflorals-demo.redeemo.co.uk',
    logoUrl:    U('photo-1561181286-d3fee7d55364', 400),
    bannerUrl:  U('photo-1508610048659-a06b669e3321'),
    adminEmail: 'demo-merchant-10@redeemo.local',
    primaryCategoryName: 'Retail & Shopping',
    branches: [
      {
        suffix: 'a',
        name: 'Pimlico',
        isMainBranch: true,
        addressLine1: '9 Warwick Way',
        city: 'London',
        postcode: 'SW1V 1QT',
        latitude: 51.4898, longitude: -0.1437,
        phone: '+442078289991',
        hours: [
          [1, '09:30', '18:00'], [2, '09:30', '18:00'], [3, '09:30', '18:00'], [4, '09:30', '19:00'],
          [5, '09:00', '19:00'], [6, '09:00', '17:00'], [0, 'closed'],
        ],
        amenityNames: ['Card Payment', 'Delivery'],
        reviews: [
          { reviewerIdx: 2, rating: 5, comment: 'Arranged bouquets for my wedding — calm, communicative, stunning work.' },
          { reviewerIdx: 3, rating: 4, comment: 'Lovely seasonal stems and proper advice. Small shop, arrive early on Friday.' },
        ],
      },
    ],
    vouchers: [
      { code: 'RMV-demo-10a', isMandatory: true, type: 'DISCOUNT_PERCENT', title: '20% Off Hand-Tied Bouquets',
        description: 'Twenty percent off any ready-made or made-to-order hand-tied bouquet.',
        terms: 'In-store only. Excludes bespoke wedding orders.',
        estimatedSaving: 10.00 },
      { code: 'RMV-demo-10b', isMandatory: true, type: 'FREEBIE', title: 'Free Local Delivery',
        description: 'Complimentary local delivery on orders over £45.',
        terms: 'Within SW1 / SW3 / SW7 postcodes.',
        estimatedSaving: 7.50 },
    ],
  },
]

// ─── Seed runner ──────────────────────────────────────────────────────────

async function seedDemo() {
  console.log('Seeding demo merchants...')

  // 1. Resolve shared references (categories, amenities) by name from the main seed
  const allCategories = await prisma.category.findMany({ select: { id: true, name: true } })
  const categoryByName = Object.fromEntries(allCategories.map(c => [c.name, c.id]))

  const allAmenities = await prisma.amenity.findMany({ select: { id: true, name: true } })
  const amenityByName = Object.fromEntries(allAmenities.map(a => [a.name, a.id]))

  // Sanity check — fail loud if main seed hasn't been run
  const requiredCats = ['Cafes & Coffee', 'Restaurants', 'Hair Salons', 'Nail & Beauty', 'Health & Fitness', 'Retail & Shopping', 'Entertainment']
  const missingCats = requiredCats.filter(n => !categoryByName[n])
  if (missingCats.length > 0) {
    throw new Error(
      `Missing categories: ${missingCats.join(', ')}. Run \`npx prisma db seed\` first to create the base seed.`,
    )
  }

  // 2. Reviewer users — shared across merchants
  for (const r of REVIEWERS) {
    await prisma.user.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        email: r.email,
        passwordHash: devHash('DemoReviewer1!'),
        firstName: r.firstName,
        lastName: r.lastName,
        status: 'ACTIVE',
      },
    })
  }
  console.log(`Upserted ${REVIEWERS.length} demo reviewer users`)

  // 3. Merchants
  for (const m of DEMO_MERCHANTS) {
    const primaryCategoryId = categoryByName[m.primaryCategoryName]
    if (!primaryCategoryId) {
      throw new Error(`Unknown primary category "${m.primaryCategoryName}" for ${m.id}`)
    }

    const additionalIds = (m.additionalCategoryNames ?? [])
      .map(n => categoryByName[n])
      .filter((x): x is string => Boolean(x))

    // Upsert merchant
    await prisma.merchant.upsert({
      where: { id: m.id },
      update: {
        businessName: m.businessName,
        tradingName: m.tradingName,
        description: m.description,
        websiteUrl: m.websiteUrl,
        logoUrl: m.logoUrl,
        bannerUrl: m.bannerUrl,
        primaryCategoryId,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        contractStatus: 'SIGNED',
      },
      create: {
        id: m.id,
        businessName: m.businessName,
        tradingName: m.tradingName,
        description: m.description,
        websiteUrl: m.websiteUrl,
        logoUrl: m.logoUrl,
        bannerUrl: m.bannerUrl,
        primaryCategoryId,
        status: 'ACTIVE',
        verificationStatus: 'VERIFIED',
        contractStatus: 'SIGNED',
        contractStartDate: new Date(),
        contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        onboardingStep: 'LIVE',
      },
    })

    // Merchant categories — primary + additional (idempotent via unique constraint)
    for (const catId of [primaryCategoryId, ...additionalIds]) {
      await prisma.merchantCategory.upsert({
        where: { merchantId_categoryId: { merchantId: m.id, categoryId: catId } },
        update: { isPrimary: catId === primaryCategoryId },
        create: { merchantId: m.id, categoryId: catId, isPrimary: catId === primaryCategoryId },
      })
    }

    // Merchant admin (one per merchant)
    await prisma.merchantAdmin.upsert({
      where: { email: m.adminEmail },
      update: {},
      create: {
        merchantId: m.id,
        email: m.adminEmail,
        passwordHash: devHash('DemoMerchant1!'),
        firstName: 'Demo',
        lastName: m.tradingName,
        jobTitle: 'Owner',
        status: 'ACTIVE',
      },
    })

    // Branches
    for (const b of m.branches) {
      const branchId = `${m.id}-branch-${b.suffix}`
      await prisma.branch.upsert({
        where: { id: branchId },
        update: {
          name: b.name,
          addressLine1: b.addressLine1,
          addressLine2: b.addressLine2 ?? null,
          city: b.city,
          postcode: b.postcode,
          latitude: b.latitude,
          longitude: b.longitude,
          phone: b.phone,
          email: b.email ?? null,
          isActive: true,
        },
        create: {
          id: branchId,
          merchantId: m.id,
          name: b.name,
          isMainBranch: b.isMainBranch ?? false,
          addressLine1: b.addressLine1,
          addressLine2: b.addressLine2 ?? null,
          city: b.city,
          postcode: b.postcode,
          country: 'GB',
          latitude: b.latitude,
          longitude: b.longitude,
          phone: b.phone,
          email: b.email ?? null,
          redemptionPin: encrypt('1234'),
          isActive: true,
        },
      })

      // Opening hours (one row per dayOfWeek)
      for (const h of b.hours) {
        const [dayOfWeek, open, close] = h
        const isClosed = open === 'closed'
        await prisma.branchOpeningHours.upsert({
          where: { branchId_dayOfWeek: { branchId, dayOfWeek: dayOfWeek as number } },
          update: {
            openTime: isClosed ? null : open,
            closeTime: isClosed ? null : (close as string),
            isClosed,
          },
          create: {
            branchId,
            dayOfWeek: dayOfWeek as number,
            openTime: isClosed ? null : open,
            closeTime: isClosed ? null : (close as string),
            isClosed,
          },
        })
      }

      // Amenities
      for (const name of b.amenityNames) {
        const amenityId = amenityByName[name]
        if (!amenityId) continue
        await prisma.branchAmenity.upsert({
          where: { branchId_amenityId: { branchId, amenityId } },
          update: {},
          create: { branchId, amenityId },
        })
      }

      // Reviews (one per reviewer-branch pair, enforced by schema unique)
      for (const r of b.reviews) {
        const reviewer = REVIEWERS[r.reviewerIdx]
        if (!reviewer) continue
        await prisma.review.upsert({
          where: { userId_branchId: { userId: reviewer.id, branchId } },
          update: { rating: r.rating, comment: r.comment },
          create: {
            userId: reviewer.id,
            branchId,
            rating: r.rating,
            comment: r.comment,
          },
        })
      }
    }

    // Vouchers
    for (const v of m.vouchers) {
      await prisma.voucher.upsert({
        where: { code: v.code },
        update: {
          title: v.title,
          description: v.description,
          terms: v.terms,
          estimatedSaving: v.estimatedSaving,
          status: 'ACTIVE',
          approvalStatus: 'APPROVED',
        },
        create: {
          merchantId: m.id,
          code: v.code,
          isMandatory: v.isMandatory ?? false,
          type: v.type,
          title: v.title,
          description: v.description,
          terms: v.terms,
          estimatedSaving: v.estimatedSaving,
          status: 'ACTIVE',
          approvalStatus: 'APPROVED',
          approvedAt: new Date(),
        },
      })
    }

    // Featured placement — clear old, insert fresh 30-day window if flagged
    await prisma.featuredMerchant.deleteMany({
      where: { merchantId: m.id, id: { startsWith: 'demo-' } },
    })
    if (m.featured) {
      const now = new Date()
      const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      await prisma.featuredMerchant.create({
        data: {
          id: `demo-featured-${m.id}`,
          merchantId: m.id,
          startDate: now,
          endDate: thirtyDays,
          costGbp: 0,
          radiusMiles: 10,
          targetLocations: ['London'],
          sortByDistance: true,
          paymentStatus: 'PAID',
          isActive: true,
        },
      })
    }

    console.log(`  ✓ ${m.tradingName} (${m.branches.length} branch${m.branches.length === 1 ? '' : 'es'}, ${m.vouchers.length} vouchers)`)
  }

  // 4. Campaigns — clear old demo campaigns and insert 3 fresh ones
  await prisma.campaign.deleteMany({ where: { id: { startsWith: 'demo-campaign-' } } })
  const now = new Date()
  const campaignData = [
    {
      id: 'demo-campaign-1',
      name: 'Summer Savings',
      description: 'Exclusive deals from top local businesses all summer long.',
      status: 'ACTIVE' as const,
      startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      endDate:   new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'demo-campaign-2',
      name: 'New in Your Area',
      description: 'Fresh openings and new vouchers from merchants near you.',
      status: 'ACTIVE' as const,
      startDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      endDate:   new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'demo-campaign-3',
      name: 'Redeemo Picks',
      description: "Hand-picked vouchers our team loves. Don't miss out.",
      status: 'ACTIVE' as const,
      startDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      endDate:   new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000),
    },
  ]
  for (const c of campaignData) {
    await prisma.campaign.create({ data: c })
  }
  console.log(`Upserted ${campaignData.length} demo campaigns`)

  // 5. Trending redemptions — give demo-merchant-01..04 some this-month redemptions
  //    so the Trending section is populated. Uses reviewer users as fake redeemers.
  //    Only create if not already present (idempotent via unique code).
  const demoRedemptions = [
    { id: 'demo-red-01a', userId: 'demo-user-reviewer-1', merchantId: 'demo-merchant-01', branchSuffix: 'a', voucherIdx: 0 },
    { id: 'demo-red-01b', userId: 'demo-user-reviewer-2', merchantId: 'demo-merchant-01', branchSuffix: 'a', voucherIdx: 0 },
    { id: 'demo-red-01c', userId: 'demo-user-reviewer-3', merchantId: 'demo-merchant-01', branchSuffix: 'a', voucherIdx: 1 },
    { id: 'demo-red-02a', userId: 'demo-user-reviewer-1', merchantId: 'demo-merchant-02', branchSuffix: 'a', voucherIdx: 0 },
    { id: 'demo-red-02b', userId: 'demo-user-reviewer-2', merchantId: 'demo-merchant-02', branchSuffix: 'a', voucherIdx: 0 },
    { id: 'demo-red-03a', userId: 'demo-user-reviewer-1', merchantId: 'demo-merchant-03', branchSuffix: 'a', voucherIdx: 0 },
    { id: 'demo-red-04a', userId: 'demo-user-reviewer-1', merchantId: 'demo-merchant-04', branchSuffix: 'a', voucherIdx: 0 },
    { id: 'demo-red-04b', userId: 'demo-user-reviewer-2', merchantId: 'demo-merchant-04', branchSuffix: 'a', voucherIdx: 0 },
  ]
  let redeemedCount = 0
  for (const r of demoRedemptions) {
    const branch = await prisma.branch.findFirst({ where: { merchantId: r.merchantId, name: { not: '' } }, select: { id: true }, orderBy: { isMainBranch: 'desc' } })
    const voucher = await prisma.voucher.findFirst({ where: { merchantId: r.merchantId, status: 'ACTIVE' }, select: { id: true }, orderBy: { createdAt: 'asc' }, skip: r.voucherIdx })
    if (!branch || !voucher) continue
    const existing = await prisma.voucherRedemption.findUnique({ where: { redemptionCode: r.id } })
    if (existing) continue
    const voucherFull = await prisma.voucher.findUnique({ where: { id: voucher.id }, select: { estimatedSaving: true } })
    await prisma.voucherRedemption.create({
      data: {
        id: r.id,
        userId: r.userId,
        voucherId: voucher.id,
        branchId: branch.id,
        redemptionCode: r.id,
        estimatedSaving: voucherFull?.estimatedSaving ?? 0,
        redeemedAt: new Date(now.getTime() - Math.floor(Math.random() * 7) * 24 * 60 * 60 * 1000),
      },
    })
    redeemedCount++
  }
  console.log(`Created ${redeemedCount} demo redemptions for trending`)

  console.log(`\n✅ Demo seed complete: ${DEMO_MERCHANTS.length} merchants.`)
  console.log(`   Remove with: npm run seed:demo:clear`)
}

// ─── Cleanup (tear down all demo-* records) ───────────────────────────────

async function clearDemo() {
  console.log('Clearing demo records...')

  // Delete in FK-safe order:
  // featuredMerchant → voucher → branchAmenity/openingHours/reviews → branch → merchantAdmin → merchantCategory → merchant → reviewer users
  const merchantIds = DEMO_MERCHANTS.map(m => m.id)

  const del = async (label: string, fn: () => Promise<{ count: number }>) => {
    try {
      const r = await fn()
      console.log(`  removed ${r.count} ${label}`)
    } catch (e) {
      console.error(`  failed to remove ${label}:`, (e as Error).message)
    }
  }

  await del('featuredMerchant rows',
    () => prisma.featuredMerchant.deleteMany({ where: { merchantId: { in: merchantIds } } }))

  await del('voucher rows',
    () => prisma.voucher.deleteMany({ where: { code: { startsWith: 'RMV-demo-' } } }))
  await del('voucher rows (custom)',
    () => prisma.voucher.deleteMany({ where: { code: { startsWith: 'RCV-demo-' } } }))

  await del('review rows',
    () => prisma.review.deleteMany({ where: { branch: { merchantId: { in: merchantIds } } } }))
  await del('branchAmenity rows',
    () => prisma.branchAmenity.deleteMany({ where: { branch: { merchantId: { in: merchantIds } } } }))
  await del('branchOpeningHours rows',
    () => prisma.branchOpeningHours.deleteMany({ where: { branch: { merchantId: { in: merchantIds } } } }))

  await del('branch rows',
    () => prisma.branch.deleteMany({ where: { merchantId: { in: merchantIds } } }))

  await del('merchantAdmin rows',
    () => prisma.merchantAdmin.deleteMany({ where: { merchantId: { in: merchantIds } } }))
  await del('merchantCategory rows',
    () => prisma.merchantCategory.deleteMany({ where: { merchantId: { in: merchantIds } } }))

  await del('merchant rows',
    () => prisma.merchant.deleteMany({ where: { id: { in: merchantIds } } }))

  await del('reviewer user rows',
    () => prisma.user.deleteMany({ where: { id: { in: REVIEWERS.map(r => r.id) } } }))

  console.log('\n✅ Demo records cleared.')
}

// ─── Entry ────────────────────────────────────────────────────────────────

const mode = process.argv.includes('--clear') ? 'clear' : 'seed'

const run = mode === 'clear' ? clearDemo : seedDemo

run()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
