# Merchant Portal: Prototype-Driven Findings and Gaps

- Date: 2026-06-17
- Status: Working log. Closed scope: planning and prototyping only. No implementation, no schema changes.
- Source: Live Claude Design prototyping session for the Merchant Portal (project "Redeemo for Business").
- Companion: `docs/superpowers/specs/2026-06-16-merchant-portal-product-blueprint.md` (the canonical Phase 3 blueprint, PR #261).

Purpose: capture the product and UX decisions validated, and the gaps discovered, while prototyping the Merchant Portal in Claude Design, so they can be folded into the blueprint, the taxonomy data, and the Phase 3 schema work later.

## 1. Locked product and UX decisions (prototype-validated)

### Voucher builder
- Vocabulary: "voucher" everywhere, never "offer".
- Voucher type differentiation: each type's builder must reinforce what makes that type distinct. The BOGO free item must be a second of the same or a similar item, not a different add-on (a free starter or dessert is a Freebie or a Package, not BOGO). If a merchant describes something that belongs to another type, gently point them to it.
- Value fields: the bought item shows "Full price"; the free item shows "Value of the free item" (the saving the customer gets). Never label both "Full price".
- Estimated saving lives in the customer-facing section, defaults to the free item's value, and is editable with a reset-to-suggested note.
- Custom terms join the terms list as normal rows when added (the Add term action fully commits the term).
- The score reflects the whole offer including the number of terms: a clean offer with few terms scores higher; many terms (especially Caution or Restrictive) can drop the meter to Too weak. The meter tier must never disagree with its own warning.
- Brand-only colours on every control (no teal, no generic green).
- Description limit raised to about 300 characters.
- Minimum saving floor: a genuine saving under 5 pounds is flagged.

### Voucher preview card
- Hierarchy: title leads; the saving is the hero figure in Mustica Pro savings-green; the identity row (logo, name, branch) is quieter; description muted; terms quietest.
- Default banner uses the Redeemo brand gradient when no photo is set; a merchant photo overrides it. The Redeem button stays the single primary action.
- Copy: "Save up to" (not "Save about"); CTA "Redeem this voucher".
- Phase 3: the preview should mirror the live customer voucher card exactly (per-type gradient, R watermark, Mustica saving treatment).

### Submit and second-voucher flow
- "Flagship vouchers" everywhere, never "starter vouchers".
- The confirm modal is context-aware: the second voucher's modal signals that it is the second.
- No "Recommended" badge on the second-voucher choice; the merchant may pick a different type.
- Resume: after submitting voucher 1, the merchant can leave and return straight to voucher 2 without rebuilding voucher 1; the checklist reflects progress.
- Success: "Both flagship vouchers have been submitted".

### Onboarding and journey
- Entry model: self-serve registration. This diverges from the current admin-invited backend; self-registered merchants feed the existing admin approval queue, so vetting stays at the approval gate.
- Registration kept minimal: first name, surname, work email, mobile (collected, not verified at registration), password, business name. Nothing else.
- Email-only verification at registration; phone verification deferred to reduce friction (verify later, before go-live).
- Dashboard-first plus checklist, refined to a guided staircase: Choose your category is first; Complete your business profile unlocks after category; Add your main branch, Set up your 2 flagship vouchers, and Sign the merchant agreement unlock only after both category and business profile are done.
- Onboarding IA: light registration; category first on the dashboard; business and legal details (registered name, company registration number, VAT number, head office or registered address) in the Business profile step, not at registration.
- Single demo persona across all screens: The Old Foundry Kitchen, owner James Whitfield. The business name is wired through; flipping the lifecycle switcher never changes the persona.
- Contact split: the company head office contact (website, head office phone, head office email) is captured at the merchant level in the business profile; the customer-facing contact (the phone and email customers see and call) is branch-specific and captured when adding a branch. The registered or head office address is captured as structured UK fields (line 1, line 2, town or city, county, postcode) with postcode lookup, not a single free-text box.

### Taxonomy and identity
- Three-tier attribute model:
  - Merchant identity (same across all branches): category, subcategory, cuisine, specialties. Forms the customer-facing descriptor.
  - Merchant profile (also brand-wide): description, logo, legal details, and ethos highlights (Independent, Women-Owned, Eco-Conscious, brand-wide Halal).
  - Branch attributes (vary per branch): physical facilities and access (outdoor seating, beer garden, parking, wifi, step-free access, baby-changing, high chairs, payment methods, takeaway and delivery), consolidated with branch amenities.
- Cuisine is identity, not a peripheral tag. It is already elevated in the model via `Merchant.primaryDescriptorTag` plus `descriptorEligible`. The descriptor composes from cuisine plus subcategory (Italian plus Restaurant reads "Italian Restaurant").
- Cuisine is shown only for food-serving subcategories (Restaurant, Takeaway, Pub & Gastropub), not Cafe & Coffee, Bakery, Dessert Shop, Bar, or Food Hall.
- Specialties are scoped to the subcategory and cuisine.
- Merchants can propose a cuisine or specialty that is not listed via "Add your own"; it is marked Pending review and routes to the admin panel for approval before it appears to customers.

## 2. Gaps and open items to pick up later

### Schema and data-model (Phase 3, stop-and-report before any migration)
- Move physical highlight and detail attributes (outdoor seating, parking, wifi, step-free access, baby-changing, high chairs, payment methods, takeaway and delivery) from the merchant level (`MerchantTag`) down to the branch level, alongside `BranchAmenity`. This is the structural change implied by the three-tier model. It needs the exact SQL and rollback presented for sign-off before any migration.
- Self-serve merchant registration route. The current backend is admin-invited only (draft plus claim). New registration endpoint plus the wiring into the existing admin approval queue.

### Taxonomy data gaps (Phase 3 seed work)
- Cuisine-specific specialties are missing (the seed has generic food specialties only). Add specialties per cuisine (Indian: Curry House, Tandoor, Biryani, Thali, Street Food, Balti; and the same for Thai, Chinese, and the rest).
- `SubcategoryTag` mappings need completing so tags only show for the subcategories and cuisines they fit. Today Cafe shows cuisines and an Indian Restaurant shows Pizza, which are mapping gaps.

### Taxonomy content and policy (Phase 3)
- Remove the identity-based HIGHLIGHT tags from the taxonomy seed (`prisma/seed-data/tags.ts`): Women-Owned, Black-Owned, LGBTQ+ Friendly. Owner direction is that these read as political or potentially discriminatory and should not be part of the platform. They are removed from the onboarding business-profile values section in the prototype. Decide in Phase 3 whether to remove them platform-wide (customer-facing filters and the merchant profile too), which is the recommendation. Keep neutral business values such as Independent, Family-Run, Locally Sourced, Eco-Conscious; Family-Run and Locally Sourced are not in the current seed and would need adding.

### Features to build
- Merchant-proposed tag flow end to end: "Add your own" on cuisine and specialty, a pending state, routing to the admin panel, admin approval, then it joins the taxonomy. The schema already anticipates this via `Tag.createdBy` (`TagCreatedBy`). The admin side lands with the admin panel work.

### Owner input needed
- Flagship voucher type eligibility: which voucher types are allowed as a mandatory flagship voucher, and whether this varies by category. Starting position: BOGO, Discount, Freebie, Spend and save, and Package work well; Time-limited and Reusable are poor fits as a flagship. Needs the allowed set confirmed.
- Required legal identifiers for a UK business at the Business profile step (company registration number, VAT number, registered address, anything sector-specific).
- Preview button label "Redeem this voucher" to be reconciled against the live customer app wording.

## 3. Disposition
These items are captured for Phase 3. None are being implemented now. Schema items will stop for explicit sign-off with exact SQL and rollback before any migration. The locked decisions in section 1 should be folded into the blueprint when it is next revised.
