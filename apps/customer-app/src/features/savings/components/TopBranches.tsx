import React from 'react'
import { View, Image, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { spacing, radius, elevation } from '@/design-system/tokens'
import { branchShortName } from '@/features/merchant/utils/branchShortName'
import type { BranchSaving } from '@/lib/api/savings'

// §Savings Rebaseline (PR-B, Revision 2) — Insight Card 2 "Top
// branches".  Renamed from `TopPlaces`; the merchant-level aggregation
// was the Revision-1 contract.  Per the branch-as-PRIMARY-unit locked
// product rule (memory `project_branch_first_class_platform_rules.md`,
// 2026-05-03), multi-branch merchants surface as MULTIPLE rows.
//
// Primary line: `branchShortName(branchName)` so `"Covelum —
// Brightlingsea"` reads as `"Brightlingsea"` — matches the Merchant
// Profile branch list convention.  Secondary line carries `merchantName`
// untrimmed so the merchant identity stays visible.
//
// Tap routes the parent screen to `/(app)/merchant/{merchantId}?branch
// ={branchId}` so cold-open lands on the right branch in the picker.

type Props = {
  branches: BranchSaving[]   // sorted desc by saving — backend provides this
  onPress:  (branchId: string, merchantId: string) => void
  // §Savings fixup 2026-05-17: when the parent wants the card to
  // appear even with empty data (typically: user has drilled into a
  // past month with no branch redemptions), it supplies an explicit
  // empty-state label like "No branch savings in March".  Without
  // this prop the component falls back to the original null-render
  // — preserves the current-month "no insight" path which silently
  // hides the card on cold-start users.  Explicit `| undefined` for
  // tsc strict `exactOptionalPropertyTypes`.
  emptyLabel?: string | undefined
}

export function TopBranches({ branches, onPress, emptyLabel }: Props) {
  if (branches.length === 0) {
    if (!emptyLabel) return null
    return (
      <View style={styles.card} testID="savings-top-branches-empty">
        <Text variant="label.eyebrow" style={styles.sectionLabel}>Top branches</Text>
        <Text variant="body.sm" color="tertiary" style={styles.emptyLabel}>
          {emptyLabel}
        </Text>
      </View>
    )
  }

  const top = branches.slice(0, 2)

  return (
    <View style={styles.card} testID="savings-top-branches">
      <Text variant="label.eyebrow" style={styles.sectionLabel}>Top branches</Text>
      {top.map((b, i) => {
        const primaryLabel = branchShortName(b.branchName)
        const initial = (primaryLabel || b.branchName || '?').charAt(0).toUpperCase()
        const isLast = i === top.length - 1
        // §Savings fidelity fixup-2 2026-05-17: secondary line carries
        // BOTH count and merchant name (was merchantName alone), so
        // the row reads "Brightlingsea / 3 visits · Covelum / £20" —
        // pairs the row's identity with usage context, matches the
        // brainstorm "Top Places / 3 visits · Restaurants" pattern
        // adapted to branch-first.
        const visitWord = b.count === 1 ? 'visit' : 'visits'
        const secondary = `${b.count} ${visitWord} · ${b.merchantName}`
        return (
          <PressableScale
            key={b.branchId}
            onPress={() => onPress(b.branchId, b.merchantId)}
            accessibilityRole="button"
            accessibilityLabel={`${primaryLabel}, ${b.merchantName}, £${b.saving.toFixed(2)} saved across ${b.count} redemption${b.count !== 1 ? 's' : ''}`}
            style={[styles.row, !isLast && styles.rowDivider]}
            testID={`savings-top-branches-row-${b.branchId}`}
          >
            {/* Logo: prefer merchant-supplied URL; otherwise an
                initial tile keyed by the trimmed branch name. */}
            {b.merchantLogoUrl ? (
              <Image
                source={{ uri: b.merchantLogoUrl }}
                style={styles.logoImage}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.logoFallback}>
                <Text style={styles.logoInitial}>{initial}</Text>
              </View>
            )}

            <View style={styles.rowText}>
              <Text variant="body.sm" style={styles.primaryName} numberOfLines={1}>{primaryLabel}</Text>
              <Text variant="body.sm" color="tertiary" meta style={styles.secondaryName} numberOfLines={1}>
                {secondary}
              </Text>
            </View>

            <Text style={styles.saving}>£{b.saving.toFixed(2)}</Text>
          </PressableScale>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    // §Savings fidelity fixup-2: compact vertical padding so card
    // doesn't read as oversized (was spacing[4] = 16; target
    // brainstorm uses ~14-16 padding with much tighter row rhythm).
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[2],
    color: '#9CA3AF',
  },
  // Brainstorm: 9px 0 padding + 1px subtle border between rows.
  // Tightens the per-row vertical rhythm; 42x42 logo (was 46) lines
  // up with the brainstorm pattern.
  row: {
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
  },
  logoFallback: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontSize: 18,
    fontFamily: 'Lato-SemiBold',
    color: '#9CA3AF',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  primaryName: {
    fontFamily: 'Lato-Bold',
    fontSize: 14,
    color: '#010C35',
  },
  secondaryName: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  // Brainstorm: 18px MusticaPro-SemiBold savings-green tabular.
  // Drop the leading "+" — brainstorm uses bare "£20" not "+£20".
  saving: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 18,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
  },
  emptyLabel: {
    color: '#9CA3AF',
    fontStyle: 'italic',
    paddingVertical: spacing[2],
  },
})
