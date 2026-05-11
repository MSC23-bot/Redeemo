import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { formatDurationCompact } from '../utils/countdownFormat'
import type { VoucherType } from '@/lib/api/voucher'

type Props = {
  /**
   * Voucher type. M4b-8: drives subtitle source selection.
   *   • TIME_LIMITED → derive "Available again in 18h 24m" from
   *                    `nextWindowStartsAt`. Per-window entitlement
   *                    doesn't have a calendar renewal date — it has
   *                    a next-window opening instant.
   *   • all other types → derive "Renews on 9 June 2026" from
   *                       `availableAgainAt` (cycle renewal date).
   * Optional: when omitted, falls back to the non-TIME_LIMITED branch
   * (preserves existing call-sites + the redeemed-seal unit tests
   * that render the component without a voucher context).
   */
  voucherType?: VoucherType
  /**
   * ISO string for the cycle renewal date — voucher.availableAgainAt.
   * Used by non-TIME_LIMITED vouchers. TIME_LIMITED voucher payloads
   * always carry null here (entitlement is per-window, not per-cycle).
   * Optional: when null/undefined AND voucherType is non-TIME_LIMITED,
   * the seal renders without a subtitle (partial-payload tolerance).
   */
  availableAgainAt?: string | null
  /**
   * ISO string for the next-window opening — voucher.nextWindow.startsAt.
   * Used by TIME_LIMITED vouchers. Non-TIME_LIMITED voucher payloads
   * always carry null here.
   */
  nextWindowStartsAt?: string | null
}

/**
 * RedeemedSeal — text-based "stamp" rendered on Voucher Detail when
 * the redemption is still relevant (cycle hasn't rolled over) but the
 * presentation window has expired AND/OR staff has already validated.
 *
 * Product role (locked 2026-05-08, owner direction during PR #49 review):
 * After the 2-hour presentation window closes, Voucher Detail STOPS
 * showing the redemption code / QR / Show-to-Staff button. The user
 * still needs a clear visual statement that the voucher was used
 * — this seal is that statement. It signals "you redeemed this; it
 * will refresh on <date>" without re-exposing a code that staff
 * could be tricked into scanning a second time.
 *
 * Visual: tilted (-8°) brand-rose badge with two text lines:
 *   • "Voucher Redeemed" (heading, bold)
 *   • "Renews on <date>" (small, secondary)
 *
 * The full polished SVG circular stamp + washed-out coupon hero
 * treatment + merchant-profile redeemed-card design are deferred to
 * the §Q1 redeemed-state visual redesign workstream. This component
 * is the M3 stop-gap that gives the surface a clear "used" signal
 * without that larger design pass.
 *
 * Cross-refs:
 *   - deferred-followups §Q1 (full polished stamp deferred).
 *   - deferred-followups §AE (presentation-window contract).
 *   - utils/presentationWindow.ts (drives WHEN this surfaces).
 */
// Stamp-impact entrance motion (locked 2026-05-09, PR #49 device QA
// wave 14). Owner direction: "add some sort of motion to this voucher
// redeemed stamp on the voucher detail page. Use appropriate motion
// that is relevant to stamps."
//
// Real rubber stamp behaviour: hand brings the stamp down from above
// (gentle approach), it accelerates as it descends, hits the paper
// with a small compression, then settles. Mimicked via:
//
//   Phase 1 (0-260ms — drop): translateY -28 → 0, scale 1.45 → 1,
//     opacity 0 → 1, rotation -2° → -8°. Easing.in(cubic) — starts
//     gently and accelerates, exactly the gravity arc of a stamp
//     coming down.
//   Phase 2 (260-360ms — impact compression): scale briefly
//     overshoots 1 → 1.06 → 1 over ~100ms. Reads as the rubber
//     pressing into the paper before lifting back to its rest
//     height. Sequence preserved via `withSequence` so the
//     overshoot is anchored to the end of phase 1.
//
// `useReducedMotion` skips the entrance — the seal renders in its
// final state immediately so accessibility users still get the
// "redeemed" signal without the motion.
//
// Mount-only animation via `useEffect([])`. If the user navigates
// away and back, the seal re-mounts and the stamp animation plays
// again — natural because each visit IS a fresh "I'm looking at
// this voucher" moment, and the motion is short (<400ms) so it
// doesn't feel intrusive.
const DROP_DURATION_MS    = 260
const IMPACT_DURATION_MS  = 100
const INITIAL_TRANSLATE_Y = -28
const INITIAL_SCALE       = 1.45
const INITIAL_ROTATION    = -2
const REST_ROTATION       = -8
const IMPACT_SCALE        = 1.06

