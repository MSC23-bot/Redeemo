import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  /** True when the merchant has more than one branch. Single-branch hides
   *  the brand-red tinted region + branch-line text — there's no branch
   *  context to anchor. The descriptor + meta row still render. */
  isMultiBranch: boolean
  /** The current branch's display label (typically `branchShortName(sb.name)`).
   *  Null on single-branch — band-style hidden. */
  branchLine: string | null
  /** Children render inside the band (after the branch line on multi-branch).
   *  Composition: <BranchChip /> + <MerchantDescriptor /> + <MetaRow />. */
  children: React.ReactNode
}

// Section 1 of the visual correction round: BranchContextBand is the
// signature multi-branch element. It wraps the branch line, switcher chip,
// descriptor, and meta row in a brand-red-tinted region that visually
// anchors "you are at THIS branch" — strengthening branch-first hierarchy
// without changing the §6.4 page composition order.
//
// On single-branch merchants the band-style (tint + branch line) collapses
// because there's no other branch to switch to and no branch-context to
// emphasise. The children still render with the same horizontal padding
// so vertical rhythm stays consistent.
//
// Section 4 of the visual correction round will add the coordinated
// branch-switch motion to this component (background-flash + brand-red
// gradient sweep + opacity dip on inner branch-scoped text). Section 1
// only establishes the structural shell.
export function BranchContextBand({ isMultiBranch, branchLine, children }: Props) {
  if (!isMultiBranch || !branchLine) {
    return <View style={styles.flat}>{children}</View>
  }

  return (
    <View style={styles.band} testID="branch-context-band">
      <Text
        variant="label.lg"
        style={styles.branchLine}
        numberOfLines={1}
        ellipsizeMode="tail"
        testID="merchant-branch-line"
        accessibilityLiveRegion="polite"
      >
        {branchLine}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  // Tinted band — multi-branch merchants only.
  band: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(226,12,4,0.04)',
    gap: 10,
  },
  // No-band fallback — single-branch merchants. Same horizontal padding
  // as the multi-branch band so vertical rhythm doesn't jump.
  flat: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 10,
  },
  branchLine: {
    color: '#E20C04',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: -0.1,
  },
})
