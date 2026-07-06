# Pre-Launch Website Workstream · Execution Log (Claude-owned)

Owner-readable running log for the 2026-07-06 pre-launch website and conversion
workstream. Plan: `docs/superpowers/plans/2026-07-06-prelaunch-website-conversion-rebaseline.md`.
This file is Claude-owned; it is NOT a Codex checklist and Codex checklists are not
edited by this workstream.

## 2026-07-06

- Workstream opened on direct owner instruction. Governance note: the open-register row
  "Pre-launch website redesign · GATED: owner sequencing 2026-06-09 (after Merchant
  Portal + Admin)" is treated as re-sequenced by the owner's 2026-07-06 brief for this
  workstream's scope. Recorded here rather than silently overridden; register update
  rides with PR-A.
- Discovery complete (3 parallel inventories: site implementation, brand/design assets,
  programme constraints). Key verified findings: `/for-businesses` CTAs 404 to
  `/contact`; no waitlist or MerchantLead exists anywhere (design-only); app badges
  decorative; "200+ merchants" + 2026-dated testimonials are pre-launch honesty
  liabilities; whileInView sections render blank without scroll; no
  prefers-reduced-motion handling; no analytics (PECR clean); legal pages remain the
  owner/legal hard launch gate (untouched).
- Owner voice note folded in: keep two-audience IA; landing customer-first; pre-launch
  must teach the product and capture a waitlist (admin-manageable, with a membership
  incentive); pre-launch and launched site should be the same site with marketplace
  switched on. Matches the existing NEXT_PUBLIC_MARKETPLACE_LIVE architecture.
- Higgsfield: official guidance verified (higgsfield.ai/cli + /mcp): Claude Code should
  use the CLI, not the MCP endpoint. Installed `@higgsfield/cli` 1.1.5 globally after
  verifying npm package identity (higgsfield.ai homepage, higgsfield-ai/cli repo,
  @higgsfield.ai maintainers). NOT authenticated: owner must run `higgsfield auth login`
  (browser flow). No credits purchased, no generation run; budget = owner decision D4.
- Baseline screenshots captured (desktop + mobile, home / for-businesses / pricing /
  how-it-works) to session scratchpad for before/after comparison.
- Owner screenshot library rescanned (51 PNGs, 8 modules, all 2026-07-06): fully
  synthetic prototype data; usable for `/for-businesses` after chrome cropping +
  "Example data" labelling.
- Worktree `prelaunch-website` created; plan doc written; implementation starting with
  PR-A (customer surface).
- Implementation complete (single PR, both surfaces). Landing: hero rebuilt around a
  code-rendered app preview (real app fonts/voucher colours/3D category card art, synthetic
  example places, accessible step controls, reduced-motion safe); voucher-type section
  rebuilt in the app's 7-type colour language; how-it-works collapsed to 3 steps;
  testimonials replaced pre-launch by a founding-promise band (fake 2026-dated quotes and
  the unverified "200+ merchants" stat removed); pricing facts kept, CTAs launch-aware,
  invented "most members save more..." stat replaced with arithmetic framing; waitlist
  section built but flag-gated dark pending D1; app badges labelled "Coming at launch";
  Discover hidden from nav pre-launch; footer dead /contact link removed. For-businesses:
  portal showcase band added (2 cropped synthetic prototype screens, "example data"
  labels, browser frame); both dead /contact CTAs now anchor to a working
  register-interest section (mailto to merchants@redeemo.co.uk now; full form flag-gated
  pending D1). Site-wide MotionConfig reducedMotion="user". Verification: tsc clean,
  production build clean, 30/30 root guard tests green, desktop+mobile visual QA and
  interaction checks passed (step controls, anchors, mailto).
- Register row "Redesign" updated to IN PROGRESS citing the 2026-07-06 owner brief.
- Opus 4.8 adversarial review: 10 findings. Fixed: nav "Join free" pre-launch bypass
  (now "Get early access", launch-aware), auth-shell fake-scale claims ("2,000+",
  "Hundreds of businesses", unlabelled invented merchant) de-scaled, AA contrast on
  navy hero labels, phone-frame void (content centred + home indicator), inert-badge
  hover affordance removed, reduced-motion skip for the hero cursor glow, pricing CTA
  aria-labels. Adjudicated, not changed: middleware gate (auth-public is approved
  SEC-C3 design; routes already noindexed), portal prototype chrome (logged limitation,
  clean re-capture later). D1 flag-ordering warning added to the plan.