export function RedeemedSeal({ voucherType, availableAgainAt, nextWindowStartsAt }: Props) {
  // M4b-8: subtitle source branches on voucher type.
  //   • TIME_LIMITED → "Available again in <duration>" from
  //                    nextWindowStartsAt. Per-window entitlement
  //                    means there's no calendar renewal date; the
  //                    next-window opening is what the user actually
  //                    needs to know.
  //   • all others   → "Renews on <date>" from availableAgainAt
  //                    (the cycle renewal — UNCHANGED M3 contract).
  // The non-TIME_LIMITED `toLocaleDateString('en-GB', { day, month: 'long',
  // year })` is the existing pattern and is NOT in the Hermes fragility
  // list — see reference_london_clock_helper.md. The fragile patterns
  // are `weekday: 'long'/'short'` (avoided) and `toLocaleTimeString`
  // (avoided). The month-name-via-en-GB-locale pattern is the
  // documented-safe approach used across the customer-app surface.
  let subtitleText: string | null = null
  if (voucherType === 'TIME_LIMITED' && nextWindowStartsAt) {
    const next = new Date(nextWindowStartsAt)
    const durationMs = next.getTime() - Date.now()
    if (durationMs > 0) {
      subtitleText = `Available again in ${formatDurationCompact(durationMs)}`
    }
  } else if (availableAgainAt) {
    const renewalLabel = new Date(availableAgainAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    subtitleText = `Renews on ${renewalLabel}`
  }

  const reducedMotion = useReducedMotion()
  const ty       = useSharedValue(reducedMotion ? 0 : INITIAL_TRANSLATE_Y)
  const scale    = useSharedValue(reducedMotion ? 1 : INITIAL_SCALE)
  const rotation = useSharedValue(reducedMotion ? REST_ROTATION : INITIAL_ROTATION)
  const opacity  = useSharedValue(reducedMotion ? 1 : 0)

  useEffect(() => {
    if (reducedMotion) return
    // Phase 1 — drop with accelerating gravity (ease-in-cubic).
    ty.value = withTiming(0, {
      duration: DROP_DURATION_MS,
      easing:   Easing.in(Easing.cubic),
    })
    rotation.value = withTiming(REST_ROTATION, {
      duration: DROP_DURATION_MS,
      easing:   Easing.in(Easing.cubic),
    })
    opacity.value = withTiming(1, {
      duration: DROP_DURATION_MS * 0.7,
      easing:   Easing.out(Easing.quad),
    })
    // Phase 1 + 2 — drop into target scale, then briefly compress
    // (impact overshoot) and settle back to 1.0. Sequence anchors
    // the overshoot to the end of the drop.
    scale.value = withSequence(
      withTiming(1, {
        duration: DROP_DURATION_MS,
        easing:   Easing.in(Easing.cubic),
      }),
      withTiming(IMPACT_SCALE, {
        duration: IMPACT_DURATION_MS * 0.4,
        easing:   Easing.out(Easing.quad),
      }),
      withTiming(1, {
        duration: IMPACT_DURATION_MS * 0.6,
        easing:   Easing.out(Easing.quad),
      }),
    )
    // Mount-only — empty deps. SharedValues + reducedMotion are
    // stable across renders; eslint-disable for the deps lint
    // because the motion intentionally fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [
      { translateY: ty.value },
      { rotate:     `${rotation.value}deg` },
      { scale:      scale.value },
    ],
  }))

  return (
    <View style={styles.wrap} testID="redeemed-seal">
      <Animated.View style={[styles.seal, animatedStyle]}>
        {/* Title wrapper — relative-positioned so the ink-fade band +
            speckles below can overlay the title at controlled
            positions. Locked 2026-05-09 PR #49 device QA wave 9
            (matches owner's reference screenshot of the original
            stamp with visible top-clipping + missing-ink character).
            Three distress overlays combine into the rubber-stamp
            feel:
              1. `inkFadeTop` — thicker cream band cuts visibly into
                 the top of letter ascenders (the "rubber didn't
                 fully press at the top" look).
              2. `inkSpeckle` × 5 — small cream dots scattered
                 through the text simulating where ink didn't
                 transfer from the rubber stamp. Positions are
                 percentage-based + varied in y so they look
                 unevenly distributed, not lined up.
              3. Title opacity 0.92 + sharper textShadow → ink-
                 pressure character on the strokes themselves. */}
        <View style={styles.titleWrap}>
          <Text variant="label.md" style={styles.title}>
            Voucher Redeemed
          </Text>
          {/* Top-edge ink fade — wave 10 (locked 2026-05-09 from
              owner's "still looks too clean" QA): 5 → 7px tall and
              0.75 → 0.92 opacity. The top of letter ascenders is
              now unmistakably faded — visible as a clear pale band
              cutting into the upper third of "VOUCHER REDEEMED". */}
          <View style={styles.inkFadeTop} pointerEvents="none" />
          {/* Mid-stroke distress band — wave 10 addition. A second
              thinner cream band cuts horizontally across the middle
              of the letter strokes at ~55% down the line height.
              Reads as "ink missing along this row", breaking up the
              letter strokes the way a real rubber stamp does when
              the rubber is uneven. Lower opacity (0.45) so it's
              suggestive, not a solid line. */}
          <View style={styles.inkFadeMid} pointerEvents="none" />
          {/* Ink-missing speckles — wave 13 (locked 2026-05-09 from
              owner QA "7th letter of REDEEMED still has a speckle"):
              defensively removed the 62% speckle. By uniform-width
              math 62% lands on the E-D boundary, but real letter
              widths vary so the speckle's right edge could overlap
              the E in REDEEMED. Removing it eliminates ambiguity —
              all remaining 4 speckles are safely in the LEFT half
              of the title (over "VOUCHER"), leaving the right half
              ("REDEEMED") clean of speckles. The visual rhyme with
              the title's other distress (top-fade band, mid-stroke
              band, ink-pressure textShadow) carries the rubber-stamp
              feel even with fewer dots on the right side. */}
          <View style={[styles.inkSpeckle, { top: 17, left: '18%', width: 4, height: 5 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 22, left: '29%', width: 6, height: 4 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 11, left: '40%', width: 5, height: 6 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 19, left: '50%', width: 4, height: 4 }]} pointerEvents="none" />
        </View>
        {subtitleText ? (
          // Subtitle wrapper — same distress overlay treatment as
          // the title, scaled down for the 13pt subtitle. Wave 11
          // (locked 2026-05-09 from owner QA: "apply the same style
          // … on the renews on 6 June 2026 renewal date as well").
          // M4b-8: subtitle text source now branches on voucher type
          // ("Renews on …" for cycle vouchers, "Available again in …"
          // for TIME_LIMITED). Distress overlay treatment is identical
          // in both cases — the rubber-stamp DNA is preserved.
          <View style={styles.subtitleWrap}>
            <Text variant="label.md" style={styles.subtitle}>
              {subtitleText}
            </Text>
            {/* Subtitle distress — wave 12 (locked 2026-05-09 from
                owner QA): removed all 3 speckles per direction; kept
                the top-fade band; ADDED a light mid-stroke band.
                Both bands are scaled down + lighter than the title's
                versions so the 13pt subtitle text stays readable. */}
            <View style={styles.subtitleInkFadeTop} pointerEvents="none" />
            <View style={styles.subtitleInkFadeMid} pointerEvents="none" />
          </View>
        ) : null}
        {/* Note (wave 14, locked 2026-05-09 from owner QA): all
            border distress strips have been removed per owner
            direction "completely remove the speckles from the red
            borders around the card". The clean 4px brand-rose
            border carries the seal's outer shape; the rubber-stamp
            character is delivered by the title + subtitle distress
            overlays alone. */}
      </Animated.View>
    </View>
  )
}

