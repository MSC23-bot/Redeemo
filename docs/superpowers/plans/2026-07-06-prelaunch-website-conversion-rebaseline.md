# Pre-Launch Website and Conversion Rebaseline (Tier 2)

Date: 2026-07-06 · Owner brief: direct instruction 2026-07-06 (this supersedes the
open-register "Redesign · GATED: owner sequencing 2026-06-09" row for this workstream;
recorded in the execution log). Lead: Fable 5 (creative direction, conversion strategy,
adjudication). Support: Sonnet 5 (inventory, implementation, verification), Opus 4.8
(fresh critical review).

Status: ACTIVE · implementation in worktree `prelaunch-website`, delivered as unmerged PRs.

## 1. What is weak today (verified against main, 2026-07-06)

1. Conversion dead-ends: both `/for-businesses` CTAs link to `/contact`, which does not
   exist (404). App Store / Google Play badges are decorative divs with no href. Navbar
   "Get the app" links to the generic apps.apple.com homepage.
2. Pre-launch incoherence: hero CTA "Start browsing. It's free." sends visitors to
   `/register` while every marketplace surface is flag-hidden; a new registrant lands in
   an empty product. There is no waitlist, so the site cannot convert its primary
   audience pre-launch at all.
3. Honesty liabilities: "200+ merchants" stat (unverified pre-launch), two testimonials
   attributed to members "since Jan/Feb 2026" that cannot exist pre-launch.
4. Generic visual system: no product is shown anywhere; hero uses interchangeable
   glassmorphic fake cards; six near-identical icon-card grids in a row across the two
   pages; no photography, illustration, or texture.
5. Motion defects: `whileInView` entrances leave sections at opacity 0 until scrolled
   (blank in full-page render); no `prefers-reduced-motion` handling.
6. Dead weight: orphaned `/merchants` pitch page + 5 components (middleware 307s it to
   `/for-businesses`), unused `swr` dependency, unused `AppMockupFrame`/`app-mockup.jpg`.

What is already good and stays: brand tokens and fonts, the navy/white/cream section
rhythm, `/for-businesses` argument structure (six structural arguments are present and
on-voice), SEO plumbing (`seoRoutes.ts`, flag-aware sitemap/robots, real OG image),
security headers, the marketplace flag-gate.

## 2. Creative direction (Fable)

North star: **the product is the hero, honestly.** Redeemo's site should feel like the
app (warm cream, confident navy, red-coral gradient used as ink not wallpaper, Mustica
Pro display type) and should show the real product doing its real job with true
mechanics. No abstract SaaS decoration, no fake dashboards, no invented scale.

Signature moves:

1. **Code-rendered product demo in the customer hero.** A device-framed customer-app
   scene built in web code from the app's real design tokens and category illustration
   assets: browse feed → voucher detail → redemption code (4+4 format), cycling gently.
   Honest by construction (it renders the app's actual design system with clearly
   synthetic example places), cheap (DOM, no video), reduced-motion safe (static first
   frame), and it teaches the product in seconds.
2. **Voucher cards in the app's own voucher-type colour language** (BOGO purple,
   freebie green, spend-and-save coral, etc. from customer-app tokens) instead of
   white icon cards: ties web to app, breaks the grid monotony.
3. **How-it-works as a 3-beat visual story** (find a place → show your code at the
   till → pay less) with small UI vignettes, not numbered icon cards. Marketing-level
   detail only (no PIN walkthrough, per audience-profile copy rule).
4. **Honest pre-launch proof.** Remove fake testimonials and the merchant-count stat.
   Replace with a founding-promise band (curation standard, one-redemption-per-cycle
   mechanic, no-commission merchant model) and launch framing.
5. **Real Merchant Portal on `/for-businesses`.** Cropped, chrome-free screenshots of
   the owner-approved portal prototype (fully synthetic data) in a browser frame,
   labelled "Example data". Conservative module selection (Home overview, Vouchers,
   Redemptions) so nothing is implied that will not exist.
6. **Pre-launch/launch continuity.** All pre-launch variants key off the existing
   `NEXT_PUBLIC_MARKETPLACE_LIVE` flag: pre-launch shows waitlist CTAs and launch
   framing; flipping the flag restores browse/register CTAs. One site, two states,
   per owner guidance 2026-07-06.

Audience split (owner guidance 2026-07-06): landing stays customer-first; merchants keep
a clearly signposted dedicated section (`/for-businesses`, navy hero exception retained
per locked design spec §2.3); the bridge band and footer links remain the crossover.

