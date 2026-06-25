// Per-subcategory SPECIALTY tag mapping (Phase 1 re-curation, 2026-06-25).
//
// Keyed parent -> subcategory -> specialty labels. REPLACES the old top-category
// fan-out (the previous `SPECIALTY_PARENT` keyed each specialty to a parent and
// the seeder linked it to EVERY subcategory under that parent, so e.g. a Dessert
// Shop showed "Pizza" and a Hearing Centre showed "Cosmetic Dentistry"). Now each
// subcategory carries only the specialties that genuinely fit it.
//
// Phase 1 uses EXISTING tag labels only (no new tags). Subcategories with no
// genuinely-relevant existing specialty are OMITTED here; the onboarding
// "What you're known for" step hides itself when a subcategory has no specialties.
// Phase 2 (deferred, owner-approved) may add new tag labels for the omitted
// service subcategories. See docs/superpowers/plans/2026-06-25-merchant-onboarding-specialty-recuration.md.
//
// Aesthetics Clinic cross-listing: it exists as a subcategory under BOTH
// Beauty & Wellness and Health & Medical (categories.ts). Keying by
// parent -> subcategory keeps each cross-listing in its own world:
//   - Beauty & Wellness -> Aesthetics Clinic: Botox, Dermal Fillers, etc.
//   - Health & Medical  -> Aesthetics Clinic: omitted (Phase 2 gap).
export const SPECIALTY_BY_SUBCATEGORY: Record<string, Record<string, string[]>> = {
  'Food & Drink': {
    "Restaurant": ['Pizza', 'Burgers', 'Sushi', 'Ramen', 'Dim Sum', 'Tapas', 'Steakhouse', 'Seafood', 'BBQ', 'Brunch', 'Sunday Roast', 'Vegan', 'Plant-Based', 'Vegetarian'],
    "Cafe & Coffee": ['Specialty Coffee', 'Matcha', 'Bubble Tea', 'Brunch', 'Afternoon Tea', 'Vegan', 'Plant-Based', 'Vegetarian'],
    "Bakery": ['Patisserie', 'Vegan', 'Vegetarian'],
    "Dessert Shop": ['Patisserie', 'Gelato', 'Matcha', 'Bubble Tea', 'Vegan'],
    "Takeaway": ['Pizza', 'Burgers', 'Sushi', 'Ramen', 'Dim Sum', 'BBQ', 'Vegan', 'Vegetarian'],
    "Bar": ['Cocktails', 'Craft Beer', 'Wine Bar', 'Natural Wine', 'Sports Bar', 'Karaoke', 'Tapas'],
    "Pub & Gastropub": ['Sunday Roast', 'Craft Beer', 'Cocktails', 'Wine Bar', 'Sports Bar', 'Burgers', 'Steakhouse', 'Seafood', 'Brunch', 'Vegetarian', 'Vegan'],
    "Food Hall": ['Pizza', 'Burgers', 'Sushi', 'Ramen', 'Dim Sum', 'Tapas', 'BBQ', 'Seafood', 'Cocktails', 'Craft Beer', 'Specialty Coffee', 'Vegan', 'Plant-Based', 'Vegetarian'],
  },
  'Beauty & Wellness': {
    "Hair Salon": ['Hair Colour', 'Balayage', 'Highlights', 'Keratin', 'Blow Dry', 'Curly Hair Specialist'],
    "Barber": ['Men\'s Grooming', 'Hot Towel Shave'],
    "Nail Salon": ['Manicure', 'Pedicure', 'Gel Nails', 'Acrylics', 'BIAB'],
    "Beauty Salon": ['Lash Extensions', 'Lash Lift', 'Brow Lamination', 'HD Brows', 'Threading', 'Waxing', 'Facial', 'Manicure', 'Pedicure', 'Gel Nails'],
    "Day Spa": ['Facial', 'Deep Tissue', 'Hot Stone', 'Lymphatic', 'Reflexology', 'Sauna', 'Steam Room', 'Hammam', 'Korean Spa', 'Float Tank'],
    "Massage Studio": ['Deep Tissue', 'Sports Massage', 'Hot Stone', 'Lymphatic', 'Reflexology'],
    "Aesthetics Clinic": ['Botox', 'Dermal Fillers', 'Lip Filler', 'Skin Booster', 'Microneedling', 'Facial'],
    "Wellness Studio": ['IV Drip', 'Float Tank', 'Sauna', 'Steam Room', 'Reflexology', 'Lymphatic'],
  },
  'Health & Fitness': {
    "Gym": ['Strength', 'Functional', 'HIIT', 'CrossFit', 'Spin', 'Cycling', 'Bootcamp', 'F45', 'Personal Training'],
    "Boutique Studio": ['Yoga', 'Hot Yoga', 'Pilates', 'Reformer Pilates', 'Barre', 'HIIT', 'Spin', 'Cycling', 'Bootcamp', 'F45', 'Functional'],
    "Boxing & Martial Arts Studio": ['Boxing', 'Kickboxing', 'Muay Thai', 'MMA', 'BJJ', 'Karate', 'Judo', 'Taekwondo', 'HIIT'],
    "Climbing Gym": ['Bouldering', 'Indoor Climbing'],
    "Dance Studio": ['Ballet', 'Hip-Hop', 'Latin', 'Barre'],
    "Swimming Pool": ['Swimming'],
    "Sports Club": ['Swimming', 'Functional', 'Personal Training'],
    "Personal Trainer": ['Personal Training', 'Strength', 'Functional', 'HIIT', 'Bootcamp', 'Boxing'],
  },
  'Out & About': {
    "Cinema": ['IMAX', 'Boutique Cinema'],
    "Live Venue": ['Stand-Up Comedy', 'Live Music', 'Gig', 'Theatre', 'Musical'],
    "Bowling & Games": ['VR Experience'],
    "Escape Room": ['VR Experience', 'Themed Experience'],
    "Immersive Experience": ['VR Experience', 'Themed Experience'],
    "Class & Workshop": ['Cookery Class', 'Pottery Class', 'Life Drawing', 'Wine Tasting', 'Cocktail Class', 'Candle-Making', 'Floristry Class'],
    "Theme & Adventure Park": ['Theme Park', 'Water Park', 'Adventure Park'],
    "Zoo & Wildlife Park": ['Wildlife Safari', 'Aquarium'],
    "Tour & Day Trip": ['Walking Tour', 'Boat Trip', 'Ghost Tour', 'Food Tour', 'Helicopter Tour', 'Hot Air Balloon'],
  },
  'Shopping': {
    "Fashion Boutique": ['Womenswear', 'Menswear', 'Kidswear', 'Streetwear', 'Designer', 'Vintage', 'Sustainable', 'Independent'],
    "Homeware & Lifestyle": ['Homeware', 'Crafts', 'Sustainable', 'Independent'],
    "Gift Shop": ['Crafts', 'Books', 'Board Games', 'Independent', 'Sustainable'],
    "Jewellery Store": ['Designer', 'Vintage', 'Sustainable', 'Independent'],
    "Florist": ['Sustainable', 'Independent'],
    "Bookshop": ['Books', 'Comics', 'Vintage', 'Independent'],
    "Independent Grocer & Deli": ['Independent', 'Sustainable'],
    "Vintage & Pre-Loved": ['Vintage', 'Womenswear', 'Menswear', 'Designer', 'Sustainable', 'Independent', 'Records', 'Books'],
    "Specialist Retailer": ['Records', 'Board Games', 'Comics', 'Art Supplies', 'Crafts', 'Models & Hobbies', 'Music Instruments', 'Books', 'Independent'],
  },
  'Home & Local Services': {
    "Cleaner": ['End of Tenancy', 'Deep Clean', 'Carpet Cleaning', 'Office Cleaning'],
    "Tailor & Alterations": ['Wedding Alterations', 'Bridal', 'Suit Tailoring'],
    "Tech Repair": ['Phone Repair', 'Laptop Repair', 'Tablet Repair', 'Console Repair'],
  },
  'Travel & Hotels': {
    "Hotel": ['Spa', 'Resort', 'Romantic', 'Country House'],
    "Boutique Hotel": ['Boutique', 'Romantic', 'Adults-Only', 'Spa'],
    "Spa Hotel": ['Spa', 'Romantic', 'Adults-Only', 'Resort', 'Country House'],
    "B&B & Inn": ['Romantic', 'Country House', 'Adults-Only', 'Boutique'],
    "Self-Catering": ['Country House', 'Romantic'],
    "Holiday Park": ['Resort'],
    "Glamping & Camping": ['Romantic', 'Adults-Only'],
  },
  'Health & Medical': {
    "Dental Clinic": ['Cosmetic Dentistry', 'Invisalign', 'Orthodontics'],
    "Optician": ['Eye Test', 'Contact Lenses', 'Designer Frames'],
    "Physio & Chiropractic Clinic": ['Sports Physio', 'Pre/Post-Natal'],
  },
  'Family & Kids': {
    "Soft Play": ['Toddler', 'All-Ages', 'Adventure', 'Birthday Party'],
    "Kids' Class & Activity": ['Toddler', 'All-Ages', 'Gymnastics', 'Swimming Lessons', 'Football', 'Drama', 'Music Lessons', 'Art', 'Coding'],
    "Party Venue": ['All-Ages', 'Birthday Party', 'Themed Party', 'Laser Tag', 'Adventure'],
    "Children's Hairdresser": ['Toddler', 'All-Ages'],
    "Tutoring": ['All-Ages', 'Coding'],
    "Toy & Kids' Boutique": ['Toddler', 'All-Ages'],
  },
  'Auto & Garage': {
    "Garage & MOT": ['Mercedes Specialist', 'BMW Specialist', 'Classic Car', 'Performance', 'EV Specialist'],
    "Tyre Centre": ['Performance', 'EV Specialist'],
    "Body Shop": ['Mercedes Specialist', 'BMW Specialist', 'Classic Car', 'Performance'],
    "Mobile Mechanic": ['Mercedes Specialist', 'BMW Specialist', 'EV Specialist'],
    "Car Wash & Detailing": ['Classic Car', 'Performance'],
    "EV Charging": ['EV Specialist'],
  },
  'Pet Services': {
    "Pet Groomer": ['Cat Grooming', 'Mobile Grooming', 'Hand-Stripping'],
    "Pet Training": ['Puppy Training', 'Behavioural'],
  },
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
