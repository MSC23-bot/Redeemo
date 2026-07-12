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

## 2026-07-07 (small hours) · Screenshot stack live end-to-end

- Owner-approved fast path completed on SECOND pristine branch dev-screenshot-2
  (br-tiny-wildflower-abq7ohwm, endpoint ep-calm-feather-abqza1pk) after the
  first branch accumulated interleaved curations during debugging. Final state:
  16 merchants (6 Huddersfield), 3 on-voice campaigns with merchant links, 18
  trending redemptions, 24/7 demo hours, vibrant banners (owner feedback),
  mixed-style generated logos (owner rejected uniform initials AND single-family
  shapes; Higgsfield logo generation owner-vetoed to conserve credits; trial
  plan also blocks CLI generation: MCP-only).
- DEV_FORCE_CUSTOMER_LOCATION shim (route + both resolvers via one fail-closed
  helper, non-production) delivers the full Huddersfield home to a device in
  Doha through the normal GPS path: same header typography (owner requirement).
  Verified: Doha coords -> Huddersfield context, Featured 4 / Trending 6 /
  5 nearby rails / 3 campaigns.
- Honest post-mortem: an hour lost to two self-inflicted ghosts: (1) a zombie
  tsx child held :3000 across restarts (EADDRINUSE logged silently; kills must
  target the process tree), and (2) the verification probe regressed mid-stream
  (read `tiles` where the wire key is `branches`), making healthy backends look
  broken. Neither was a product defect; recorded so the lesson survives.
- Owner phone flow: Expo restart -c, login customer@redeemo.com, branch PIN
  1234 everywhere (seed-encrypted). Higgsfield credits untouched (110).

## 2026-07-07 (early hours, continued) · Real-asset cinema + Higgsfield Phase 1

- Owner captured 27 app screens (incl. a slow-scroll home sequence + the full
  redemption journey). Batch pipeline (PIL): clean 9:41 status bars, Dynamic
  Island erased via anomaly-masked replacement, "Huddersfield" label patched
  over the device-geocoded "Zone 69, Doha" (client-side reverse geocode; the
  backend shim cannot reach it), photo-hero scrims. Six overlapping home
  captures stitched into a 1320x7354 true-order page (signature matching).
  Raw library (98MB) kept gitignored as source archive; ~4MB web derivatives
  committed to public/app-shots.