- PR #397 opened (draft, review-only).
- Owner direction (same evening): scroll-driven storytelling; "Every kind of voucher"
  and "Simple to join" sections too boxy/AI. Built ScrollStory: 340vh pinned stage,
  find/choose/redeem chapters, cream-white-navy background journey, phone screens per
  chapter, voucher-type colour cycle with wordmarks and progress dashes. Desktop only;
  static sections remain for mobile/reduced-motion/crawlers (owner-visible limitation:
  mobile story is a follow-up). Debugging note for posterity: scroll-linked stacked
  layers froze because Chrome promotes directly-bound scroll transforms to native
  ScrollTimeline animations and the promotion misbinds; routing every scroll-linked
  value through useSpring keeps them on the JS path (and softens crossfades). Verified
  by DOM probes at p=0.15/0.45/0.66/0.85 and screenshots; guard tests 30/30; tsc clean.

## 2026-07-06 (evening) · Empty customer app investigation

- ROOT CAUSE (verified with code + read-only DB inspection): (1) the base seed's
  SEC-C3 sweep marks ALL merchant/branch/voucher rows isTestData=true and every
  customer read path excludes them unconditionally (CI-guarded; correct); (2) the
  sanctioned display tier prisma/seed-demo.ts (demo- prefixed, visible by design,
  clearable) was never run on the current dev DB; (3) the only isTestData=false
  ACTIVE rows are leaked test artifacts with zero active vouchers; (4) demo branches
  default to POSTCODE_CENTROID location confidence, which is never rankable, so
  Featured/Trending/NearbyByCategory would hide them even after seeding.
- CONTENT-SAFETY finding: existing QA fixtures are unusable for public visuals:
  Pino's is a real Huddersfield multi-site business; "Karaara"/"My Kerala"/"Covelum"
  are explicitly labelled REAL merchants in prisma/seed-data/demoMerchantEnrichment.ts;
  Karaara's fixture address is the real premises of another restaurant (Veppura).
- FIX (PR #400, draft): six web-vetted fictional Huddersfield merchants
  (demo-merchant-11..16, The Old Foundry Kitchen mirroring the portal prototype's
  example business), MANUALLY_CONFIRMED demo branches, Huddersfield demo redemptions
  for Trending, city-correct Featured targeting, the missing seed:demo scripts,
  two brand-voice campaign copy fixes. No isTestData filter or read-path changes.
- QUEUED FOR OWNER APPROVAL (auto-mode classifier correctly held it): running
  `npm run seed:demo` against the shared dev Neon DB. One command, additive,
  reversible via `npm run seed:demo:clear`.
- Known minor: the original London set already contains a same-named
  "The Old Foundry Kitchen" (demo-merchant-02, Clerkenwell); after seeding both
  exist (reads as a two-city chain). Flagged to the adversarial review.
- No provider/deployment/schema/env actions taken or required.
- Opus 4.8 adversarial review of PR #400: protection integrity PASS (no filter or
  read-path changes); reversibility FAILED as written: clearDemo never deleted
  demo-red-* redemptions and their RESTRICT FKs silently blocked every other delete
  while reporting success; demo campaigns never cleared; Huddersfield amenity names
  did not match the canonical set (would have silently vanished from screenshots);
  phones were in live subscriber space. All fixed in the second PR commit
  (teardown deletes redemptions + campaigns first; canonical amenities; Ofcom
  reserved 01484 496 0xx range). Post-fix verdict: safe to run on owner approval.
- Owner-eyeball residue: six real central-street addresses with plausible numbers
  (fictional business names web-vetted; addresses fine for map pins, glance if
  extra caution wanted). Same-name Old Foundry Kitchen in London (02) and
  Huddersfield (11) reads as a two-city chain; intentional, shared branding.
- Codex review of PR #400 (at e152584b): approach approved in principle; three
  execution blockers. All fixed at 0e07c157: (1) fail-closed DB identity guard
  (seedTargetGuard.ts; production always refused; SEED_DEMO_TARGET_DB must equal
  the exact host/dbname of DATABASE_URL, printed on refusal); (2) truthful
  teardown (failures collected, INCOMPLETE banner, non-zero exit, success line
  unreachable after failure); (3) ENCRYPTION_KEY required only for seeding.
  Campaign journey made honest by POPULATING it (bannerImageUrl + demo-cm-*
  CampaignMerchant links, torn down first). Fable address judgement: street
  numbers removed from the five numbered Huddersfield lines (real streets stay,
  no specific frontage claimed). Load-bearing tests added:
  tests/api/lib/seedTargetGuard.test.ts (10) + seed-demo.guard.test.ts (9
  structural), all green. Fresh Opus review of 0e07c157 dispatched; PR stays
  draft/unmerged; seed run still owner-queued.
