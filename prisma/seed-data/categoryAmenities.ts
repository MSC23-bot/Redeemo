/**
 * CategoryAmenity eligibility rules — starter set.
 *
 * Each rule references a category by `categoryName` (with optional
 * `parentCategoryName` for subcategory rules). Top-level rules apply to
 * all subcategories of that top-level via inheritance lookup at runtime.
 *
 * Idempotent — `createMany` with `skipDuplicates: true`.
 */

export type SeedCategoryAmenity = {
  amenityName: string
  categoryName: string                     // top-level OR subcategory name
  parentCategoryName?: string              // required when categoryName is a subcategory
}

export const CATEGORY_AMENITIES: SeedCategoryAmenity[] = [
  // Wi-Fi — Food & Drink, Beauty & Wellness, Out & About, Travel & Hotels
  { amenityName: 'Wi-Fi', categoryName: 'Food & Drink' },
  { amenityName: 'Wi-Fi', categoryName: 'Beauty & Wellness' },
  { amenityName: 'Wi-Fi', categoryName: 'Out & About' },
  { amenityName: 'Wi-Fi', categoryName: 'Travel & Hotels' },

  // Wheelchair Access — universal (one rule per top-level)
  { amenityName: 'Wheelchair Access', categoryName: 'Food & Drink' },
  { amenityName: 'Wheelchair Access', categoryName: 'Beauty & Wellness' },
  { amenityName: 'Wheelchair Access', categoryName: 'Health & Fitness' },
  { amenityName: 'Wheelchair Access', categoryName: 'Out & About' },
  { amenityName: 'Wheelchair Access', categoryName: 'Shopping' },
  { amenityName: 'Wheelchair Access', categoryName: 'Home & Local Services' },
  { amenityName: 'Wheelchair Access', categoryName: 'Travel & Hotels' },
  { amenityName: 'Wheelchair Access', categoryName: 'Health & Medical' },
  { amenityName: 'Wheelchair Access', categoryName: 'Family & Kids' },
  { amenityName: 'Wheelchair Access', categoryName: 'Auto & Garage' },
  { amenityName: 'Wheelchair Access', categoryName: 'Pet Services' },

  // Online Booking — universal
  { amenityName: 'Online Booking', categoryName: 'Food & Drink' },
  { amenityName: 'Online Booking', categoryName: 'Beauty & Wellness' },
  { amenityName: 'Online Booking', categoryName: 'Health & Fitness' },
  { amenityName: 'Online Booking', categoryName: 'Out & About' },
  { amenityName: 'Online Booking', categoryName: 'Shopping' },
  { amenityName: 'Online Booking', categoryName: 'Home & Local Services' },
  { amenityName: 'Online Booking', categoryName: 'Travel & Hotels' },
  { amenityName: 'Online Booking', categoryName: 'Health & Medical' },
  { amenityName: 'Online Booking', categoryName: 'Family & Kids' },
  { amenityName: 'Online Booking', categoryName: 'Auto & Garage' },
  { amenityName: 'Online Booking', categoryName: 'Pet Services' },

  // Food & Drink subcategory rules
  { amenityName: 'Outdoor Seating',    categoryName: 'Food & Drink' },
  { amenityName: 'Late-Night Service', categoryName: 'Bar',             parentCategoryName: 'Food & Drink' },
  { amenityName: 'Late-Night Service', categoryName: 'Pub & Gastropub', parentCategoryName: 'Food & Drink' },
  { amenityName: 'Group Bookings',     categoryName: 'Food & Drink' },
  { amenityName: 'Group Bookings',     categoryName: 'Out & About' },

  // Beauty/Health
  { amenityName: 'Walk-Ins Welcome',      categoryName: 'Beauty & Wellness' },
  { amenityName: 'Walk-Ins Welcome',      categoryName: 'Health & Medical' },
  { amenityName: 'Same-Day Appointments', categoryName: 'Health & Medical' },

  // Health & Fitness
  { amenityName: 'Showers', categoryName: 'Health & Fitness' },
  { amenityName: 'Lockers', categoryName: 'Health & Fitness' },
  { amenityName: 'Lockers', categoryName: 'Travel & Hotels' },

  // Shopping / Out / Travel / Auto
  { amenityName: 'Click & Collect', categoryName: 'Shopping' },
  { amenityName: 'Free Parking',    categoryName: 'Shopping' },
  { amenityName: 'Free Parking',    categoryName: 'Out & About' },
  { amenityName: 'Free Parking',    categoryName: 'Travel & Hotels' },
  { amenityName: 'Free Parking',    categoryName: 'Auto & Garage' },

  // Travel & Hotels
  { amenityName: 'Room Service',      categoryName: 'Hotel', parentCategoryName: 'Travel & Hotels' },
  { amenityName: '24-Hour Reception', categoryName: 'Travel & Hotels' },

  // Auto & Garage / Pet Services
  { amenityName: 'Loan Vehicle',       categoryName: 'Auto & Garage' },
  { amenityName: 'Pickup & Drop-off',  categoryName: 'Auto & Garage' },
  { amenityName: 'Pickup & Drop-off',  categoryName: 'Pet Services' },
  { amenityName: 'Boarding Available', categoryName: 'Pet Services' },
]
