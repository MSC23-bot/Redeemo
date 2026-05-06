# Redeemo — Product context for `/impeccable`

> Synthesised from `CLAUDE.md` (canonical project spec) so design work
> has product context to ground against. Edit freely; this is a living
> document.

## Register

`product` — app UIs, authenticated surfaces, the user is in a task.

## Product purpose

Redeemo is a UK-based, location-first digital marketplace connecting
consumers with local businesses through exclusive digital vouchers.
Subscribers pay £6.99/month to unlock redemption rights. Merchants
join free but pay for featured placement.

## Users

**Customer (primary)**

- UK consumer, mobile-first.
- Often outdoors or in transit when discovering merchants; will be
  in-store at redemption moment.
- Wants quick orientation: "is this voucher for me, what does it
  save, where do I redeem, can I redeem it now."
- Sceptical of voucher apps that bury terms in legalese.
- Brings friends/family — group dining is a common redemption context.

**Branch staff (secondary)**

- Quick PIN entry on a merchant device. Doesn't read the customer
  app surface.

## Brand

- **Name:** Redeemo.
- **Primary colors:** brand-rose `#E20C04`, brand-coral `#E84A00`,
  navy `#010C35`, cream `#FFF9F5` (cream-stone `#F5F0EB` for page bg).
- **Hue family:** H 25–30 (red-orange) is the project's canonical
  neutral hue family. All cream backgrounds, neutrals, and accent
  colors stay in this family for chromatic coherence.
- **Voucher type accent palette:** per-type gradient with end colors
  in BOGO purple `#6E3DD3`, Discount red `#D8302A`, Freebie emerald
  `#208E50`, Spend & Save orange `#D6531B`, Time-limited amber
  `#BC6D1C`, Reusable teal `#198375`.
- **Type:** DM Sans throughout (display + body). Tight tracking on
  headings. iOS Dynamic Type respected.

## Tone

- **Confident, plain-spoken.** No marketing puffery. The voucher is
  the offer; product copy stays out of the way.
- **Trust-first.** Money savings + redemption mechanics are stated
  precisely. Fair-use rules are visible, not buried.
- **No em dashes** in UI text or seed copy (locked 2026-05-02).
- **British English** spellings (favourite, colour, behaviour).

## Anti-references

What this product is NOT:

- **Not Groupon.** Not a coupon-aggregator with manipulative urgency
  banners ("only 2 left!", "47% claimed today!"). Vouchers stand on
  their own merits.
- **Not a SaaS dashboard.** No "hero metric template" (big number +
  small label + supporting stats + gradient accent). The voucher IS
  the data; we don't dramatise it.
- **Not a fintech app.** Navy is grounded brand colour, not status
  signaling. We don't lean on "trust through gravitas."
- **Not Stripe Press / editorial.** Functional product UI; familiarity
  is a virtue. We're not making a magazine.
- **Not a typical food-delivery app's voucher screen** (Deliveroo /
  Uber Eats coupon UI). Their voucher screens are throwaway promos.
  Ours are the primary product.

## Strategic principles (locked)

1. **Subscription gates redemption.** Free users browse, subscribers
   redeem. Free-state CTAs lead to subscribe; redeemed-state CTAs are
   disabled with clear "already redeemed this cycle" messaging.
2. **Branch is the primary unit of experience.** Merchant is a
   grouping layer; redemption is branch-attributed. The UI must make
   "redeem at this specific branch" unmissable.
3. **Vouchers are merchant-wide content; redemption is branch-level
   action.** Don't blur this distinction.
4. **The voucher is the screen.** Voucher Detail is core product
   surface — not a tactical patch. Treated with care equivalent to
   a merchant's own homepage.
5. **No fabricated content in the chrome.** When data isn't resolved
   yet, surfaces fall through gracefully — no placeholder copy.
6. **Backend-driven.** Title, description, terms, saving, expiry,
   merchant, branch all come from backend / admin / merchant entry.
   The UI must handle long real content (no fake placeholders to
   make layouts look nice).

## Design system anchors

- **Page bg:** `#F5F0EB` (cream-stone)
- **Card bg:** `#FFFFFF`
- **Identity-zone gradient:** `#FFF9F5` → `#FCF0E5` (vertical, brand
  hue family)
- **Hero gradient (voucher):** type-specific 2-stop gradient (light
  → dark, top-left → bottom-right) with overlays for depth.
- **Typography scale (round 11+):** 17pt 700 navy / 14pt 500 muted
  for chrome; 26-30pt 800 for hero titles; 12-14pt for body.
- **Coupon shape:** type-coloured hero + dashed perforation with
  cream cutouts at edges + connected white card body. The voucher
  silhouette is the visual signature.
- **Motion:** scroll-driven (Reanimated), not time-driven for
  scroll handoffs. Reduced-motion paths required.

## Voucher Detail screen — locked baseline

- 12-state machine (loading / error / free-user / expired /
  redeemed-this-cycle / time-limited variants / can-redeem).
- Hero anchored on overscroll (rubber-band tear at perforation).
- Collapsed chrome (back + logo + merchant + branch) takes over
  past hero, with cream gradient + subtle hairline.
- Single-threshold pointerEvents handoff between hero NavRow and
  collapsed chrome.
- URL-driven back navigation (`from=merchant&returnMerchantId=…`).
- Branch attribution panel ("REDEEM AT &lt;branch&gt;") prominent
  above the sticky CTA.
- Terms parsed from free-text `voucher.terms` via sentence-boundary
  split into bullets (interim until backend ships structured clauses).

## Out of scope for this design pass

These belong to other phases / surfaces and shouldn't be touched
here:

- Admin-managed Fair Use / T&C clause system (deferred, see
  `memory/project_deferred_followups_index.md` §A).
- TIME_LIMITED availability windows (backend-additive).
- Voucher favourite toggle wiring (M2).
- PIN entry sheet (M2).
- Show-to-staff QR rendering (M3).