- ScrollStory v2 (PR #397 e73e912d): hero shows the real home screen + hook G;
  Find scrolls the real stitched page inside the pinned phone; Choose shows the
  real Old Foundry BOGO; Redeem plays the real keypad -> PIN-confirming journey
  with the code-rendered navy finale. London-merchant assets excluded from the
  story. Recap strip follows the cinema. Guard tests 30/30.
- Higgsfield: owner authenticated the MCP; this session bridges to it via a
  headless claude -p subprocess (71 tools confirmed; zero-credit probe). Owner
  explicitly approved 12 credits; Phase 1 stills batch (12 images, image-tier
  only, hard-capped) launched. Clip animation round will be a separate explicit
  approval.
- Higgsfield Phase 1+2 complete (owner-approved 12 + ~40 credits; ~58 remain):
  12 stills generated via the headless-session MCP bridge, curated on a
  published artifact (picks 1/6/8/10/11; owner confirmed); 5 clips animated
  from the picked stills. Integrated: hero ambient drift + per-chapter
  backdrops (dusk town behind Find is the signature frame), gradient-washed
  toward ground colours so foreground always wins, videos play only while
  their band is visible, posters serve reduced-motion. Follow-ups: transcode/
  CDN for the 15MB of loops; mobile story variant.
- Direction pivot (owner 2026-07-07): generated backdrops REJECTED as shipped
  ("I meant the phone to be in the animation, not animation in the background").
  ScrollStory ambience unmounted (assets retained in public/app-motion). New
  plan: owner films the hero himself on higgsfield.ai with a director's kit
  from this session (context block, prompts A/B/C, composition law: left third
  clean); MP4s land in ~/Desktop/redeemo-hero-films for grading + mounting.
- Hero start frame composed from real assets (PIL, 1920x1080, saved to
  ~/Desktop/redeemo-hero-films/hero-start-frame.png): processed Huddersfield
  home capture in a navy-bezel phone right-of-centre, brand-gradient perforated
  voucher card kissing the bezel, six category-illustration objects (coffee,
  lipstick, dumbbells, pizza, gift box, compass) with alpha-derived shadows,
  cream ground + coral bloom, left third clean. Upload as the image-to-video
  start frame so Higgsfield supplies motion only, not taste.
- VoucherRibbon shipped: the logo's R-as-two-voucher-ribbons motif as a scroll
  divider. Module-scope bezier geometry (sampled centreline, normal-offset
  edges), die-cut notch mask, dashed tear line, brand-gradient fill, soft echo
  band behind (the R's second ribbon), scroll-linked x-drift + light pulse via
  the shared useScrollLinked spring (hoisted to components/landing/scroll.ts).
  Two mounts only: hero seam + HowItWorks-to-navy seam. Reduced-motion renders
  it static; aria-hidden, pointer-events-none. next build clean.
- Ribbon v2 (owner references 2026-07-07: satin dimensional ribbon, "cartoonish"
  v1 rejected): rebuilt as a twist-fold band: width pinches at the fold and the
  band flips to a darker back-face gradient; cylindrical light overlay, lit top
  edge + shadowed lower edge, thickness underlay, ONE die-cut voucher notch on
  the bright face, scroll-driven sheen sweep replacing the dashed pulse. Dotted
  edges and centre dash removed. Flip mount mirrors horizontally (never
  vertically: that inverts the satin lighting; the first flip attempt glared
  against the navy section).
- Navbar rework (owner 2026-07-07: red bar clashed with section backgrounds
  when sticky): red bar is now top-of-page only and scrolls away; a neutral
  glass quick-nav (cream blur, coloured logo, navy links, gradient CTA) slides
  in only while scrolling UP past 300px and hides again on scroll-down. Mobile
  glass pill = logo + primary CTA.
- Ribbon v3 (owner 2026-07-07: seam break visible behind the band; entry/exit
  width flat; nav reveal felt random): the ribbon is now an IN-FLOW divider
  that owns the seam: it paints topColor above its top edge and bottomColor
  below its bottom edge, so the section boundary follows the band's curve
  (reference: the ribbon as horizon between light sky and dark ground). No
  negative margins or overlays. Perspective taper (1.42x entry -> 0.6x exit)
  plus the twist pinch; die-cut notch carved into the edge geometry (the
  masked-circle version printed a grey dot over the shadow); contact shadow is
  a blurred stroke along the lower edge (a filled-region shadow greyed the
  whole cream seam). FoundingPromise glow origins moved inside the section
  (they printed a step against the divider's flat navy). Glass quick-nav is
  now simply present past the hero (hysteresis 480/340), no direction logic.
- Hero film v1 SHIPPED (owner-approved 30cr; actual spend 18.12, balance
  42.38): owner generated the start frame (phone centre-right, photoreal
  voucher cards, brand ribbon, left third clean; found in ~/Downloads,
  archived to ~/Desktop/redeemo-hero-films/hero-frame-owner-v1.png). Pipeline
  ran fully through the in-session Higgsfield MCP: media_upload + confirm,
  2x kling3_0_turbo 6s seeds with a LOCKED-CAMERA prompt (camera motion
  belongs to code so it stays crisp and interactive), frame-level QA (seed A
  screen diff 3.94 vs B 6.03; A mounted, B retained), bytedance aigc upscale
  to 1080p (no extra charge recorded), ffmpeg palindrome encode (12s seamless
  loop, CRF24, 4.4MB) + poster. New HeroFilm component: full-bleed film on
  lg+, scroll push-in (scale 1->1.08 + y drift), spring cursor tilt (listener
  on the owning section: the film layer never receives pointer events),
  cream scrim over the left half for headline legibility, floor fade into the
  divider; PhoneDemo remains the mobile/tablet hero. Known trade-offs: film
  screen shows AI-approximate UI (Manchester); real-screen DOM overlay
  deferred as the screen held stable; fictional voucher cards (green/purple)
  echo app category colours.
- Hero film REJECTED on quality (owner, 2238px display: soft stretched 1080p
  text, card/headline collisions at wide aspect ratios, jittery AI float).
  Root lesson recorded: a fixed-resolution 16:9 video cannot be the full-bleed
  hero of a responsive page. Replaced same-day by HeroScene: the owner's
  approved composition rebuilt entirely in code: PhoneFrame with the REAL
  Huddersfield home capture (DOM-sharp at any resolution), four die-cut
  voucher cards (clip-path notches, brand palette, fictional demo merchants,
  copy echoing hook G), SVG brand ribbon weaving behind, spring cursor
  parallax by depth + idle float loops + scroll lift, launch-safe caption.
  PhoneDemo remains the mobile hero; reduced-motion gets the static pose.
  HeroFilm component + film assets retained unmounted (ambient reuse
  candidates elsewhere). Verified at 1512 and 2238.
- Hero v4 SHIPPED: the owner's artwork as a living collage (owner rejected the
  code-built HeroScene as not premium; provided the Higgsfield frame in
  ~/Desktop/Landing Screenshot). Pipeline, all via MCP + PIL: four voucher
  cards cropped from the artwork and cut out with Higgsfield remove_background
  (the burger crop needed a patch-and-recut: the remover kept the food and
  deleted the card; merged card+burger after a second pass), mattes cleaned
  (ribbon fragment colour-keyed off the coffee card, bezel sliver trimmed,
  largest-component filter), base upscaled to 4K (2 credits; total spend
  20.1/30, 40.4 remain) BUT the AI upscale garbled small screen text
  ("Heaitn & Fitncas"), so the shipped base is a hybrid: AI-4K everywhere,
  faithful Lanczos 2x over the phone rect (feathered). Assets served
  unoptimized (Next's re-encode softened the hand-tuned files; cache-busted
  base-v2.jpg). HeroCollage: contain-fit right-anchored on the artwork's own
  ground colour (#FFF5EB), cards float over their baked positions at 1.07
  scale (idle drift + spring cursor parallax by depth + scroll lift), frosted
  backdrop-blur veil under the text column (invisible over cream; fogs
  whatever drifts beneath the headline at narrow widths), floor fade, badge
  strip capped to the veiled zone on lg. Verified 1512 + 2238; text fidelity
  checked at pixel level. HeroScene/HeroFilm components + film assets removed
  from the tree (history retains them).
- Hero v4.1 (owner: scale it down for breathing space; make single vouchers
  respond to the mouse, creative not gimmicky): artwork group now 84% height
  with a 2% right inset (air on every side); per-card hover added: the card
  the pointer rests on rises toward the viewer on a spring (1.07 -> 1.16,
  deeper shadow) while a single light sweep crosses the satin, clipped to the
  die-cut silhouette by the card's own alpha (mask-image: its own PNG).
  Neighbours keep idling: one voucher at a time. Pointer plumbing: hero
  content layer is pointer-events-none on lg with the text column and badge
  strip re-enabled, so CTAs stay clickable (verified) while hovers reach the
  cards; veil and floor fade are pointer-transparent.
- Hero v4.2 (owner: smaller still; background edge on the right; rough card
  edges under hover zoom): group at 76% height with 4% right inset; the
  artwork's rectangle printed a faint seam against the ground (its cream is
  not uniform), fixed by feathering all four borders of the base image with a
  two-axis mask (70px, mask-composite intersect), card layers deliberately
  outside the mask; all four cutout mattes refined (1px erode + 1.1px
  gaussian on alpha, pizza's dark bezel remnant cleared) so silhouettes stay
  smooth under magnification; hover lift eased 1.16 -> 1.12.
- Hero v4.3 + Ribbon v4 (owner findings: baked voucher visible under floating
  cutouts; junk on the pizza card corner; divider reads like a DNA strand):
  (1) The "voucher underneath" was the baked cards' PAINTED drop shadows
  extending past the cutouts. Fixed by ring-inpainting the base: the shadow
  band around each card (dilated alpha minus footprint) filled from light
  background pixels only, preserving ribbon (saturated red) and phone (dark)
  pixels; footprints stay and are always covered by the overlays; base-v3.jpg
  replaces v2. Parallax eased (7/5 per depth) to keep worst-case drift inside
  the cover margin. (2) Pizza cutout: red ribbon wedge and bezel remnant
  colour-keyed off. (3) VoucherRibbon rebuilt as the icon's coupon band: one
  bold sweep, halfWidth 1.6x tapering to 0.6x (thick left, slim right), die-cut
  notch PAIR carved into both edges with a dashed stub tear line across the
  band, satin shading + edge lights + scroll sheen retained; twist pinch gone.
- Hero v4.4 + Ribbon v5 (owner: artwork ribbon greyed near cards; baked edges
  still peek during motion; divider needs curves/shades back + more indents):
  (1) Grey patches were the ring-inpaint misclassifying SHADED ribbon as
  shadow; redone from the recovered pre-inpaint base with a hue guard
  (r > g+22 & r > b+22 protects ribbon in any lighting); base-v4.jpg.
  (2) Edge peek eliminated architecturally: cursor parallax moved to the
  whole artwork group (base + cards lean together, rotateY 2.5deg + 14px, so
  nothing inside can misalign); per-card motion reduced to a 3px whisper
  float; overlay rest scale 1.04. A full-footprint card removal was attempted
  and abandoned: colour guards cannot distinguish red cards from ribbon.
  (3) VoucherRibbon v5: deeper S-bend, five-stop gradient + along-length
  shade travel (bends read as different tones), TWO die-cut notch pairs with
  stub tear lines.
- Hero v4.5 + Ribbon v6 (owner: grey/washed ribbon persisted; wants the
  divider to fold "from one side, then fold, then the other side"):
  (1) Inpainting abandoned entirely: the base is the PRISTINE artwork again
  (base-v5 = recovered original with the faithful phone rect). Each floating
  card now carries its own PAINTED shadow: new shadow-*.png layers cut from
  the original (alpha = card silhouette UNION shadow mask: darker-than-ground
  cream, hue-guarded against ribbon/phone, border-feathered). Rest state is
  exact alignment (scale 1, no CSS shadow), so the page at rest is literally
  the owner's image; hover lifts with a live shadow; sheen still masked by
  the card-only silhouette. No colour classification of the background
  remains anywhere: grey is impossible by construction.
  (2) VoucherRibbon v6: the fold is back, done properly on the coupon band:
  width gathers to 38% at t=0.55 and the band continues in its darker back
  face gradient (front/back segments overlap at the crease), on top of the
  taper, both notch pairs, tear lines, shade travel.
- Hero v4.6 FINAL ARCHITECTURE (owner: residue marks around hovered cards):
  the shadow-carrying layers left speckle residue when lifted (their alpha
  included background pixels that betrayed themselves under scale). Settled
  on the simplest correct configuration: PRISTINE base (its painted shadows
  never move: motion is small enough that they stay believable under the
  hover's live shadow) + card-only cutouts at rest scale 1.04 (covers the
  3px whisper float), hover 1.1 + live shadow + sheen. shadow-*.png assets
  removed; one final 0.6px alpha soften on all four mattes. Nothing carried,
  nothing filled: neither residue nor grey nor edge-peek has a mechanism.
- Hero v4.6.1 (owner: pizza card's bottom-left corner ragged; ribbon washed
  out at its right notch): both were matte flaws in layer-pizza.png: a pale
  half-transparent ribbon patch sat over the right notch (hiding the true red
  ribbon in the base) and low-alpha haze ringed the corner. Erased the pink
  wash (pale desaturated rule, x > w-170, pepperoni-safe), hardened the matte
  (alpha < 120 -> 0), resoftened 0.7px. QA composite verified the notch now
  shows the artwork's red ribbon through it.
- Voucher shelf SHIPPED (owner 2026-07-08: horizontal-scroll section for the
  seven voucher types, hook header + descriptions + examples): new
  VoucherTypesRail as the third desktop section (after the scroll cinema):
  280vh pinned stage, vertical scroll sweeps seven die-cut voucher cards
  horizontally (measured viewport -> exact end offset, useScrollLinked
  spring). Header "Seven ways to pay less." + labelled-types subcopy. Cards:
  app voucher-type token colours (stripe + pill), display-type title, blurb,
  dashed tear-line stub with a concrete example at a fictional demo merchant
  (Old Foundry, Northlight, Juniper, Fern & Field, Hatterly, Amber Room);
  alternating tilt straightens + lifts on hover; die-cut edge notches form a
  ticket strip between neighbours. Perforated progress line fills with the
  brand gradient as the shelf sweeps; honest footer line (one redemption per
  place per month). Mobile + reduced motion keep the static
  VoucherTypesSection via ScrollStory (rail returns null / hidden).
- Voucher shelf v2 (owner: mobile-optimise incl. scrolling; fictional
  merchants must not read as real businesses; add visuals): cards now carry
  the customer app's own category illustrations (7 picks copied to
  public/category-art at 440px: plated dish, dumbbells, coffee cup, picnic
  basket, gift box, vanity mirror, water bottle) over a soft type-colour
  wash, bleeding off the die-cut edge. Merchant names replaced with generic
  scopes (Restaurants & kitchens, Gyms & studios, ...). Mobile gets the same
  cards as a native snap-scroll swipe carousel ("Swipe for more" microcopy);
  desktop keeps the pinned sweep. ScrollStory's static VoucherTypesSection
  fallback narrowed to reduced-motion only (the shelf covers mobile now), so
  no duplicate types content anywhere.
- Voucher shelf v3 (owner: examples too vague and category-locked; think
  conversion but stay truthful): every card now pairs a recognisable moment
  with real arithmetic: a scenario line ("Date night: two £14 mains, one
  bill for £14.") and a money-back line in the type colour ("£14 back: two
  months of membership, one dinner"). No invented statistics anywhere: the
  persuasion is the sums. Category breadth stated once at section level
  ("Any place can run any type...") instead of per-card scopes, so no type
  reads locked to a category.
- Ribbon v7 REAL SATIN (owner: "not really liking the two ribbons... please
  improve"): procedural SVG retired after three rounds; the divider is now a
  photographed object. flux_2 generated a 3D-rendered red satin ribbon with
  a single elegant twist fold, thick-to-thin, deep red to coral (2 seeds,
  seed A chosen), background-removed, trimmed to 1280x249, graded to brand
  (saturation/warmth toward #E20C04). New RibbonBand component replaces
  VoucherRibbon: the band PNG stretches across the seam and the adjoining
  sections' colours are baked as SVG fill paths from the PNG's own
  per-column alpha edges (160 samples), so the section boundary follows the
  actual fabric silhouette top and bottom. Scroll drift +/-30px
  (useScrollLinked) and a travelling sheen masked by the band's own alpha.
  Second mount mirrors with scaleX(-1) only (scaleY would invert the satin
  lighting). Verified at 2238px: seam A cream-to-cream invisible; seam B
  carries the light-to-navy handover along the fabric's lower edge; mobile
  110px band reads correctly. Higgsfield cost 10cr actual (seeds + cutout);
  approval envelope now 28.12 of 30 spent, balance 32.38: no further
  generation without fresh approval.
- Nav island (owner 2026-07-08: top bar "looks a bit odd... doesn't have to be
  one long stripe"; scrolled glass bar fine but slightly bigger): the full-
  bleed red header is retired. The brand colour now rides a floating island
  (max-w-6xl, rounded-2xl, h-68) with a voucher die-cut notch carved into
  each end (mask on a background-only layer so the account dropdown and menu
  never clip; drop-shadow on a wrapper so the notches read in the
  silhouette), red-tinted shadow, 1px inset top highlight. Links centred
  (logo · links · actions); active underline white on red. Mobile menu
  expands inside the island so the band grows like a long voucher. The
  header zone is transparent, so page worlds extend behind it: landing hero
  and the four navy marketing heroes (how-it-works, pricing, insider,
  for-businesses) pull up -80px with compensated padding; red-on-navy at the
  top of those pages replaces the old red-stripe-on-white band. Glass
  quick-nav grown h-58 to h-64, logo 44 to 48, type 13.5 to 14.
- Glass quick-nav v2 (owner: scale up a little; centre the links while
  scrolling): bar h-64 to h-70, logo 48 to 52; the link group (How it works,
  Pricing, Insider, For businesses) is now centred in the bar, matching the
  top island's logo-links-actions composition.
- Voucher shelf v4 (owner: visuals must represent the voucher TYPES, not
  categories; composition disliked; examples should describe kinds of deals,
  not forced arithmetic; footer line rework): category illustrations
  replaced with seven bespoke SVG motifs drawing each type's MECHANIC: twin
  tickets with a FREE stub (BOGO), percent roundel (discount), gift with
  bow (freebie), receipt with a SAVE line + pound coin (spend & save),
  strapped bundle with price tag (package), stopwatch with a ticking wedge
  (time-limited), loop arrows around a returning ticket (reusable). Card
  anatomy rebuilt as a real coupon: tinted header (type colour gradient)
  carrying chip + motif, dashed tear line aligned with the die-cut side
  notches at 44% height, content below the tear (title, mechanic sentence,
  "Deals like:" line). Examples rewritten as kinds of deals with values only
  where they explain the mechanic. Footer line now "One membership unlocks
  all seven, wherever you see them." + the honest redemption cadence.
  category-art PNGs removed (no remaining references).
- What-is-Redeemo section (owner 2026-07-08: cold visitors need to be told
  what the platform IS; his draft points: all kinds/sizes of local business
  in one simple app, exclusive member vouchers, find/redeem/track, "no
  hunting for codes, no screenshots, no deal sites", lifestyle savings app):
  new WhatIsRedeemoSection mounted directly after the hero ribbon, before
  TrendingPreview: definition before cinema. Editorial asymmetric layout, no
  icon-card slop: left, kicker + display statement ("Your favourite places,
  at member prices.") + two-sentence definition opening "Redeemo is a
  lifestyle savings app" + the anti deal-site line as three cross-glyph
  chips + "See how it works" link. Right, the three product pillars (Find
  local offers / Redeem in store / Track your savings) as a hairline ledger
  with ghost red numerals, whileInView stagger. Section ground is white; the
  ribbon above now bakes the cream-to-white handover along its fabric edge
  (bottomColor swap on the first RibbonBand mount).
- Pre-launch conversion pivot (owner 2026-07-08: hero reads like live offers
  that do not exist; CTAs must convert into the pre-launch waitlist;
  registration is already built so USE it; founding incentive "maybe 3 months
  free"; Huddersfield-first note without making a big deal of it; navbar
  "Get the app" wrong pre-launch; store badges layout disliked):
  (1) Hero: H1 now "Your whole town, at member prices." (no invented deals;
  gradient phrase on its own line, no orphan). Sub rewritten around the
  membership mechanic. Primary CTA "Get early access" -> /register with a
  star-glyph incentive line ("Free to join. Founding members get 3 months of
  membership free at launch."); secondary "See how Redeemo works". Store
  badges removed pre-launch: a quiet two-line launch strip instead (pin +
  "Starting in Huddersfield & surrounding areas, then across the UK"; small
  platform glyphs + "The app arrives at launch: iOS & Android"). Badges
  return when NEXT_PUBLIC_MARKETPLACE_LIVE flips.
  (2) Navbar: "Get the app" -> "Got a business?" (/for-businesses) pre-launch;
  primary CTA now always /register.
  (3) WaitlistSection rebuilt as the FOUNDING TICKET: a red voucher with
  die-cut notches + dashed perforation; offer + three perk ticks left, stub
  right ("3 months / FREE AT LAUNCH" + "Create free account" -> /register).
  No form: registration IS the waitlist (supersedes D1). Huddersfield
  rollout line beneath.
  (4) LaunchLocalityToast: dismissible bottom-left card, 2.6s delay,
  session-remembered, landing only ("Starting in Huddersfield").
  (5) RegisterForm success state pre-launch aware: "You're a founding
  member." + launch-notification promise (no "open the app" before there is
  an app). What-is H2 -> "Made for the places you actually go." (de-dup with
  the new hero phrase).
  Backend follow-up §FOUND.1 recorded in docs/deferrals/open-register.md:
  cohort marking, grant mechanism, badge surface, admin tooling, locality
  capture; pick up with the Admin Panel programme.
- Ribbon v8 BRAND FORM (owner 2026-07-08: the satin fabric ribbon is NOT the
  brand; supplied concept sheets show the voucher-style ribbon: thick matte
  red band, visible edge thickness, die-cut notch at squared ends; "this is
  our branding, do not defer from it"; second note: the divider must never
  read as a straight line: it must flow, thickness variation/ties welcome):
  concept sheets moved into the repo at
  docs/design/customer-web-prelaunch/brand-ribbon/ (two byte-identical
  Downloads duplicates removed). Two production bands cut from the sheets by
  hue-key matte (redness > 45 excludes the red-tinted drop shadows),
  largest-connected-component filter (drops neighbouring poses), edge
  defringe by unpremultiplying against the sheet cream (kills the milky
  fringe over navy), 2x Lanczos: flow-a (sheet 02 wave, fold at right) and
  flow-b (sheet 01 deeper S-wave, notched both ends). RibbonBand rebuilt
  with per-variant baked seam fills (160-pt alpha edges, 6px tuck) and
  taller stages (150px mobile / 300px desktop) so the wave amplitude reads;
  satin band.png + sheen removed (matte material); motion = scroll drift
  x +/-34 and y breathe +/-8. Seam A = variant a (cream to white), seam B =
  variant b flipped (light to navy): the navy handover now rides a genuine
  wave instead of a flat strip.
- Ribbon v9 HI-RES + SITE-WIDE FLOW (owner 2026-07-08: the sheet-cropped
  bands were not crisp at his display; feed the concept sheets to Higgsfield
  and generate motion banners in that exact style; the ribbon should flow
  through the site, peeking in on the sides, coming and going, not only at
  breaks): four purpose-rendered assets generated with flux_2 using concept
  sheet 01 as the style reference: two full-width bands (rhythmic corkscrew
  wave = seam A; deep sweeping wave = seam B, chosen over a rejected
  spiral-around-straight-band take) 4K-upscaled then background-removed, and
  two side pieces (right R-curl; left loop, rerolled once after an awkward
  notched-end render) background-removed at native res. Motion is code, not
  baked video (the hero film precedent: baked motion goes soft; code motion
  stays crisp): bands keep scroll drift + breathe; NEW RibbonPeek component
  slides a loop in from the viewport edge as its host section crosses the
  viewport and back out (useScrollLinked inset + rotate, lg-only,
  pointer-transparent), mounted in WhatIsRedeemo (right) and HowItWorks
  (left). Seam fills re-baked from the new alphas (160 pts, 6px tuck).
  Higgsfield spend this batch: 14cr (6 generations, 2 4K upscales, 4
  background removals); balance 32.38 -> 18.38, owner-directed.
- Conversion quick-wins from the Opus adversarial review (orchestration per
  owner 2026-07-08: Fable adjudicates, Sonnet implements routine, Opus for
  adversarial review): review found the funnel leaking to /how-it-works
  (7 links vs 5 to /register; all three Pricing CTAs went to the info page;
  the page ENDED on dead store badges). Applied (Sonnet implementation,
  Fable-verified): Pricing pre-launch CTAs all route to /register (Free
  "Create free account", Monthly/Annual "Get early access"), headline
  reframed to the founding reality ("This is what membership will cost." +
  3-months-free subline; "upgrade when you're ready" promised an upgrade
  that cannot happen pre-launch); AppCtaFooter pre-launch ends on a "Create
  free account" gradient CTA with the app line as text (badges return at
  launch); "Get first access" label eliminated (one register verb pair
  site-wide); Huddersfield toast arrives later (5.2s) and is compact on
  mobile. ADJUDICATED NOT-DO: voucher-rail type colours stay (they are the
  app's voucher-type tokens, owner-approved on the shelf); ScrollStory/
  HowItWorks repetition trim + social-proof element + hero artwork's
  "Manchester" label queued as owner decisions.
- Ribbon v10 SLOPED FLOW + SPATIAL MOTION (owner 2026-07-08: the corkscrew
  band still read as a straight line: it must enter one side higher and
  leave the other lower; motion should read as the ribbon ROTATING, not
  sliding left-right; side peeks too close to the seam bands, space them
  out and make them smaller): tilt baked into the assets (flow-a -4.5deg so
  it descends left to right; flow-b +3.5deg, descending the other way once
  flipped), seam fills re-baked from the rotated alphas with carried-edge
  handling for the corner columns. Motion is now spatial: the whole band
  block (fills + image together, so the seam stays glued to the fabric)
  turns in perspective: scroll-linked rotateX 9deg to -9deg plus a 1.6deg
  roll, with reduced x drift; the block bleeds -9% vertically so the turn
  never exposes a container edge. Peeks: removed from WhatIsRedeemo and
  HowItWorks (both hugged a seam), remounted small and far from the bands:
  Pricing top-left (200px) and AppCtaFooter top-right (220px), xl-gated,
  beside centred content so they never crowd copy.
- Ribbon v11 SCALE + CLIP FIX (owner 2026-07-08: bands clipped at top/sides/
  bottom and far too big: the navy-break one especially; the side peeks are
  the right size reference): the bands now float inside transparent-padded
  assets (8% vertical + 80px horizontal margins) so no crest or corner can
  ever touch a container edge, including mid-rotation; first over-correction
  (50-60% padding) made the deep wave a thin streak and was rebalanced same
  pass. Per-variant stage heights (corkscrew 230px, deep wave 280px desktop;
  110/130 mobile) bring the visible band body to peek scale. Turn softened
  (rotateX 6deg, roll 1.2deg, drift 22px).
- Hero 3D (owner 2026-07-08: add 3D/WebGL elements to the hero): one element
  done properly rather than many: the brand voucher band as a REAL-TIME
  WebGL object (three + @react-three/fiber, new deps). HeroRibbon3D renders
  a swept rectangular cross-section ribbon (~220 rings recomputed per frame,
  duplicated verts per face so the edges stay crisp, matte MeshStandard red,
  warm key + red rim lights) undulating and twisting through the hero space
  BEHIND the artwork: the collage, frosted veil and floor fade all paint
  above it, so the owner's art keeps top billing while the left side gains a
  soft frosted red current under the copy and a crisp 3D fold emerges beside
  the artwork on the right. Guards: dynamic import ssr:false, desktop-only
  (lives inside HeroCollage's lg gate), skipped for reduced motion, dpr
  capped 1.75, frameloop switches to 'never' whenever the hero is off
  screen. Verified two live frames at 2238px: motion confirmed, headline
  legibility intact behind the veil.
- 3D THROUGH THE PAGE + break ribbons REMOVED (owner 2026-07-12: extend 3D/
  WebGL beyond the hero; the hero band behind the artwork made the right
  side too busy, move its flow elsewhere; the two static section-break
  ribbons look odd and out of place, remove them): HeroRibbon3D generalised
  into RibbonScene3D with presets. Hero mount now lives in a LEFT 58% wrapper
  with a fade mask, so the band flows under the copy behind the veil and
  never crosses the artwork side. New 'navy' preset (slower, narrower,
  deeper, biased low after a first pass ran it through the promise cards'
  text) mounted in FoundingPromiseSection behind the glass cards: red-on-
  navy, the register the removed break band used to carry. RibbonBand
  component + flow-a/flow-b assets DELETED along with both page mounts:
  section seams are flat colour changes again; the ribbon motif now lives in
  the two live 3D scenes plus the two static side peeks (Pricing, footer).
- APP JOURNEY SECTION (owner brief 2026-07-12, copy approved 2026-07-13):
  ScrollStory replaced by AppJourneySection: a 720vh pinned cinema walking
  the REAL app through five chapters with the owner's new captures
  (Desktop/App Screenshots -> public/app-shots/journey, FINAL set + File 5
  vouchers tab + File 8 branch sheet + File 9 PIN-with-keyboard). Chapter
  choreography: 01 Find: stitched Home strip scrolls under a PINNED sticky
  brand header + tab bar (both cropped from the strip so collapse/pinning
  matches the app), ending on a visible tap; 02 Choose: profile strip
  scrolls, the supplied Collapsed Header fades in exactly as the baked tab
  row tucks beneath it, tap on the BOGO voucher; 03 Know: camera pans/zooms
  across the voucher detail (SAVE roundel, terms ticks, chips) and the
  Redeem button glows; 04 Redeem: branch-confirm tap, live PIN entry (clean
  DOM boxes drawn over the capture fill digit by digit while the real
  keyboard's keys flash), a white success flash into the success sheet, then
  the staff QR screen rises in; 05 Keep score: the blanked TOTAL SAVED
  counts up to £325.45 in Mustica over the capture, the six trend bars grow
  via shrinking cover rects, the Jul dot pops, then the lower ledger slides
  up with history rows revealed one by one. The phone turns in real 3D
  perspective between chapters (rotateY keyframes + rotateX + drift), left
  column carries the approved five-chapter copy with a Find/Choose/Know/
  Redeem/Keep-score progress rail and a Create-free-account close on
  chapter five. Every scroll-linked value goes through useScrollLinked.
  Mobile + reduced motion get a static five-block fallback (same copy, one
  still per chapter, register CTA). Geometry fixes from first verification:
  home scroll stops where the baked tab bar meets the pinned overlay;
  profile scroll extended +39px so the baked tabs tuck exactly under the
  collapsed header (fade 0.48-0.58). ScrollStory.tsx removed.
- APP JOURNEY REVISION (owner feedback 2026-07-13, all 11 points): phone
  motion loses rotateY entirely (horizontal turn read as odd): vertical
  rotateX tilt + lateral drift + breathe only, and the phone shrinks to
  340px with the stage padded so it clears the navbar. 01 Find now OPENS on
  the real Home screen (search bar, categories, launch-offer carousel:
  home-top.jpg) before dissolving into the long strip scroll. 02 Choose
  drops the collapsed-header overlay (it duplicated the baked tab row: the
  capture strip is too short for an honest collapse, so the strip scrolls
  naturally instead). All tap markers are brand red. 03 Know drops the
  pan/zoom: the voucher detail sits full screen, tap on Redeem This
  Voucher. 04 Redeem gains the missing beats: tap High Street, tap Confirm
  & Enter PIN, PIN boxes enlarged to fully cover the baked red ring
  (distortion fix), success sheet arrives with deterministic scroll-driven
  CONFETTI (18 pieces), tap View voucher code, then the QR screen: and the
  QR code card physically POPS OUT of the phone (qr-card.jpg crop, global-
  progress bands so it retires before the savings chapter: tightened to
  fade out by 0.796 after verification caught it lingering). 05 Keep score
  stops at the Savings screen itself (savings-more.jpg retired from the
  cinema): savings-top.jpg re-baked with ALL THREE numbers blanked so
  TOTAL SAVED (£325.45), THIS MONTH (£96) and REDEMPTIONS (3) all count
  up live; bar cover rects expanded so no red shows before the bars grow.
  Static fallback updated to match (home-top opener, savings-top-full
  closer). Verified at 2%/36%/78%/79.5%/88% scroll; tsc clean.
- APP JOURNEY REVISION 2 (owner feedback 2026-07-13): the phone is now
  COMPLETELY STILL (all tilt/drift/breathe removed: any motion read as
  odd); tap markers rebuilt to be unmissable (44px pressing core with a
  radial red fill, white rim, and a double expanding ripple); confetti
  rebuilt as a 42-piece rain from the TOP of the phone screen (hash-based
  deterministic values, rounded to 2dp: full-precision floats in inline
  styles fail React hydration), falling with sway and spin across the full
  width; the QR pop-out card is CUT (owner: nothing comes out of the
  phone): qr-card.jpg deleted; redemptions now count to 23; trend bars
  re-measured from the capture by redness scan and mapped through savX()
  (the 800x1703 savings capture is cropped ~3.5px per side by object-cover,
  which had left every overlay ~1% left of the artwork: the cause of the
  red line on the right of the Jul bar). All six bars animate left to
  right, Feb-Apr stubs included, and the Jul bar's true top (0.429, not
  0.48) is now covered. Verified at 17.6%/73.6%/86%/92% scroll; tsc clean;
  no hydration issues.
- APP JOURNEY REVISION 3 (owner feedback 2026-07-13): the QR/redemption-code
  screen now gets a LONG dwell (chapter four extended to the 0.84 boundary,
  track 720vh -> 780vh, in-chapter beats compressed so the flow's
  destination screen holds); the savings chapter no longer crossfades in:
  it is a NEW flow, so the screen SLIDES UP over the QR screen (iOS-sheet
  push with seam shadow) while the QR screen dims beneath: a visibly
  different transition marking the flow break. Trend bars rebuilt as DOM
  REPLICAS: the baked bars are blanked out of the capture and measured
  replicas (positions by redness scan, colours sampled per bar) spring up
  with overshoot: all six now visibly animate, Feb-Apr stubs included. The
  Jul dot is static from screen arrival (owner: the delayed pop looked
  odd; scan proved no dot is baked). Numbers made coherent (owner): this
  month counts to GBP46 (was 96), top places re-set to GBP26/GBP12 and By
  Category Beauty Salon to GBP26 (baked amounts blanked, DOM text in brand
  green over them; fallback savings-top-full re-baked with Mustica/Lato
  drawn values GBP46.00 + 23 + green rows). Assets referenced with ?v=3:
  they were re-baked in place and Next's image optimizer served the stale
  originals (which faked mid-slide bars + garbled amounts during
  verification). Verified at 81.6%/85.5%/91.5%/94.5%/98.5%; tsc clean.
- APP JOURNEY REVISION 3b (owner 2026-07-13: raise the Feb-Apr bars if
  possible, else this-month to eighty-something): BOTH: the bars are DOM
  replicas so they can be any height. The six months now sum EXACTLY to
  the GBP325.45 lifetime total (account opened Feb): 28 + 35 + 42 + 78 +
  56 + 86.45, with this month at GBP86.45 and Jul the tallest bar. In the
  process the original bar scale was found wrong: the first redness scan
  had merged the BAKED trend dot (y 0.429, erased later by the bar blank)
  into the Jul bar top: true Jul height is 0.086, and all replica heights
  were rescaled from it (May at the old scale would have out-topped Jul
  and broken the story). The cinema DOM dot now sits at the design's own
  baked-dot position. Fallback savings-top-full re-baked from the pristine
  git original: GBP86.45 + 23 + green amounts drawn, Feb-Apr bars painted
  UP and May/Jun repainted DOWN to the same scale (Jul untouched: its
  baked height IS 86.45 at this scale); ?v=4. Ghost check on the erase
  zones: pure white. tsc clean; live chart verified at 99% scroll.
