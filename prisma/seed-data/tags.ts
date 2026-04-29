import type { TagType } from '../../generated/prisma/client'

export type SeedTag = { label: string; type: TagType; descriptorEligible: boolean }

// §3.2 — Cuisine (32 tags, all descriptor-eligible)
export const CUISINE_TAGS: SeedTag[] = [
  'British','Modern British','Modern European','Italian','French','Spanish','Portuguese','Greek','Turkish','Lebanese','Mediterranean',
  'Indian','Pakistani','Nepalese','Bangladeshi','Sri Lankan','Persian',
  'Chinese','Japanese','Korean','Thai','Vietnamese','Malaysian','Pan-Asian',
  'Mexican','American','Caribbean','Brazilian','African','Ethiopian',
  'Middle Eastern','Fusion',
].map((label) => ({ label, type: 'CUISINE' as const, descriptorEligible: true }))

// §3.3 — Specialty (descriptor-eligible explicitly listed)
type SpecialtyDef = { label: string; descriptorEligible: boolean }
const def = (label: string, eligible = false): SpecialtyDef => ({ label, descriptorEligible: eligible })

export const SPECIALTY_TAGS: SeedTag[] = [
  // Food & Drink
  def('Pizza', true), def('Burgers', true), def('Sushi', true), def('Ramen', true), def('Dim Sum', true),
  def('Tapas', true), def('Steakhouse', true), def('Seafood', true), def('BBQ', true), def('Brunch', true),
  def('Sunday Roast'), def('Afternoon Tea', true),
  def('Specialty Coffee', true), def('Matcha', true), def('Bubble Tea', true),
  def('Cocktails', true), def('Craft Beer', true), def('Wine Bar', true), def('Natural Wine'),
  def('Sports Bar', true), def('Karaoke', true),
  def('Patisserie', true), def('Gelato', true),
  def('Vegan', true), def('Plant-Based'), def('Vegetarian'),

  // Beauty & Wellness
  def('Manicure'), def('Pedicure'), def('Gel Nails'), def('Acrylics'), def('BIAB'),
  def('Lash Extensions'), def('Lash Lift'), def('Brow Lamination'), def('HD Brows'),
  def('Threading'), def('Waxing'),
  def('Hair Colour'), def('Balayage'), def('Highlights'), def('Keratin'), def('Blow Dry'),
  def('Curly Hair Specialist'), def("Men's Grooming"), def('Hot Towel Shave'),
  def('Facial'), def('Deep Tissue'), def('Sports Massage'), def('Hot Stone'), def('Lymphatic'), def('Reflexology'),
  def('Botox'), def('Dermal Fillers'), def('Lip Filler'), def('Skin Booster'), def('Microneedling'),
  def('Sauna'), def('Steam Room'), def('Float Tank'), def('IV Drip'),
  def('Hammam', true), def('Korean Spa', true),

  // Health & Fitness
  def('Yoga', true), def('Hot Yoga', true), def('Pilates', true), def('Reformer Pilates', true), def('Barre', true),
  def('HIIT', true), def('Spin', true), def('Cycling', true), def('Strength'),
  def('CrossFit', true), def('F45', true), def('Functional'), def('Bootcamp', true),
  def('Boxing', true), def('Kickboxing', true), def('Muay Thai', true), def('MMA', true), def('BJJ', true),
  def('Karate', true), def('Judo', true), def('Taekwondo', true),
  def('Bouldering', true), def('Indoor Climbing', true),
  def('Swimming'), def('Personal Training'),
  def('Ballet', true), def('Hip-Hop', true), def('Latin', true),

  // Out & About
  def('IMAX'), def('Boutique Cinema', true),
  def('Stand-Up Comedy'), def('Live Music'), def('Gig'), def('Theatre'), def('Musical'),
  def('Cookery Class', true), def('Pottery Class', true), def('Life Drawing', true),
  def('Wine Tasting', true), def('Cocktail Class', true), def('Candle-Making', true), def('Floristry Class', true),
  def('Walking Tour', true), def('Boat Trip', true), def('Ghost Tour', true), def('Food Tour', true),
  def('Helicopter Tour', true), def('Hot Air Balloon', true),
  def('Theme Park', true), def('Water Park', true), def('Adventure Park', true),
  def('Wildlife Safari', true), def('Aquarium', true),
  def('VR Experience', true), def('Themed Experience', true),

  // Shopping
  def('Womenswear', true), def('Menswear', true), def('Kidswear', true), def('Streetwear', true),
  def('Designer'), def('Vintage'), def('Sustainable'), def('Independent'),
  def('Homeware'), def('Books'),
  def('Records', true), def('Board Games', true), def('Comics', true), def('Art Supplies', true),
  def('Crafts', true), def('Models & Hobbies', true), def('Music Instruments', true),

  // Home & Local Services
  def('End of Tenancy'), def('Deep Clean'), def('Carpet Cleaning'), def('Office Cleaning'),
  def('Phone Repair'), def('Laptop Repair'), def('Tablet Repair'), def('Console Repair'),
  def('Wedding Alterations'), def('Bridal'), def('Suit Tailoring'),

  // Travel & Hotels
  def('Boutique', true), def('Spa', true), def('Resort', true), def('Country House', true),
  def('Adults-Only', true), def('Romantic', true),

  // Health & Medical
  def('Cosmetic Dentistry', true), def('Invisalign'), def('Orthodontics'),
  def('Eye Test'), def('Contact Lenses'), def('Designer Frames', true),
  def('Sports Physio', true), def('Pre/Post-Natal', true),

  // Family & Kids
  def('Toddler'), def('All-Ages'), def('Adventure'),
  def('Gymnastics', true), def('Swimming Lessons', true), def('Football', true),
  def('Drama', true), def('Music Lessons', true), def('Art', true), def('Coding', true),
  def('Birthday Party'), def('Themed Party'), def('Laser Tag', true),

  // Auto & Garage
  def('Mercedes Specialist', true), def('BMW Specialist', true), def('Classic Car', true),
  def('Performance', true), def('EV Specialist', true),

  // Pet Services
  def('Cat Grooming'), def('Mobile Grooming', true), def('Hand-Stripping'),
  def('Puppy Training', true), def('Behavioural', true),
].map(({ label, descriptorEligible }) => ({ label, type: 'SPECIALTY' as const, descriptorEligible }))

