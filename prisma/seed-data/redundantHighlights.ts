// Admin-curated redundancy rules per spec §3.4: highlight tags that should be
// hidden on the merchant card for these subcategories because the subcategory
// itself already implies them. Resolved at seed time (Task 10) into
// RedundantHighlight rows; admins can override per-merchant in production.
//
// Cross-listing note: 'Aesthetics Clinic' exists under both Beauty & Wellness
// and Health & Medical (compound unique on (name, parentId)). Rules here key
// by subcategory name only, so any rule targeting 'Aesthetics Clinic' applies
// to BOTH listings — intentional, since the redundancy is a property of the
// format, not the parent tab a customer browses to.
//
// Spec/seed-inventory gap: spec §3.4 also names 'Cocktail Bar', 'Dog-Friendly',
// and 'Kid-Friendly'. These are intentionally NOT included here because they
// are not present in the seed inventory (no 'Cocktail Bar' subcategory in
// categories.ts; 'Dog-Friendly' / 'Kid-Friendly' are not seeded as Highlight
// tags). Including them would create orphan FK references at seed time. If
// any of these are added to the seed inventory later, add the matching rules.
export type RedundantHighlightRule = {
  subcategoryName: string
  highlightLabels: string[]
  reason: string
}

export const REDUNDANT_HIGHLIGHTS: RedundantHighlightRule[] = [
  // Pet-related subcategories — Pet-Friendly is implicit for the format
  ...['Vet','Pet Boutique','Pet Groomer','Pet Boarding & Daycare','Dog Walker','Pet Training']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Pet-Friendly'],
      reason: 'Pet-services subcategory — every merchant here is pet-friendly by definition',
    })),

  // Family/Kids-related subcategories — Family-Friendly is implicit for the format
  ...['Soft Play',"Kids' Class & Activity",'Party Venue',"Children's Hairdresser",
      'Family Photo Studio',"Toy & Kids' Boutique",'Tutoring']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Family-Friendly'],
      reason: 'Family/kids subcategory — every merchant here serves families/kids by definition',
    })),

  // Wheelchair Accessible promoted to Detail for Aesthetics Clinic + Day Spa
  ...['Aesthetics Clinic','Day Spa']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Wheelchair Accessible'],
      reason: 'Detail-level facet for these formats; promote to Detail tag',
    })),

  // Bars are expected to be Open Late by baseline; show only when meaningfully later than normal
  ...['Bar','Pub & Gastropub']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Open Late'],
      reason: 'Bars open late by baseline; show only when meaningfully later than typical (admin-verified)',
    })),
]
