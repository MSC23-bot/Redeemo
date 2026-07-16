# /for-businesses Section 2: "How Redeemo works" journey cinema

Status: implementing (Tier 2) · Owner handoff 2026-07-16 (visual pack + locked copy) · Branch: feat/website-polish

## What is being built

The second page section: a scroll-led, pinned narrative that turns the hero's angled
laptop/phone group toward the viewer over a dark local-map plate and walks four locked
beats (create voucher, appear in discovery, customer visit, merchant validation), ending
on the validation-success state and the locked closing line. No CTA. Copy is locked by
the owner handoff; the five status annotations are live HTML.

## Architecture decisions (Fable, 2026-07-16)

1. **One combined pinned band, not two sections.** The requested transition (hero copy
   fades, the device group travels toward centre and rotates to face the viewer while the
   cafe plate dissolves into the map plate) cannot happen across two separate sticky
   sections: between two pinned bands there is an unpinned scroll gap where no shared
   element can animate. `ForBusinessesCinema` (new) owns a single tall band + one sticky
   viewport; the approved hero stage is re-hosted inside it unchanged (its internal
   animation curves are remapped onto the first slice of the band's progress). This is a
   re-host, not a hero redesign; approved hero copy and visuals are untouched.
2. **Seam.** Hero exit adds only: copy column fades to 0 (was 0.4) and the five growth
   cards fade out at the band's hero tail. The journey's angled-cluster replica mounts at
   the identical stage placement (including the hero's 1.04 end scale) so the swap is
   invisible; the cafe stage then dissolves to the map plate beneath while the cluster
   travels, scales and crossfades to the front-facing cutout (rotateY handoff on both).
3. **Real product material.** Laptop: real voucher-builder capture (static crop; a fake
   whole-page scroll would visibly scroll the fixed sidebar, so no builder scrub),
   then validation modal, then validation success. Phone: voucher preview -> discovery
   home -> present-to-staff code -> customer success. All demo data in captures is
   fictional (Jane S., The Old Foundry Kitchen).
4. **No new WebGL.** The map plate's baked pins + 2-3 CSS pulse accents carry the
   location story; the hero's existing ember canvas persists at reduced presence. One
   restrained canvas total, per handoff.
5. **Annotations.** The five locked status pairs render as an accumulating live-HTML
   rail above/right of the devices, front-facing (flat) to match the front camera state;
   the reference PNG's extra body lines are dropped to control clutter (reported, not
   silent). Rail is aria-hidden; the four beat blocks carry the story in DOM order.
6. **Responsive/a11y.** Desktop pins; tablet/mobile/short/reduced-motion get a stacked
   four-scene layout (one device visual + beat copy + 1-2 status chips per scene) with
   every piece of locked copy present. SSR default is the stacked layout (no-JS safe).

## Files

- `components/for-businesses/HeroCinematic.tsx`: extract/export `HeroStage` (sticky-viewport
  contents, progress as prop), export `HeroStacked` + shared stage constants; hero tail fades.
- `components/for-businesses/JourneyCinematic.tsx` (new): `ForBusinessesCinema` band owner,
  journey stage layers, beats, status rail, stacked scenes.
- `components/for-businesses/ForBusinessesContent.tsx`: swap `<HeroCinematic/>` for
  `<ForBusinessesCinema/>`.
- `public/for-businesses/journey/`: map bg, front-devices cutout (laptop screen punched),
  3 laptop crops, 4 phone screens (webp, optimised).

## Verification

tsc, production build, `git diff --check`, Playwright QA at 1600x900 / 768 / 390 / 344,
reduced motion, overflow scan, console/network clean, seam continuity walk, screenshot
comparison against pack references. Hold for Codex review + owner SHA approval; no merge.

## Round 2 (owner feedback 2026-07-16)

Owner rulings: hero must read untouched (it was; the transition implied otherwise);
the front devices' screens must fit naturally (round 1's phone rect was under-measured,
leaving a white ring; the builder crop cut the portal top bar); screens must tell each
beat's story WITH motion inside the devices; the travelling-cluster transition read as
"floating" and is rejected; the five scattered status cards are rejected.

Revisions: (1) transition becomes a filmic dissolve: the whole hero plate fades and
pulls back, the map plate settles beneath, and the front pair turns into place where
it stands (rotateY + scale settle, no positional flight). (2) Laptop beat 01 becomes
the real builder page with pinned chrome and a scrolling content pane (hero-dashboard
technique; new journey-builder.webp full-chrome crop + journey-builder-strip.webp).
(3) Phone beat 02 scroll-scrubs the app home feed reusing the hero's own feed assets.
(4) Phone screen rect re-measured at threshold 195 to kill the white ring. (5) Status
cards replaced by a JOURNEY ROUTE: five stops on a progress line drawn under the
devices across the map plate, kickers under each stop, the active stop's locked line
centred beneath, final stop green. Clears the navbar entirely.

## Section 3 (owner copy locked 2026-07-16; built same day)

