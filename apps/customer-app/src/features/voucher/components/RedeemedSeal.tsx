import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  /**
   * ISO string for the cycle renewal date — voucher.availableAgainAt.
   * Optional: when null/undefined, the seal still renders ("Voucher
   * Redeemed") but the renewal subline is suppressed. The seal is
   * cycle-aware on the happy path; on partial-payload edge cases it
   * degrades gracefully rather than crashing.
   */
  availableAgainAt?: string | null
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
export function RedeemedSeal({ availableAgainAt }: Props) {
  const renewalLabel = availableAgainAt
    ? new Date(availableAgainAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <View style={styles.wrap} testID="redeemed-seal">
      <View style={styles.seal}>
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
          {/* Ink-missing speckles — wave 10 increases count 5 → 9
              and sizes 3-5px → 4-7px and opacity 0.85 → 1.0 (solid
              cream — "white dots" in the red ink). Positions are
              hand-tuned to fall over letter strokes rather than
              between letters. */}
          <View style={[styles.inkSpeckle, { top: 9,  left: '8%',  width: 5, height: 5 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 17, left: '18%', width: 4, height: 5 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 22, left: '29%', width: 6, height: 4 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 11, left: '40%', width: 5, height: 6 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 19, left: '50%', width: 4, height: 4 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 14, left: '62%', width: 7, height: 5 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 23, left: '73%', width: 5, height: 4 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 10, left: '83%', width: 4, height: 6 }]} pointerEvents="none" />
          <View style={[styles.inkSpeckle, { top: 20, left: '92%', width: 5, height: 4 }]} pointerEvents="none" />
        </View>
        {renewalLabel ? (
          <Text variant="label.md" style={styles.subtitle}>
            Renews on {renewalLabel}
          </Text>
        ) : null}
      </View>
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
    transform: [{ rotate: '-8deg' }],
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
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: color.brandRose,
    letterSpacing: 0.6,
    includeFontPadding: true,
  },
})
