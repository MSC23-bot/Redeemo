# Landing Page Scroll Narrative · Storyboard & Structure (v1, for owner review)

2026-07-06 · Fable. Status: PROPOSED, not implemented. Owner direction: full-page
scroll animation from the very top (Apple-style), Higgsfield-generated video/animation
as scrolling background with messages over it, all voucher types represented, better
conversion flow. This document is the storyboard to approve before any build.

## 1. Page structure (top to bottom, one continuous story)

| # | Act | Section | Ground | Job | CTA |
|---|-----|---------|--------|-----|-----|
| 1 | Arrive | Hero | Navy + video | "The best local spots near you. Members pay less." Instant comprehension + first CTA | Get early access |
| 2 | Understand | Find | Cream + video | Curated independent places; browse free | none (story) |
| 3 | Understand | Choose | White | ALL 7 voucher types as a rotating deck of real voucher cards around the phone | none (story) |
| 4 | Understand | Redeem | Navy | The code moment; verified in seconds; once per place per month | none (story) |
| 5 | Believe | The maths | Cream | £6.99 against one real saving; membership pays for itself (arithmetic, no invented stats) | soft: See pricing |
| 6 | Believe | The standard | Navy | Chosen places, honest terms (curation + no-surprises) | none |
| 7 | Act | Pricing | White | Free / £6.99 / £69.99, facts unchanged | Get first access |
| 8 | Act | Waitlist | Cream | Email + postcode capture (post-D1); incentive line | Join the waitlist |
| 9 | Act | Merchant bridge | Gradient band | Route business owners out to /for-businesses | Find out more |
| 10 | Act | App footer | Navy | "The app arrives with launch" | waitlist echo |

Scroll behaviour: sections 1-4 are ONE pinned cinematic sequence (the phone enters in
the hero and persists through Redeem; background video + colour journey scrubbed by
scroll). Sections 5-10 return to normal scrolling with restrained entrance motion, so
the page gets calmer exactly where the visitor needs to read and decide. Persistent
nav CTA throughout. Reduced-motion and mobile v1: static posters + current static
sections; a mobile-tuned sequence is a follow-up.

Fixes vs current build: story starts at the top (hero is chapter zero, not a separate
demo); all 7 voucher types shown (deck, not 4 chapters); video atmosphere layers behind
the code-rendered UI (UI stays crisp, honest, and cheap to update).

## 2. Higgsfield video storyboard (scroll-scrubbed background clips)

House style: the app's own 3D illustration language (soft clay-render, rounded,
playful-premium objects) in brand colours (rose #E20C04, coral #E84A00, navy #010C35,
cream #FFF9F5). No text in video, no logos, no people/faces, no readable signage,
addresses or phone numbers. Fictional everything.

| Clip | Length | Scene | Used at |
|------|--------|-------|---------|
| H1 "Hero drift" | 6-8s loopable | Dark navy space, volumetric rose-coral light, brand-coloured 3D objects (coffee cup, pizza slice, gift box, dumbbell) drifting in slow parallax | Hero (scrubbed) |
| H2 "High street glide" | 5-6s | Miniature clay-render UK high street diorama, generic blank shopfronts, warm evening light, rose map pins blooming as camera dollies | Find |
| H3 "Voucher bloom" | 4-5s | 3D voucher cards in the 7 type colours fanning out like a dealt hand, floating weightless on white | Choose transition |
| H4 "Code glow" | 4s | Ambient navy scene, soft light sweep and particle glow (backdrop only; the phone + code stay code-rendered on top) | Redeem |

Draft prompt skeleton (per clip, refined at generation time): style anchor images from
the approved reference kit + "soft matte clay 3D render, rounded forms, premium playful,
Redeemo brand palette (deep navy #010C35 ground, rose #E20C04 to coral #E84A00 light
accents, warm cream highlights), cinematic shallow depth of field, slow dolly, no text,
no logos, no people, no readable signage".

Technique: generate stills first (cheap) to lock art direction, then image-to-video
from the approved stills for motion consistency. Integration: muted inline video,
scroll-scrubbed (currentTime or canvas frame-sequence, decided after testing clip
encoding); poster frames for reduced-motion/mobile/no-JS; lazy-loaded below the fold;
hero clip budgeted hard (target <2.5MB compressed for the hero, posters <100KB).

## 3. Reference kit proposed for upload to Higgsfield (owner approval required)

1. `app-browse-3x.png`, `app-voucher-3x.png`, `app-code-3x.png` (816x1566 captures of
   our code-rendered app preview; synthetic places only).
2. 2-4 of the app's 3D category card assets (food-drink, beauty-wellness,
   health-fitness, out-about) as style anchors.
3. Brand palette + art-direction text (this document's style block).
NOT uploaded: source code, real screenshots with any live data, portal captures
(withheld from generation v1; not needed for the four clips), anything from staging,
secrets, PII.

## 4. Production sequence and cost gates

1. Owner: `higgsfield auth login` (CLI; usable immediately in this session). The MCP
   server is also registered (user scope) but authenticates only in an interactive
   session; the CLI is the official Claude Code path and does everything needed.
2. Fable: check plan credits (`higgsfield account credits`) and quote per-generation
   cost (`higgsfield generate cost`) BEFORE anything runs.
3. Phase 1 (needs D4 approval with the quoted numbers): ~8-12 stills across H1-H3
   directions; Fable curates to one direction per clip; owner picks/vetoes.
4. Phase 2 (separate approval): animate 3-4 approved stills to clips.
5. Phase 3 (separate approval): scroll-scrub integration build per §1.

## 5. Open questions for the owner

- Approve the §1 structure (or reorder: e.g. pricing before the standard band)?
- Approve the §3 reference kit for upload?
- D4: credit budget ceiling for Phase 1 once numbers are quoted?
- Taste check: the H2 high-street diorama is the most "art-directed" bet; happy to
  swap for a more abstract Find scene if the miniature world feels off-brand.