- Fresh Opus 4.8 review of 0e07c157: SAFE, no blockers. Guard fail-closed under
  bypass attempts (module-level, pre-Prisma, both modes); teardown truthful and
  fully demo-scoped; campaign journeys verified against real endpoint predicates;
  idempotent re-runs; tests judged load-bearing. Unit lane 2782/2782. Accepted
  MINORs recorded on the PR (demo redemptions count as real in shared-dev
  analytics: deliberate, prefix-classifiable, owner ack requested; coverage test
  checks presence not scope; two steps outside the failure collector). PR #400
  stays draft/unmerged at 0e07c157; seed run remains owner-queued with the
  two-step confirm procedure (guard prints the identity to paste back).
- Owner approved the cream-hero trial (with the explicit nuance that navy remains
  for sectioned backgrounds in places: mixture with good balance). Implemented on
  PR #397: hero ground cream, navy type, navy phone bezel + nav chip as deliberate
  accents, glow softened; navy section moments retained (scroll-story Redeem
  chapter, founding-promise band, app CTA, footer).
- Owner approved the red nav trial; refined to match the customer app's actual
  header recipe (radial glow #F24E2C at 70%/16% into deep red #BE0A03, from
  HomeHeader EXPANDED_STOPS) rather than the flat marketing gradient; the
  all-white horizontal logo (brand package Horizontal Version 3 SVG) replaces
  logo-dark on the bar. CTA red aligned to the bar's deep red. Cross-surface
  effect: the website chrome now literally speaks the app header's language.
- FINAL PROVIDER MAPPING (owner-approved bounded read-only Neon check, project
  lively-lab-12323797 "Redeemo", aws-eu-west-2): ep-dark-wave-ab6okhp8 is the
  compute of branch br-green-forest-abv6d6ns named "production": PRIMARY +
  DEFAULT, created with the project 2026-04-07, compute active daily (dev
  traffic). ep-round-wave-abpnesg3 = staging (br-ancient-water, cut from
  production 2026-06-13). NO dev branch exists; the only other branches are
  archived April/May feature branches. Synthesis: Codex's mapping was formally
  correct AND the dev-usage classification was functionally correct: the team
  has been using the production-named default branch as the shared dev DB.
  VERDICT: Phase B (demo seed) into ep-dark-wave is PERMANENTLY REFUSED:
  publicly-visible synthetic data must not be planted in the launch branch.
  Recommendation: create a dedicated dev branch off production head (copy-on-
  write carries all current dev data incl. categories), repoint local .env,
  seed demo data there (provider action: owner approval required). The
  production-branch-as-dev arrangement itself is escalated to the security
  thread as a standing risk.
- OWNER-APPROVED FAST PATH EXECUTED: Neon branch dev-screenshot
  (br-lingering-brook-abaaucso, endpoint ep-purple-shadow-abibe61p, 0.25CU
  scale-to-zero) created from production head. PR #400 seed run against it ONLY
  (allow-pinned wrapper + deny-list of ep-dark-wave/ep-round-wave + the
  SEED_DEMO_TARGET_DB guard). Found + fixed live: fixtures predated the current
  category taxonomy (remapped to subcategories; sanity sentinels updated;
  pushed to PR #400). Local .env host swapped dark-wave -> purple-shadow (backup
  .env.bak-2026-07-07; sed, contents never read) and the :3000 backend
  restarted onto the branch. Probes with Huddersfield coords: locality resolves
  via the real location system; Featured 4 tiles / Trending 6 / 5 nearby rails /
  campaigns 3 (two off-voice base-fixture campaigns incl. "Date Night Deals"
  retired on the screenshot branch only); profile demo-merchant-11 = 2 branches
  + 3 vouchers; search "coffee" -> Juniper Coffee. Production and staging
  untouched. Teardown: seed:demo:clear against the same pinned target; full
  reset = delete the Neon branch.
