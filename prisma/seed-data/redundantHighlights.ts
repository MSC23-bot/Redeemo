export type RedundantHighlightRule = {
  subcategoryName: string
  highlightLabels: string[]
  reason: string
}

export const REDUNDANT_HIGHLIGHTS: RedundantHighlightRule[] = [
  // Pet-related subcategories — Pet-Friendly / Dog-Friendly is implicit
  ...['Vet','Pet Boutique','Pet Groomer','Pet Boarding & Daycare','Dog Walker','Pet Training']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Pet-Friendly'],
      reason: 'Implicit — pet services category',
    })),

  // Family/Kids-related subcategories — Family-Friendly / Kid-Friendly implicit
  ...['Soft Play',"Kids' Class & Activity",'Party Venue',"Children's Hairdresser",
      'Family Photo Studio',"Toy & Kids' Boutique",'Tutoring']
    .map((subcategoryName) => ({
      subcategoryName,
      highlightLabels: ['Family-Friendly'],
      reason: 'Implicit — family/kids category',
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
