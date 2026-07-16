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
