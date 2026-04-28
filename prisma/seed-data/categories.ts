import type { CategoryDescriptorState } from '../../generated/prisma/client'

export type SeedTopLevelCategory = {
  name: string
  sortOrder: number
  pinColour?: string
  pinIcon?: string
}

export type SeedSubcategory = {
  parent: string                          // top-level category name
  name: string
  sortOrder: number
  descriptorState: CategoryDescriptorState
  descriptorSuffix?: string                // optional override
}

export const TOP_LEVEL_CATEGORIES: SeedTopLevelCategory[] = [
  { name: 'Food & Drink',           sortOrder: 1,  pinColour: '#E65100', pinIcon: 'fork-knife' },
  { name: 'Beauty & Wellness',      sortOrder: 2,  pinColour: '#E91E8C', pinIcon: 'sparkles' },
  { name: 'Health & Fitness',       sortOrder: 3,  pinColour: '#4CAF50', pinIcon: 'dumbbell' },
  { name: 'Out & About',            sortOrder: 4,  pinColour: '#9C27B0', pinIcon: 'compass' },
  { name: 'Shopping',               sortOrder: 5,  pinColour: '#7C4DFF', pinIcon: 'bag' },
  { name: 'Home & Local Services',  sortOrder: 6,  pinColour: '#607D8B', pinIcon: 'tools' },
  { name: 'Travel & Hotels',        sortOrder: 7,  pinColour: '#0097A7', pinIcon: 'bed' },
  { name: 'Health & Medical',       sortOrder: 8,  pinColour: '#F44336', pinIcon: 'stethoscope' },
  { name: 'Family & Kids',          sortOrder: 9,  pinColour: '#FF9800', pinIcon: 'family' },
  { name: 'Auto & Garage',          sortOrder: 10, pinColour: '#455A64', pinIcon: 'car' },
  { name: 'Pet Services',           sortOrder: 11, pinColour: '#795548', pinIcon: 'paw' },
]