// §3.4 — Highlights (18 tags, never descriptor-eligible)
export const HIGHLIGHT_TAGS: SeedTag[] = [
  'Halal','Kosher','Vegan-Friendly','Vegetarian-Friendly',
  'Outdoor Seating','Beer Garden','Rooftop','Waterside',
  'Family-Friendly','Pet-Friendly','Wheelchair Accessible',
  'Date Night','Open Late',
  'Independent','Women-Owned','Black-Owned','LGBTQ+ Friendly','Eco-Conscious',
].map((label) => ({ label, type: 'HIGHLIGHT' as const, descriptorEligible: false }))

// §3.5 — Details (~35 tags, never descriptor-eligible)
export const DETAIL_TAGS: SeedTag[] = [
  // Dietary granularity
  'Gluten-Free Options','Dairy-Free Options','Nut-Free Options',
  // Space granularity (Group-Friendly demoted from Highlights — see spec)
  'Private Dining','Quiet','Live Sport','Baby-Changing','High Chairs','Group-Friendly',
  // Access granularity
  'Step-Free Access','Accessible Toilet','Hearing Loop',
  // Amenities
  'Free Wi-Fi','Parking','EV Charging','Air Conditioning',
  // Booking & service
  'Bookable Online','Walk-Ins Welcome','Reservation-Only','Same-Day Booking',
  'Takeaway Available','Delivery Available','Click & Collect',
  // Hours
  'Open Sundays','Open Bank Holidays','Open 24h',
  // Payment
  'Card-Only','Cash Accepted','Apple Pay','Contactless',
].map((label) => ({ label, type: 'DETAIL' as const, descriptorEligible: false }))

export const ALL_TAGS: SeedTag[] = [
  ...CUISINE_TAGS, ...SPECIALTY_TAGS, ...HIGHLIGHT_TAGS, ...DETAIL_TAGS,
]
