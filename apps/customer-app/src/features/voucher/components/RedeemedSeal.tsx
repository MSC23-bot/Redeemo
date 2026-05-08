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
        <Text variant="label.md" style={styles.title}>
          Voucher Redeemed
        </Text>
        {renewalLabel ? (
          <Text variant="label.md" style={styles.subtitle}>
            Renews on {renewalLabel}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  seal: {
    transform: [{ rotate: '-8deg' }],
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: color.brandRose,
    backgroundColor: 'rgba(226,12,4,0.06)',
    shadowColor: color.brandRose,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: color.brandRose,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: color.brandRose,
    letterSpacing: 0.5,
    opacity: 0.85,
  },
})