export const SUBCATEGORIES: SeedSubcategory[] = [
  // Food & Drink (8)
  { parent: 'Food & Drink', name: 'Restaurant',        sortOrder: 1, descriptorState: 'RECOMMENDED', descriptorSuffix: 'Restaurant' },
  { parent: 'Food & Drink', name: 'Cafe & Coffee',     sortOrder: 2, descriptorState: 'OPTIONAL',    descriptorSuffix: 'Cafe' },
  { parent: 'Food & Drink', name: 'Bakery',            sortOrder: 3, descriptorState: 'OPTIONAL' },
  { parent: 'Food & Drink', name: 'Dessert Shop',      sortOrder: 4, descriptorState: 'OPTIONAL' },
  { parent: 'Food & Drink', name: 'Takeaway',          sortOrder: 5, descriptorState: 'RECOMMENDED' },
  { parent: 'Food & Drink', name: 'Bar',               sortOrder: 6, descriptorState: 'RECOMMENDED' },
  { parent: 'Food & Drink', name: 'Pub & Gastropub',   sortOrder: 7, descriptorState: 'RECOMMENDED' },
  { parent: 'Food & Drink', name: 'Food Hall',         sortOrder: 8, descriptorState: 'HIDDEN' },

  // Beauty & Wellness (9)
  { parent: 'Beauty & Wellness', name: 'Hair Salon',         sortOrder: 1, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Barber',             sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Beauty & Wellness', name: 'Nail Salon',         sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Beauty & Wellness', name: 'Beauty Salon',       sortOrder: 4, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Day Spa',            sortOrder: 5, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Massage Studio',     sortOrder: 6, descriptorState: 'OPTIONAL' },
  { parent: 'Beauty & Wellness', name: 'Aesthetics Clinic',  sortOrder: 7, descriptorState: 'RECOMMENDED' },
  { parent: 'Beauty & Wellness', name: 'Tanning Salon',      sortOrder: 8, descriptorState: 'HIDDEN' },
  { parent: 'Beauty & Wellness', name: 'Wellness Studio',    sortOrder: 9, descriptorState: 'RECOMMENDED' },

  // Health & Fitness (8)
  { parent: 'Health & Fitness', name: 'Gym',                            sortOrder: 1, descriptorState: 'RECOMMENDED' },
  { parent: 'Health & Fitness', name: 'Boutique Studio',                sortOrder: 2, descriptorState: 'RECOMMENDED', descriptorSuffix: 'Studio' },
  { parent: 'Health & Fitness', name: 'Boxing & Martial Arts Studio',   sortOrder: 3, descriptorState: 'RECOMMENDED', descriptorSuffix: 'Studio' },
  { parent: 'Health & Fitness', name: 'Climbing Gym',                   sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Health & Fitness', name: 'Dance Studio',                   sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Health & Fitness', name: 'Swimming Pool',                  sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Health & Fitness', name: 'Sports Club',                    sortOrder: 7, descriptorState: 'OPTIONAL' },
  { parent: 'Health & Fitness', name: 'Personal Trainer',               sortOrder: 8, descriptorState: 'OPTIONAL' },

  // Out & About (11)
  { parent: 'Out & About', name: 'Cinema',                           sortOrder: 1,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Live Venue',                       sortOrder: 2,  descriptorState: 'RECOMMENDED' },
  { parent: 'Out & About', name: 'Bowling & Games',                  sortOrder: 3,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Mini-Golf',                        sortOrder: 4,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Escape Room',                      sortOrder: 5,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Immersive Experience',             sortOrder: 6,  descriptorState: 'OPTIONAL' },
  { parent: 'Out & About', name: 'Class & Workshop',                 sortOrder: 7,  descriptorState: 'RECOMMENDED' },
  { parent: 'Out & About', name: 'Theme & Adventure Park',           sortOrder: 8,  descriptorState: 'OPTIONAL' },
  { parent: 'Out & About', name: 'Zoo & Wildlife Park',              sortOrder: 9,  descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Museum, Gallery & Historic Site',  sortOrder: 10, descriptorState: 'HIDDEN' },
  { parent: 'Out & About', name: 'Tour & Day Trip',                  sortOrder: 11, descriptorState: 'RECOMMENDED' },

  // Shopping (9)
  { parent: 'Shopping', name: 'Fashion Boutique',         sortOrder: 1, descriptorState: 'RECOMMENDED' },
  { parent: 'Shopping', name: 'Homeware & Lifestyle',     sortOrder: 2, descriptorState: 'OPTIONAL' },
  { parent: 'Shopping', name: 'Gift Shop',                sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Jewellery Store',          sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Florist',                  sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Bookshop',                 sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Independent Grocer & Deli',sortOrder: 7, descriptorState: 'HIDDEN' },
  { parent: 'Shopping', name: 'Vintage & Pre-Loved',      sortOrder: 8, descriptorState: 'OPTIONAL' },
  { parent: 'Shopping', name: 'Specialist Retailer',      sortOrder: 9, descriptorState: 'RECOMMENDED' },

  // Home & Local Services (11) — all HIDDEN; format is the descriptor
  { parent: 'Home & Local Services', name: 'Cleaner',                  sortOrder: 1,  descriptorState: 'OPTIONAL' },
  { parent: 'Home & Local Services', name: 'Gardener',                 sortOrder: 2,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Decorator & Handyman',     sortOrder: 3,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Locksmith',                sortOrder: 4,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Removals',                 sortOrder: 5,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Tailor & Alterations',     sortOrder: 6,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Laundry & Dry Cleaning',   sortOrder: 7,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Shoe Repair & Key Cutting',sortOrder: 8,  descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Tech Repair',              sortOrder: 9,  descriptorState: 'OPTIONAL' },
  { parent: 'Home & Local Services', name: 'Bike Repair',              sortOrder: 10, descriptorState: 'HIDDEN' },
  { parent: 'Home & Local Services', name: 'Print, Copy & Photo',      sortOrder: 11, descriptorState: 'HIDDEN' },

  // Travel & Hotels (7)
  { parent: 'Travel & Hotels', name: 'Hotel',              sortOrder: 1, descriptorState: 'RECOMMENDED' },
  { parent: 'Travel & Hotels', name: 'Boutique Hotel',     sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'Spa Hotel',          sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'B&B & Inn',          sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'Self-Catering',      sortOrder: 5, descriptorState: 'OPTIONAL' },
  { parent: 'Travel & Hotels', name: 'Holiday Park',       sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Travel & Hotels', name: 'Glamping & Camping', sortOrder: 7, descriptorState: 'HIDDEN' },

  // Health & Medical (7)
  { parent: 'Health & Medical', name: 'Dental Clinic',                   sortOrder: 1, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'Optician',                        sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'Private GP',                      sortOrder: 3, descriptorState: 'OPTIONAL' },
  { parent: 'Health & Medical', name: 'Physio & Chiropractic Clinic',    sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'Aesthetics Clinic',               sortOrder: 5, descriptorState: 'RECOMMENDED' },
  { parent: 'Health & Medical', name: 'Hearing Centre',                  sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Health & Medical', name: 'IV & Wellness Clinic',            sortOrder: 7, descriptorState: 'RECOMMENDED' },

  // Family & Kids (7)
  { parent: 'Family & Kids', name: 'Soft Play',              sortOrder: 1, descriptorState: 'OPTIONAL' },
  { parent: 'Family & Kids', name: "Kids' Class & Activity", sortOrder: 2, descriptorState: 'RECOMMENDED' },
  { parent: 'Family & Kids', name: 'Party Venue',            sortOrder: 3, descriptorState: 'RECOMMENDED' },
  { parent: 'Family & Kids', name: "Children's Hairdresser", sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Family & Kids', name: 'Tutoring',               sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Family & Kids', name: "Toy & Kids' Boutique",   sortOrder: 6, descriptorState: 'HIDDEN' },
  { parent: 'Family & Kids', name: 'Family Photo Studio',    sortOrder: 7, descriptorState: 'HIDDEN' },

  // Auto & Garage (6)
  { parent: 'Auto & Garage', name: 'Garage & MOT',         sortOrder: 1, descriptorState: 'OPTIONAL' },
  { parent: 'Auto & Garage', name: 'Tyre Centre',          sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'Body Shop',            sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'Mobile Mechanic',      sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'Car Wash & Detailing', sortOrder: 5, descriptorState: 'HIDDEN' },
  { parent: 'Auto & Garage', name: 'EV Charging',          sortOrder: 6, descriptorState: 'HIDDEN' },

  // Pet Services (6)
  { parent: 'Pet Services', name: 'Pet Groomer',             sortOrder: 1, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Dog Walker',              sortOrder: 2, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Pet Boarding & Daycare',  sortOrder: 3, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Vet',                     sortOrder: 4, descriptorState: 'HIDDEN' },
  { parent: 'Pet Services', name: 'Pet Training',            sortOrder: 5, descriptorState: 'OPTIONAL' },
  { parent: 'Pet Services', name: 'Pet Boutique',            sortOrder: 6, descriptorState: 'OPTIONAL' },
]
