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
        return (
          <FadeIn key={b.branchId} delay={i * 90} y={8}>
            <PressableScale
              onPress={() => onPress(b.branchId, b.merchantId)}
              accessibilityRole="button"
              accessibilityLabel={`${primaryLabel}, ${b.merchantName}, £${b.saving.toFixed(2)} saved across ${b.count} redemption${b.count !== 1 ? 's' : ''}`}
              style={styles.row}
              testID={`savings-top-branches-row-${b.branchId}`}
            >
              {/* Logo: prefer merchant-supplied URL; otherwise an
                  initial tile keyed by the trimmed branch name so
                  multi-branch merchants visually differ in absence of
                  a logo. */}
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
                <Text variant="body.sm" style={styles.primaryName}>{primaryLabel}</Text>
                <Text variant="body.sm" color="tertiary" meta style={styles.secondaryName}>
                  {b.merchantName}
                </Text>
              </View>

              <Text style={styles.saving}>+£{b.saving.toFixed(2)}</Text>
            </PressableScale>
          </FadeIn>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing[4],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[3],
    color: '#9CA3AF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: spacing[3],
  },
  logoImage: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
  },
  logoFallback: {
    width: 46,
    height: 46,
    borderRadius: 14,
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
