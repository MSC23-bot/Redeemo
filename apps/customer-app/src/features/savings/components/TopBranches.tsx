import React from 'react'
import { View, Image, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { radius, spacing, elevation } from '@/design-system/tokens'
import type { BranchSaving } from '@/lib/api/savings'

// §Savings fidelity fixup-3 2026-05-17 — Insight Card "Top places".
//
// Per direct owner direction during the third fidelity pass:
//   "Listing branches like 'Brightlingsea'/'Colchester' doesn't serve
//    users.  It should be merchants — the merchants they've gone
//    to."
//
// The component now consumes the raw `byBranch[]` payload (backend
// contract from PR #104, unchanged) and groups CLIENT-SIDE by
// `merchantId` so a multi-branch merchant (e.g. Covelum Brightlingsea
// + Covelum Colchester) collapses into ONE row labelled "Covelum"
// with the total saving + total count across the branches.
//
// The component file is still named `TopBranches.tsx` for git-history
// continuity, but the exported name is now `TopPlaces` and the card
// title reads "Top places".  Branch-level identity is intentionally
// hidden in this surface — branch attribution stays in `RedemptionRow`
// where it's load-bearing for the in-store handoff.
//
// Brainstorm pattern (savings-polished.html):
//   .card-title    "Top places"                              (left)
//   .card-title    "This month" / month-name                 (right)
//   .merchant-row  logo + name + "{count} visits"  + saving  (one line)
//   hairline divider between rows (last row has none)
//   max 2 rows

export type MerchantPlace = {
  merchantId:      string
  merchantName:    string
  merchantLogoUrl: string | null
  saving:          number
  count:           number
}

// Group raw byBranch entries by merchantId.  Exported for tests +
// for the screen to feed `places` once (memoised) and pass through.
export function groupByMerchant(branches: BranchSaving[]): MerchantPlace[] {
  const map = new Map<string, MerchantPlace>()
  for (const b of branches) {
    const existing = map.get(b.merchantId)
    if (existing) {
      existing.saving += b.saving
      existing.count  += b.count
      // First non-null logo wins.
      if (!existing.merchantLogoUrl && b.merchantLogoUrl) {
        existing.merchantLogoUrl = b.merchantLogoUrl
      }
    } else {
      map.set(b.merchantId, {
        merchantId:      b.merchantId,
        merchantName:    b.merchantName,
        merchantLogoUrl: b.merchantLogoUrl,
        saving:          b.saving,
        count:           b.count,
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.saving - a.saving)
}

type Props = {
  places: MerchantPlace[]
  onPress: (merchantId: string) => void
  // §Savings fidelity fixup-2 2026-05-17: empty-state hook.  When set
  // + places is empty, the card renders with the supplied copy
  // instead of `null`.  Typical use: "No place savings in March"
  // under a selected past month with no redemptions.
  emptyLabel?: string | undefined
  // §Savings fidelity fixup-3 2026-05-17: brainstorm-pattern context
  // label rendered on the right of the card title.  "This month"
  // for the unselected default; month name (e.g. "April") under a
  // selection.  Omit → no right-side label.
  contextLabel?: string | undefined
}

export function TopPlaces({ places, onPress, emptyLabel, contextLabel }: Props) {
  if (places.length === 0) {
    if (!emptyLabel) return null
    return (
      <View style={styles.card} testID="savings-top-places-empty">
        <CardTitleRow title="Top places" context={contextLabel} />
        <Text variant="body.sm" color="tertiary" style={styles.emptyLabel}>
          {emptyLabel}
        </Text>
      </View>
    )
  }

  const top = places.slice(0, 2)

  return (
    <View style={styles.card} testID="savings-top-places">
      <CardTitleRow title="Top places" context={contextLabel} />
      {top.map((p, i) => {
        const initial = (p.merchantName || '?').charAt(0).toUpperCase()
        const isLast = i === top.length - 1
        const visitWord = p.count === 1 ? 'visit' : 'visits'
        const secondary = `${p.count} ${visitWord}`
        // §Savings device-QA fixup 2026-05-18 — see RedemptionRow for
        // the PressableScale inner-flex bug.  Same shape applied here:
        // outer PressableScale carries the row divider (border-bottom);
        // inner <View> carries the flex-row layout so logo / text /
        // amount sit horizontally with the amount right-aligned.
        return (
          <PressableScale
            key={p.merchantId}
            onPress={() => onPress(p.merchantId)}
            accessibilityRole="button"
            accessibilityLabel={`${p.merchantName}, £${p.saving.toFixed(2)} saved across ${p.count} redemption${p.count !== 1 ? 's' : ''}`}
            style={!isLast ? styles.rowDivider : undefined}
            testID={`savings-top-places-row-${p.merchantId}`}
          >
            <View style={styles.rowInner}>
              {p.merchantLogoUrl ? (
                <Image
                  source={{ uri: p.merchantLogoUrl }}
                  style={styles.logoImage}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={styles.logoFallback}>
                  <Text style={styles.logoInitial}>{initial}</Text>
                </View>
              )}

              <View style={styles.rowText}>
                <Text variant="body.sm" style={styles.primaryName} numberOfLines={1}>
                  {p.merchantName}
                </Text>
                <Text variant="body.sm" color="tertiary" meta style={styles.secondaryName} numberOfLines={1}>
                  {secondary}
                </Text>
              </View>

              <Text style={styles.saving}>£{p.saving.toFixed(2)}</Text>
            </View>
          </PressableScale>
        )
      })}
    </View>
  )
}

// Card-title row used by Top Places, By Category, and the 6-Month
// Trend chart.
//
// §Savings impeccable 3/6 2026-05-17 — context typography moved to
// DESIGN.md tokens.  Was: 10px Lato-Medium on border-default `#D1D5DB`
// (using a BORDER colour for text, also too small to read calmly).
// Now: `label.md` (12px Lato-Medium) on `text.tertiary` per DESIGN.md
// metadata role.  Title text stays at the eyebrow scale (11px Lato-
// Bold, +0.8 tracking, uppercase, text.tertiary).
function CardTitleRow({ title, context }: { title: string; context: string | undefined }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.titleText}>{title}</Text>
      {context ? <Text style={styles.contextText}>{context}</Text> : null}
    </View>
  )
}

// Exported so TrendChart + ByCategory can render the same title row
// without duplicating the styles.
export { CardTitleRow as SavingsCardTitleRow }

const styles = StyleSheet.create({
  // §Savings impeccable 5/6 2026-05-17 — insight cards tokenised.
  // Was: borderRadius 20 (off-token), asymmetric padding spacing[4]/[3].
  // Now: rounded.lg = 16 (DESIGN.md card-default radius), uniform
  // spacing[4] = 16 padding (DESIGN.md tight-cards rule).
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing[4],
    ...elevation.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  titleText: {
    fontFamily: 'Lato-Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#9CA3AF',
  },
  contextText: {
    fontFamily:    'Lato-Medium',
    fontSize:      12,
    lineHeight:    16,
    letterSpacing: 0.4,
    color:         '#9CA3AF',
  },
  // §Savings device-QA fixup 2026-05-18 — the old `row` style lived
  // on PressableScale (which puts it on the OUTER Animated.View, NOT
  // the inner Pressable that contains children).  Flex-row direction
  // never reached the children.  Now split: `rowDivider` is the
  // outer divider-only style (lands on PressableScale); `rowInner`
  // is the flex-row layout (lands on the inner <View>).
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: spacing[3],
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  logoImage: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    flexShrink: 0,
  },
  logoFallback: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoInitial: {
    fontSize: 18,
    fontFamily: 'Lato-SemiBold',
    color: '#9CA3AF',
  },
  rowText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
  },
  primaryName: {
    fontFamily: 'Lato-Bold',
    fontSize: 14,
    color: '#010C35',
  },
  // §Savings device-QA round-8 — visit-count line bumped from 11pt
  // tertiary (#9CA3AF) to 12pt secondary (#4B5563) per owner direction
  // ("nine visits / two visits are a bit difficult to read").  Stays
  // clearly subordinate to the merchant name (14pt bold) but reads
  // confidently as supporting metadata.
  secondaryName: {
    fontFamily: 'Lato-Medium',
    fontSize: 12,
    color: '#4B5563',
  },
  saving: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 18,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
    flexShrink: 0,
  },
  emptyLabel: {
    color: '#9CA3AF',
    fontStyle: 'italic',
    paddingVertical: spacing[2],
  },
})
