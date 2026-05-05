import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  merchantName:    string
  merchantLogoUrl: string | null
  /**
   * Branch context — name of the branch the redemption will attribute
   * to. Sourced from `merchant.selectedBranch.name` per the locked
   * branch-attribution contract (plan §11). NEVER from
   * `merchant.branches[0]` or any other heuristic.
   */
  branchName: string | null
  /**
   * `true` when the merchant has more than one active branch — drives
   * the "Change" affordance for the picker (M2 wires the picker; M1
   * shows a stub).
   */
  isMultiBranch: boolean
  /**
   * M1: stub callback that fires a "Coming next milestone" toast or
   * no-op. M2: opens BranchPickerSheet.
   */
  onChangeBranch?: () => void
}

/**
 * Merchant + branch attribution row sitting beneath the coupon. Communicates
 * "Redeem at <branchName>" in the most prominent UI position before the
 * sticky CTA — the user sees this BEFORE tapping Redeem (per plan §11 C2).
 */
export function MerchantRow({
  merchantName, merchantLogoUrl, branchName, isMultiBranch, onChangeBranch,
}: Props) {
  return (
    <View style={styles.root} testID="merchant-row">
      <View style={styles.logoBox}>
        {merchantLogoUrl ? (
          <Image source={{ uri: merchantLogoUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <View style={styles.logoPlaceholder} />
        )}
      </View>

      <View style={styles.text}>
        <Text variant="body.md" style={styles.merchantName} numberOfLines={1} ellipsizeMode="tail">
          {merchantName}
        </Text>
        {branchName ? (
          <Pressable
            onPress={isMultiBranch ? onChangeBranch : undefined}
            disabled={!isMultiBranch}
            accessibilityRole={isMultiBranch ? 'button' : 'text'}
            accessibilityLabel={
              isMultiBranch
                ? `Redeem at ${branchName}. Tap to change branch.`
                : `Redeem at ${branchName}`
            }
          >
            <Text variant="label.md" style={styles.branchLine} numberOfLines={1} ellipsizeMode="tail" testID="redeem-at-line">
              Redeem at <Text style={styles.branchEmphasis}>{branchName}</Text>
              {isMultiBranch ? <Text style={styles.changeAffordance}>  Change ▾</Text> : null}
            </Text>
          </Pressable>
        ) : (
          // Branch context still resolving — surface the placeholder
          // so the user understands why the CTA is disabled rather
          // than seeing the merchant row look incomplete. The screen
          // also disables the active CTA via `branchReady` (plan §11
          // / PR #40 review blocker).
          <Text variant="label.md" style={styles.branchPlaceholder} testID="redeem-at-placeholder">
            Resolving branch…
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  logoPlaceholder: { flex: 1 },
  text: {
    flex: 1,
    minWidth: 0,
  },
  merchantName: {
    fontSize: 15,
    fontWeight: '700',
    color: color.navy,
    marginBottom: 2,
  },
  branchLine: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  branchEmphasis: {
    fontWeight: '700',
    color: '#374151',
  },
  changeAffordance: {
    color: color.brandRose,
    fontWeight: '600',
    fontSize: 12,
  },
  branchPlaceholder: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
    fontWeight: '500',
  },
})
