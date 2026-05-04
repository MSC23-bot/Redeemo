import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type Props = {
  /** True when the merchant has more than one branch. Single-branch hides
   *  the branch-line text — there's no branch context to anchor. */
  isMultiBranch: boolean
  /** The current branch's display label (typically `branchShortName(sb.name)`).
   *  Null on single-branch — branch line hidden. */
  branchLine: string | null
  /** Branch-switch trigger: retained for API compatibility; round 4 dropped
   *  the band-level motion (toast + tab fade now carry confirmation). */
  switchTrigger?: string | null
  /** Children render below the branch line on multi-branch.
   *  Composition: <MerchantDescriptor /> + <MetaRow />. */
  children: React.ReactNode
}

// Round 4 §1 (post-PR-#35 QA round 3): the BranchContextBand was
// stripped of its container chrome (warm-cream tint, padding,
// rounded box, motion sweep) per user direction "I don't want this
// container here at all".
//
// What remains:
//   • Branch line text on multi-branch (deeper-oxblood `#A30D03`,
//     17pt 700 — the branch identity headline).
//   • A flat layout container that hosts the descriptor + meta row.
//
// What's gone:
//   • Background tint (`#EFEAE0` rest, `#E5DCC9` flash).
//   • Padding + border-radius + sweep gradient + flash motion.
//   • The whole "band" mental model — content now sits directly on
//     the unified identity-zone background.
//
// Why this is fine: the branch-switch confirmation is already
// carried by the BranchSwitchToast (round 2 §4) and the tab-content
// FadeIn (round 3 §C3). The band's local motion was a third
// confirmation layer that contributed to visual clutter without
// adding new information.
export function BranchContextBand({ isMultiBranch, branchLine, children }: Props) {
  if (!isMultiBranch || !branchLine) {
    // Single-branch: just the children (descriptor + meta row).
    return <View style={styles.root}>{children}</View>
  }

  // Multi-branch: branch line above the children.
  return (
    <View style={styles.root} testID="branch-context-band">
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
  root: {
    paddingHorizontal: 20,
    gap: 8,
  },
  branchLine: {
    color: '#A30D03',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: -0.1,
  },
})