## 3. Conversion journeys

Customer (pre-launch): land → understand product in the hero demo → how it works →
pricing clarity (Free browse / £6.99 / £69.99, unchanged facts) → join the waitlist
(email + postcode, incentive line) → confirmation state.

Merchant: home bridge or direct → `/for-businesses` → structural arguments → portal
proof → register interest (business name, contact, town, category) → "what happens
next" expectations.

## 4. Scope and slices

- **PR-A (customer surface):** landing rebaseline (hero demo, voucher-language cards,
  3-beat story, honesty pass, founding-promise band, pre-launch CTA logic), global
  `prefers-reduced-motion` support and whileInView fallback fix, nav/footer CTA
  coherence, app-badge honesty ("Get the app at launch" pre-launch), waitlist section
  UI (flag-gated dark until backend decision, §6).
- **PR-B (merchant surface):** `/for-businesses` rebaseline (portal visual band,
  register-interest journey replacing the `/contact` 404: working `mailto:`-backed
  interest card day one, full form flag-gated dark pending backend), copy tightened to
  merchant audience profile.
- Docs ride with their PRs (this plan, execution log, register/PROJECT-STATE pointers).
- Cleanup (orphaned `/merchants` pitch components, `swr`, dead assets) only if it keeps
  PR-A reviewable; otherwise logged as follow-up.

Out of scope (unchanged): legal page substance (owner/legal hard gate), analytics
(PECR), schema/backend/provider work (§6), marketplace surfaces, `/insider` content,
deployment/env changes.

## 5. Honesty rules for visuals (binding for this workstream)

- Product UI shown must be the real design system; synthetic example merchants only,
  never implied to be live partners; "Example" labelling near product shots.
- No feature shown that will not exist for its audience at launch.
- No scale claims (member counts, merchant counts, savings totals) without owner-verified
  evidence. Mechanics (one per cycle, no commission) are the proof instead.
- Portal screenshots: crop all prototype/Claude Design chrome; synthetic data only.
- Generated (Higgsfield) material is accent/atmosphere only, never fake product UI, and
  ships only if it passes Fable's brand bar; owner approves any credit spend first.

## 6. Owner decisions (blocking items clearly separated)

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | Waitlist + merchant-lead persistence: adopt `ConsumerWaitlist` + `MerchantLead` models per 2026-06-07 strategy §6 Phase 1 + 2026-06-10 design (MerchantLead as CRM object, source attribution), backend rate-limited POSTs + Turnstile, admin panel lanes | Approve as a separate small Tier 3 backend slice; frontend in PR-A/PR-B ships flag-gated dark and wires up when it lands | Live waitlist + tracked merchant form |
| D2 | Waitlist incentive wording | Until a concrete incentive is chosen, ship the launch-safe "Founding members get first access when we go live in your area"; if you want a stronger offer (e.g. promo-code free period, consistent with "free trials via promo codes only") say the word and copy updates | Stronger incentive copy only |
| D3 | Launch-city framing | RESOLVED (owner, 2026-07-06): Huddersfield first, rolling out across the UK; hero pill + one standard-beat line + waitlist postcode framing, no dedicated section (storyboard v2 §6) | resolved |
| D4 | Higgsfield credit budget for one exploratory batch (post-auth) | Small first batch (a handful of image generations) reviewed by Fable before anything ships | Generated visuals only |

Nothing in PR-A/PR-B depends on D1-D4 to be safe and shippable.

ORDERING WARNING (D1): `NEXT_PUBLIC_LEAD_CAPTURE_LIVE` must not be flipped before the
backend slice ships; the dark forms post to `/api/v1/public/waitlist` and
`/api/v1/public/merchant-interest`, which do not exist yet, so a premature flip fails
every submission into the error state.

Known limitation (accepted 2026-07-06, post-Opus-review): the portal showcase captures
retain the prototype's "View: Owner" / "Demo: Live" switchers in the topbar. Mitigated
by the example-data captions; fix is a clean re-capture from the prototype without demo
chrome when convenient.

## 7. QA and evidence

agent-browser visual passes at 1440/768/390 widths, light checks on Safari-equivalent
WebKit assumptions; reduced-motion verification; keyboard/focus pass on all new
interactive elements; Lighthouse-style budget sanity (no new heavy assets in hero LCP
path; portal PNGs compressed + lazy); root guard tests stay green
(`canonical-url`, `legal-content`, `seo-metadata`, `merchants-redirect`); Opus 4.8
fresh review of conversion clarity, credibility, accessibility, coherence before PR.
