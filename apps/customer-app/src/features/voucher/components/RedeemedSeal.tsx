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
          <View style={styles.inkFadeTop} pointerEvents="none" />
          {/* Ink-missing speckles. Five cream dots at varied
              percentages + heights overlay the title at fixed
              points. Sizes vary 3-4px; some round, some slightly
              elongated — reads as natural ink-pressure variance
              rather than a regular pattern. */}
          <View
            style={[styles.inkSpeckle, { top: 10, left: '14%', width: 3, height: 4 }]}
            pointerEvents="none"
          />
          <View
            style={[styles.inkSpeckle, { top: 19, left: '32%', width: 4, height: 3 }]}
            pointerEvents="none"
          />
          <View
            style={[styles.inkSpeckle, { top: 13, left: '52%', width: 3, height: 5 }]}
            pointerEvents="none"
          />
          <View
            style={[styles.inkSpeckle, { top: 21, left: '71%', width: 4, height: 3 }]}
            pointerEvents="none"
          />
          <View
            style={[styles.inkSpeckle, { top: 11, left: '88%', width: 3, height: 4 }]}
            pointerEvents="none"
          />
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
  // Top-edge ink-pressure fade. Wave 9 (locked 2026-05-09 from
  // owner reference): thicker (3 → 5px) and more opaque (0.55 →
  // 0.75) so the top of letter ascenders is VISIBLY clipped — the
  // rubber-stamp "rubber didn't fully press at the top" look the
  // owner asked for in the reference screenshot. The cream band
  // sits over the top of the glyphs; from a distance the letter
  // tops read as cut/faded, but the lower 70% of each glyph is
  // full red so letters are still unambiguously identifiable.
  inkFadeTop: {
    position: 'absolute',
    top: 4,
    left: -8,
    right: -8,
    height: 5,
    backgroundColor: 'rgba(255, 246, 238, 0.75)',
  },
  // Ink-missing speckles. Small cream dots overlaid on the title
  // at percentage-based horizontal positions + varied vertical
  // offsets simulate natural ink-pressure variance on a real
  // rubber stamp. Owner direction: "we could have some dots,
  // white dots in the text here and there, as if ink missing
  // from certain parts of letters". Each speckle uses a small
  // border-radius for a soft round/pill shape rather than crisp
  // rectangles. Background opacity 0.85 — strong enough to read
  // as ink missing, not strong enough to hide the underlying
  // letter stroke.
  inkSpeckle: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: 'rgba(255, 246, 238, 0.85)',
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