// Locked 2026-05-09 PR #49 device QA wave 5 — seal prominence boost +
// wave 6 clipping fix.
//
// Wave 5 (prominence) tweaks:
//   • Solid pale-cream fill behind the stamp (was rgba(red, 0.06)
//     translucent — got lost against the washed-out hero).
//   • Bumped border 3px → 4px, slightly darker brand-rose ink.
//   • Shadow opacity 0.2 → 0.35 + larger radius for separation from
//     the hero text behind it.
//   • Heavier text weight + larger title size (18→22) so it reads
//     first; subtitle slightly larger too.
//
// Wave 6 (clipping fix) — owner direction: "the top of 'VOUCHER
// REDEEMED' is clearly cut off, especially across the upper strokes".
// The previous title style had no explicit `lineHeight`; the design-
// system Text variant's default lineHeight was smaller than the
// bumped fontSize, so RN clipped letter ascenders at the line-box
// top. Fix:
//   • Explicit `lineHeight: 32` for a 22pt fontSize (1.45× ratio)
//     gives ascenders generous headroom — well above the 1.2× minimum
//     for `fontWeight: '900'` + uppercase glyphs.
//   • `includeFontPadding: true` (Android default; explicit here for
//     intent) preserves the native font's top metric padding.
//   • Subtitle gets explicit lineHeight too.
//   • Seal `paddingVertical` 16 → 20 for breathing room above/below.
// Rustic feel preserved via the textShadow + opacity + tilt — NOT
// via clipping the glyphs.
const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  seal: {
    // Rotation now lives on the animated transform (rest at -8°
    // after the entrance motion settles). Wave 14 — keep the
    // static transform OUT of styles so it doesn't conflict with
    // the animated transform array.
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: color.brandRose,
    // Solid pale-cream fill — high contrast against the washed-out
    // hero gradient behind the stamp, making the red border + text
    // read as the dominant element. Faintly warm so it doesn't read
    // as "white sticker on green coupon" (which would feel like a
    // notification, not a stamp).
    backgroundColor: '#FFF6EE',
    shadowColor: color.brandRose,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    alignItems: 'center',
    // overflow:visible is the RN default — being explicit here so a
    // future refactor doesn't accidentally enable overflow:hidden
    // (which would re-introduce the wave-6 clipping bug).
    overflow: 'visible',
    gap: 6,
  },
  // Wave 7 (rustic feel) — locked 2026-05-09 PR #49 device QA.
  // Owner direction: "give it a rustic look so it looks like a genuine
  // rubber seal stamp. The line at the top should stay visible, but
  // it should be thin … rustic feel … like a proper rubber seal stamp."
  // Two compound techniques:
  //   1. Slight overall opacity reduction (0.94) — moves the title
  //      off "perfectly printed digital text" toward "actual ink".
  //   2. A 3px cream-tinted band overlay (`inkFadeTop`) sits across
  //      the top edge of letter ascenders, simulating where the
  //      rubber didn't make full contact at the upper edge. The
  //      red text underneath stays visible at 45% (cream is 55%
  //      opaque) — letters remain identifiable, but their top
  //      strokes (E top bar, R/D/T tops) read as faintly faded.
  //   3. Tighter, sharper textShadow (offset 0.5/0.5, radius 0,
  //      opacity 0.45) — mimics ink slightly bleeding to one side
  //      under stamp pressure, more "pressed onto paper" than
  //      "rendered on a screen".
  // Rustic feel comes from these three combined, NOT from
  // geometric clipping of the glyphs (the prior wave-6 clipping
  // bug). overflow:visible on the seal stays in place.
  titleWrap: {
    position: 'relative',
  },
  title: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '900',
    color: color.brandRose,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    includeFontPadding: true,
    // Wave 9 (rustic — locked 2026-05-09 from owner reference
    // screenshot). Slightly more pronounced fade than wave 7
    // (0.94 → 0.92) — combines with the textShadow to give the
    // text an "ink that's slightly faded" character.
    opacity: 0.92,
    textShadowColor: 'rgba(226,12,4,0.45)',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 0,
  },
  // Top-edge ink-pressure fade. Wave 10 (locked 2026-05-09 from
  // owner's "still looks too clean" QA — bumped from wave 9's
  // 5px@0.75 to 7px@0.92). The top quarter of letter ascenders
  // is now unmistakably faded — reads as a visibly pale band
  // cutting across the upper portion of "VOUCHER REDEEMED",
  // exactly the rubber-stamp "rubber didn't press at the top"
  // look from the owner reference screenshot. Sits over the top
  // of glyphs at near-solid cream; the lower ~65% of each glyph
  // is full red so letters remain unambiguously identifiable.
  inkFadeTop: {
    position: 'absolute',
    top: 3,
    left: -8,
    right: -8,
    height: 7,
    backgroundColor: 'rgba(255, 246, 238, 0.92)',
  },
  // Mid-stroke distress band — wave 10 addition. Thinner cream
  // band cuts horizontally across the middle of the letter
  // strokes (~55% down the line box). Reads as "ink missing along
  // this row", breaking up the letter strokes the way a real
  // rubber stamp does when the rubber is uneven. Lower opacity
  // (0.45) so it's suggestive of broken ink, not a solid line.
  inkFadeMid: {
    position: 'absolute',
    top: 17,
    left: -8,
    right: -8,
    height: 2,
    backgroundColor: 'rgba(255, 246, 238, 0.45)',
  },
  // Ink-missing speckles. Wave 10 (locked 2026-05-09 from owner
  // QA). Bumped from 5 cream-on-red dots @ 0.85 opacity → 9 dots
  // @ 1.0 opacity (solid cream — "white dots in the red ink",
  // matching the owner's literal phrasing). Sizes 4-7px (was
  // 3-5px) so they're clearly visible against the letter strokes.
  // Hand-positioned to fall over actual letter glyphs rather than
  // gaps between letters; reads as natural ink-pressure variance
  // on a real rubber stamp.
  inkSpeckle: {
    position: 'absolute',
    borderRadius: 2.5,
    backgroundColor: '#FFF6EE',
  },
  subtitleWrap: {
    position: 'relative',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: color.brandRose,
    letterSpacing: 0.6,
    includeFontPadding: true,
    // Wave 11 — match the title's slight ink-fade character at
    // the smaller scale.
    opacity: 0.92,
    textShadowColor: 'rgba(226,12,4,0.35)',
    textShadowOffset: { width: 0.4, height: 0.4 },
    textShadowRadius: 0,
  },
  // Subtitle top-edge fade — same overlay trick as the title but
  // scaled to the 18px lineHeight. Lands at top:2 (subtitle's
  // ascender top within the 18px line box) with a 3px-tall band
  // at 0.85 opacity. Reads as the same rubber-stamp top-clip on
  // the smaller text without overwhelming it.
  subtitleInkFadeTop: {
    position: 'absolute',
    top: 2,
    left: -6,
    right: -6,
    height: 3,
    backgroundColor: 'rgba(255, 246, 238, 0.85)',
  },
  // Subtitle mid-stroke band — wave 12 addition. Owner direction:
  // "lightly" applied to the renewal date. Lower opacity (0.30 vs
  // title's 0.45) and thinner (1px vs 2px) so the 13pt subtitle
  // doesn't lose readability. Lands at top:9 (~50% down the 18px
  // line box).
  subtitleInkFadeMid: {
    position: 'absolute',
    top: 9,
    left: -6,
    right: -6,
    height: 1,
    backgroundColor: 'rgba(255, 246, 238, 0.30)',
  },
  // (Wave 14: borderStrip style removed — owner direction.)
})