Copy: owner draft passed through the seven sweeps; owner approved the edited deck
keeping the paying-members line (01) and the honest optional-paid featured disclosure
(07). Component: FavourSection.tsx on brand cream, navy-to-cream curved seam over the
cinema's night scene with a sunrise glow. Four DISTINCT group treatments (owner: no
repeated structure): A bento with living micro-visuals (radar, profile, footfall,
return loop); B interactive console (vertical tabs + visual panels: 7 voucher-type
chips in app colours, quiet-hours calendar, featured card with paid disclosure,
busiest-days chart with Export CSV) with gentle autoplay until engaged; C the real
portal under a moving spotlight (animated clip-path bright window + ring); D a navy
till receipt printing its zeros beside the four money items; closing couplet with the
Brand Full Stop. In-flow (no pinning). Replaces legacy VALUE_PROPS + COMPARISONS
sections. Magic MCP was consulted per owner instruction but returned malformed
protocol responses on every call (server-side fault); design proceeded on house
language. QA fix: `armed` deferred-mount gating in JourneyCinematic removed after a
deep-reload left mid-scroll-mounted layers with dead motion subscriptions (blank
screens); all layers now mount from the start.

## Section 4: the Merchant Portal (owner brief 2026-07-16; built same day)

Dark stage on the owner-supplied glass-ticket plate (Downloads "Generated image 1 (9)",
now portal-bg.webp), rounded-top sheet over Section 3's cream. Centrepiece = a
LIVE-RENDERED portal shell (browser chrome + top bar + sidebar in code), which by
construction guarantees an identical sidebar on every screen, excludes the demo pills
and drops the coming-soon items (owner requirements). Real captured CONTENT panes sit
inside (cropped below topbar, right of sidebar, from the Desktop screenshot library;
Branches and Staff & access verified fictional-only). The sidebar is the switcher: six
destinations (Home, Vouchers, Redemptions, Insights, Branches, Staff) flip the pane
with a soft slide; screens live inside (dashboard + builder panes slow-scroll, a
validation toast pops on Redemptions, the bell wears a pulsing badge); the window
tilts in perspective and follows the pointer. One glass blurb card narrates the
active screen (copy from Section 3's former Manage group). Mobile: pill switcher +
flat pane + blurb. Replaces the legacy PortalShowcaseSection. Magic MCP attempted
again per owner instruction: still returns malformed protocol responses (3rd strike).
QA fixes: measured window scaling (ResizeObserver), sidebar type-scale up for
legibility, tilt springs start flat and engage post-mount (useReducedMotion branch
hydration-mismatched otherwise).

## Section 5: final conversion panel (owner brief 2026-07-17; built same day)

Owner locked Section 4 and retired the page's whole legacy tail: the voucher-structure
section ("Two standard offers"), the getting-started timeline, MerchantInterestSection
("Get your business ready for launch") and the old final CTA are all replaced by ONE
contained navy panel on cream (FinalCta.tsx), keeping the card treatment the owner
likes. Content follows the owner's approved structure with copy tightened per the
copywriting skill: headline "Ready to list your business?" (gradient ink on "your
business", owner-loved device), two-sentence body (free portal account today; two
flagship vouchers as the customer commitment, then custom vouchers on your own value,
terms and timing), a "wall of zeros" (four stat cards: £0 listing fee, £0 monthly
platform fee, 0% commission, £0 redemption fee) whose numerals roll odometer-style and
settle on 0 (useInView must observe the clipped 1em window, not the 4em strip: the
strip can never satisfy amount>=0.5 through the clip), payoff line "Your only cost is
the offer you designed, and only when a customer walks in.", a "What we ask in return"
honesty row as two die-cut ticket chips (CSS mask notches; echoes Section 3 tickets:
two flagship vouchers before go-live + 12-month partnership agreement), gradient CTA
"List your business free" straight to merchant portal /register with "About two
minutes. No card details required." microcopy. New section carries id
"register-interest" defensively (no live links; Footer comment updated).
MerchantInterestSection.tsx stays on disk UNIMPORTED: it holds the flag-gated D1
lead-capture slice and the D-F merchant mailbox; deleting it is an owner call.
Magic MCP attempted again per owner instruction: still malformed (4th strike).

### Section 5 v2: the merchant ticket (owner feedback 2026-07-17, same day)

Owner rejected v1's navy panel: navy-on-navy after the portal read as "too much", the
card as "a big blob", the section break as odd. v2: the finale IS a giant white
Redeemo voucher ticket (the object the whole page has been building), die-cut with a
perforated tear-off stub (CSS mask notches; drop-shadow filter so the shadow follows
the silhouette; overflow-hidden so the stub tint respects the corners). Main body
carries eyebrow/headline (gradient ink kept)/body/zeros-on-ticket/asks; the cream
stub carries logo, "Your invitation", the CTA, microcopy and a decorative barcode.
Transition solved by a straddle: the section opens with a band of the same #010C35
navy flowing seamlessly out of the portal section, then returns to cream, and the
ticket sits across the boundary. Stub constants must stay in sync with the mask
(mobile stub h-260 / notches at calc(100% - 260px); desktop stub w-330 / notches at
calc(100% - 330px)).
