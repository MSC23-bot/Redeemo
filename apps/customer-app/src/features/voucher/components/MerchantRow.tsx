import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { ChevronRight, MapPin } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  merchantName:    string
  merchantLogoUrl: string | null
  /**
   * Optional descriptor like "Italian · Food & Drink" — comes from
   * `merchant.descriptor` on the merchant profile payload. Rendered
   * as the secondary line under the merchant name when present.
   */
  merchantDescriptor: string | null
  /**
   * Branch name — sourced from `merchant.selectedBranch.name` per the
   * locked branch-attribution contract (plan §11). NEVER from
   * `merchant.branches[0]` or any other heuristic.
   */
  branchName: string | null
  /**
   * Branch distance in metres — from `merchant.selectedBranch.distance`.
   * Rendered as " · 0.3 mi" when present (and we have a branch name).
   */
  branchDistanceMeters: number | null
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
  /** Tap target for the whole card — opens the merchant profile (M2 wires this). */
  onPress?: () => void
}

const NAVY        = '#010C35'
const TEXT_2ND    = '#4B5563'
const TEXT_MUTED  = '#9CA3AF'
const BORDER      = '#E8E2DC'

function formatDistance(meters: number | null): string | null {
  if (meters === null || meters === undefined) return null
  // UK formatting: use miles for >= 0.1 mi, otherwise show in metres.
  const miles = meters / 1609.34
  if (miles >= 0.1) return `${miles.toFixed(1)} mi`
  return `${Math.round(meters)} m`
}

/**
 * Merchant + branch attribution card sitting beneath the coupon body.
 * Communicates "Redeem at <branchName>" before the sticky CTA — the
 * user sees this BEFORE tapping Redeem (per plan §11 C2).
 *
 * v4 layout: white card, logo (44 rounded square) on the left, merchant
 * name + descriptor + branch line on the right, chevron at the far end.
 * The branch line is its own row with a red pin icon and the distance.
 *
 * Multi-branch UX: when isMultiBranch=true, the branch line becomes a
 * tap target that opens the picker (M2). Test contract preserves the
 * literal string "Change ▾" so existing assertions still match.
 */
export function MerchantRow({
  merchantName,
  merchantLogoUrl,
  merchantDescriptor,
  branchName,
  branchDistanceMeters,
  isMultiBranch,
  onChangeBranch,
  onPress,
}: Props) {
  const distance = formatDistance(branchDistanceMeters)

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed && onPress ? styles.pressed : null]}
      testID="merchant-row"
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.logoBox}>
        {merchantLogoUrl ? (
          <Image source={{ uri: merchantLogoUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <Text variant="heading.sm" style={styles.logoFallback}>
            {merchantName.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View style={styles.text}>
        <Text variant="body.md" style={styles.merchantName} numberOfLines={1} ellipsizeMode="tail">
          {merchantName}
        </Text>
        {merchantDescriptor ? (
          <Text variant="label.md" style={styles.descriptor} numberOfLines={1} ellipsizeMode="tail">
            {merchantDescriptor}
          </Text>
        ) : null}

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
            style={styles.branchRowPressable}
          >
            <View style={styles.branchRow} testID="redeem-at-line">
              <MapPin size={12} color={color.brandRose} strokeWidth={2.4} />
              <Text variant="label.md" style={styles.branchText} numberOfLines={1} ellipsizeMode="tail">
                <Text style={styles.branchEmphasis}>{branchName}</Text>
                {distance ? <Text style={styles.distanceText}>{` · ${distance}`}</Text> : null}
                {isMultiBranch ? <Text style={styles.changeAffordance}>{`  Change ▾`}</Text> : null}
              </Text>
            </View>
          </Pressable>
        ) : (
          // Branch context still resolving — surface the placeholder so
          // the user understands why the CTA is disabled. The screen
          // also disables the active CTA via `branchReady` (plan §11 /
          // PR #40 review blocker).
          <View style={styles.branchRow}>
            <MapPin size={12} color={TEXT_MUTED} strokeWidth={2.2} />
            <Text variant="label.md" style={styles.branchPlaceholder} testID="redeem-at-placeholder">
              Resolving branch…
            </Text>
          </View>
        )}
      </View>

      <ChevronRight size={18} color={TEXT_MUTED} strokeWidth={2} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.92,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoFallback: {
    fontSize: 18,
    fontWeight: '800',
    color: NAVY,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  merchantName: {
    fontSize: 14,
    fontWeight: '800',
    color: NAVY,
  },
  descriptor: {
    fontSize: 11,
    color: TEXT_2ND,
    fontWeight: '500',
    marginTop: 1,
  },
  branchRowPressable: {
    marginTop: 4,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  branchText: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontWeight: '600',
  },
  branchEmphasis: {
    color: TEXT_2ND,
    fontWeight: '700',
  },
  distanceText: {
    color: TEXT_MUTED,
    fontWeight: '500',
  },
  changeAffordance: {
    color: color.brandRose,
    fontWeight: '700',
    fontSize: 11,
  },
  branchPlaceholder: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontStyle: 'italic',
    fontWeight: '500',
  },
})
