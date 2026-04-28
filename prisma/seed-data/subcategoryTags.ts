import { TOP_LEVEL_CATEGORIES, SUBCATEGORIES } from './categories'
import { CUISINE_TAGS, SPECIALTY_TAGS, HIGHLIGHT_TAGS, DETAIL_TAGS, type SeedTag } from './tags'

// Maps SPECIALTY tag label → parent top-level category name.
// Built by walking the §3.3 groups in tags.ts in declaration order
// and tagging each tag with its parent group as we go.
export const SPECIALTY_PARENT: Record<string, string> = {
  // Food & Drink
  'Pizza':'Food & Drink','Burgers':'Food & Drink','Sushi':'Food & Drink','Ramen':'Food & Drink','Dim Sum':'Food & Drink',
  'Tapas':'Food & Drink','Steakhouse':'Food & Drink','Seafood':'Food & Drink','BBQ':'Food & Drink','Brunch':'Food & Drink',
  'Sunday Roast':'Food & Drink','Afternoon Tea':'Food & Drink',
  'Specialty Coffee':'Food & Drink','Matcha':'Food & Drink','Bubble Tea':'Food & Drink',
  'Cocktails':'Food & Drink','Craft Beer':'Food & Drink','Wine Bar':'Food & Drink','Natural Wine':'Food & Drink',
  'Sports Bar':'Food & Drink','Karaoke':'Food & Drink',
  'Patisserie':'Food & Drink','Gelato':'Food & Drink',
  'Vegan':'Food & Drink','Plant-Based':'Food & Drink','Vegetarian':'Food & Drink',

  // Beauty & Wellness
  'Manicure':'Beauty & Wellness','Pedicure':'Beauty & Wellness','Gel Nails':'Beauty & Wellness','Acrylics':'Beauty & Wellness','BIAB':'Beauty & Wellness',
  'Lash Extensions':'Beauty & Wellness','Lash Lift':'Beauty & Wellness','Brow Lamination':'Beauty & Wellness','HD Brows':'Beauty & Wellness',
  'Threading':'Beauty & Wellness','Waxing':'Beauty & Wellness',
  'Hair Colour':'Beauty & Wellness','Balayage':'Beauty & Wellness','Highlights':'Beauty & Wellness','Keratin':'Beauty & Wellness','Blow Dry':'Beauty & Wellness',
  'Curly Hair Specialist':'Beauty & Wellness',"Men's Grooming":'Beauty & Wellness','Hot Towel Shave':'Beauty & Wellness',
  'Facial':'Beauty & Wellness','Deep Tissue':'Beauty & Wellness','Sports Massage':'Beauty & Wellness','Hot Stone':'Beauty & Wellness','Lymphatic':'Beauty & Wellness','Reflexology':'Beauty & Wellness',
  'Botox':'Beauty & Wellness','Dermal Fillers':'Beauty & Wellness','Lip Filler':'Beauty & Wellness','Skin Booster':'Beauty & Wellness','Microneedling':'Beauty & Wellness',
  'Sauna':'Beauty & Wellness','Steam Room':'Beauty & Wellness','Float Tank':'Beauty & Wellness','IV Drip':'Beauty & Wellness',
  'Hammam':'Beauty & Wellness','Korean Spa':'Beauty & Wellness',

  // Health & Fitness
  'Yoga':'Health & Fitness','Hot Yoga':'Health & Fitness','Pilates':'Health & Fitness','Reformer Pilates':'Health & Fitness','Barre':'Health & Fitness',
  'HIIT':'Health & Fitness','Spin':'Health & Fitness','Cycling':'Health & Fitness','Strength':'Health & Fitness',
  'CrossFit':'Health & Fitness','F45':'Health & Fitness','Functional':'Health & Fitness','Bootcamp':'Health & Fitness',
  'Boxing':'Health & Fitness','Kickboxing':'Health & Fitness','Muay Thai':'Health & Fitness','MMA':'Health & Fitness','BJJ':'Health & Fitness',
  'Karate':'Health & Fitness','Judo':'Health & Fitness','Taekwondo':'Health & Fitness',
  'Bouldering':'Health & Fitness','Indoor Climbing':'Health & Fitness',
  'Swimming':'Health & Fitness','Personal Training':'Health & Fitness',
  'Ballet':'Health & Fitness','Hip-Hop':'Health & Fitness','Latin':'Health & Fitness',

  // Out & About
  'IMAX':'Out & About','Boutique Cinema':'Out & About',
  'Stand-Up Comedy':'Out & About','Live Music':'Out & About','Gig':'Out & About','Theatre':'Out & About','Musical':'Out & About',
  'Cookery Class':'Out & About','Pottery Class':'Out & About','Life Drawing':'Out & About','Wine Tasting':'Out & About',
  'Cocktail Class':'Out & About','Candle-Making':'Out & About','Floristry Class':'Out & About',
  'Walking Tour':'Out & About','Boat Trip':'Out & About','Ghost Tour':'Out & About','Food Tour':'Out & About',
  'Helicopter Tour':'Out & About','Hot Air Balloon':'Out & About',
  'Theme Park':'Out & About','Water Park':'Out & About','Adventure Park':'Out & About',
  'Wildlife Safari':'Out & About','Aquarium':'Out & About',
  'VR Experience':'Out & About','Themed Experience':'Out & About',

  // Shopping
  'Womenswear':'Shopping','Menswear':'Shopping','Kidswear':'Shopping','Streetwear':'Shopping',
  'Designer':'Shopping','Vintage':'Shopping','Sustainable':'Shopping','Independent':'Shopping',
  'Homeware':'Shopping','Books':'Shopping',
  'Records':'Shopping','Board Games':'Shopping','Comics':'Shopping','Art Supplies':'Shopping',
  'Crafts':'Shopping','Models & Hobbies':'Shopping','Music Instruments':'Shopping',

  // Home & Local Services
  'End of Tenancy':'Home & Local Services','Deep Clean':'Home & Local Services','Carpet Cleaning':'Home & Local Services','Office Cleaning':'Home & Local Services',
  'Phone Repair':'Home & Local Services','Laptop Repair':'Home & Local Services','Tablet Repair':'Home & Local Services','Console Repair':'Home & Local Services',
  'Wedding Alterations':'Home & Local Services','Bridal':'Home & Local Services','Suit Tailoring':'Home & Local Services',

  // Travel & Hotels
  'Boutique':'Travel & Hotels','Spa':'Travel & Hotels','Resort':'Travel & Hotels','Country House':'Travel & Hotels',
  'Adults-Only':'Travel & Hotels','Romantic':'Travel & Hotels',

  // Health & Medical
  'Cosmetic Dentistry':'Health & Medical','Invisalign':'Health & Medical','Orthodontics':'Health & Medical',
  'Eye Test':'Health & Medical','Contact Lenses':'Health & Medical','Designer Frames':'Health & Medical',
  'Sports Physio':'Health & Medical','Pre/Post-Natal':'Health & Medical',

  // Family & Kids
  'Toddler':'Family & Kids','All-Ages':'Family & Kids','Adventure':'Family & Kids',
  'Gymnastics':'Family & Kids','Swimming Lessons':'Family & Kids','Football':'Family & Kids',
  'Drama':'Family & Kids','Music Lessons':'Family & Kids','Art':'Family & Kids','Coding':'Family & Kids',
  'Birthday Party':'Family & Kids','Themed Party':'Family & Kids','Laser Tag':'Family & Kids',

  // Auto & Garage
  'Mercedes Specialist':'Auto & Garage','BMW Specialist':'Auto & Garage','Classic Car':'Auto & Garage',
  'Performance':'Auto & Garage','EV Specialist':'Auto & Garage',

  // Pet Services
  'Cat Grooming':'Pet Services','Mobile Grooming':'Pet Services','Hand-Stripping':'Pet Services',
  'Puppy Training':'Pet Services','Behavioural':'Pet Services',
}

// Subcategories (by name) where Cuisine tags are eligible AS PRIMARY descriptor.
// Per §3.8: Restaurant, Pub & Gastropub, Takeaway = primary-eligible cuisines.
// Other Food & Drink subcategories (Cafe, Bar, Bakery, etc.) accept cuisine for filter
// but use specialty tags for descriptors.
export const PRIMARY_CUISINE_SUBCATEGORIES = new Set([
  'Restaurant','Pub & Gastropub','Takeaway',
])

// All Food & Drink subcategories accept cuisine tags (just not all primary-eligible)
export const FOOD_DRINK_SUBCATS_FOR_CUISINE = new Set([
  'Restaurant','Cafe & Coffee','Bakery','Dessert Shop','Takeaway','Bar','Pub & Gastropub','Food Hall',
])
