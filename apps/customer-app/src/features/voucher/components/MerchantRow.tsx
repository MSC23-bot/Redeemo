import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { ChevronRight, ChevronDown, MapPin } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  merchantName:    string
  merchantLogoUrl: string | null
  /**
   * Optional descriptor like "Italian · Food & Drink" — comes from
   * `merchant.descriptor` (merchant-LEVEL data) on the merchant
   * profile payload. Rendered as the secondary line under the
   * merchant name when present.
   */
  merchantDescriptor: string | null
  /**
   * Branch name — sourced from `merchant.selectedBranch.name`
   * (BRANCH-LEVEL data, the redemption attribution context) per the
   * locked plan §11 contract. NEVER from `merchant.branches[0]` or
   * any other heuristic. Drives the "Redeem at" line which is the
   * branch attribution surface.
   */
  branchName: string | null
  /**
   * Branch distance in metres — from
   * `merchant.selectedBranch.distance` (BRANCH-LEVEL).
   */
  branchDistanceMeters: number | null
  /**
   * `true` when the merchant has more than one active branch — drives
   * the "Change" affordance for the picker (M2 wires the picker).
   */
  isMultiBranch: boolean
  /**
   * M1: stub callback that fires a "Coming next milestone" toast or
   * no-op. M2: opens BranchPickerSheet.
   */
  onChangeBranch?: () => void
  /** Tap target for the whole card — opens the merchant profile. */
  onPress?: () => void
}

const NAVY        = '#010C35'
const TEXT_2ND    = '#4B5563'
const TEXT_MUTED  = '#9CA3AF'
const BORDER      = '#E8E2DC'

function formatDistance(meters: number | null): string | null {
  if (meters === null || meters === undefined) return null
  // Distances over 200 mi suggest the user is far from the merchant
  // (different country, GPS not granted) — at that point the number
  // adds noise without context, so we omit it.
  const miles = meters / 1609.34
  if (miles >= 200) return null
  if (miles >= 100) return `${Math.round(miles)} mi`
  if (miles >= 0.1) return `${miles.toFixed(1)} mi`
  return `${Math.round(meters)} m`
}

/**
 * Merchant + branch attribution card sitting beneath the coupon body.
 *
 * **Branch attribution surface** — communicates "Redeem at <branch>"
 * before the sticky CTA so the user sees the BRANCH-LEVEL redemption
 * context BEFORE tapping Redeem (per plan §11 C2). The branch row
 * sits in its own panel within the card with a subtle red-tinted
 * background so the user reads it as the action context, distinct
 * from the merchant identity row above. Vouchers are merchant-wide;
 * redemption is branch-attributed — this card makes that split
 * unmissable.
 *
 * Two stacked sections inside the card:
 *   1. Merchant identity (logo + businessName + descriptor) — top
 *      line; merchant-LEVEL data.
 *   2. "REDEEM AT" panel (red-tinted, branch icon + branchName +
 *      distance + Change affordance) — bottom line; branch-LEVEL
 *      data sourced ONLY from selectedBranch.
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
    <View style={styles.root} testID="merchant-row">
      {/* Top: merchant identity (merchant-level) */}
      <Pressable
        onPress={onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${merchantName}${merchantDescriptor ? '. ' + merchantDescriptor : ''}`}
        style={({ pressed }) => [styles.merchantRow, pressed && onPress ? styles.pressed : null]}
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

        <View style={styles.merchantText}>
          <Text variant="body.md" style={styles.merchantName} numberOfLines={1} ellipsizeMode="tail">
            {merchantName}
          </Text>
          {merchantDescriptor ? (
            <Text variant="label.md" style={styles.descriptor} numberOfLines={1} ellipsizeMode="tail">
              {merchantDescriptor}
            </Text>
          ) : null}
        </View>

        <ChevronRight size={20} color={TEXT_MUTED} strokeWidth={2} />
      </Pressable>

      <View style={styles.divider} />

      {/* Bottom: branch attribution (branch-level — DISTINCT, ACTION CONTEXT) */}
      <Pressable
        onPress={isMultiBranch ? onChangeBranch : undefined}
        disabled={!isMultiBranch || !branchName}
        accessibilityRole={isMultiBranch ? 'button' : 'text'}
        accessibilityLabel={
          branchName
            ? (isMultiBranch
                ? `Redeem at ${branchName}. Tap to change branch.`
                : `Redeem at ${branchName}`)
            : 'Resolving redemption branch'
        }
        style={({ pressed }) => [
          styles.branchRow,
          pressed && isMultiBranch ? styles.branchRowPressed : null,
        ]}
      >
        <View style={styles.branchIconWrap}>
          <MapPin size={14} color={color.brandRose} strokeWidth={2.4} />
        </View>

        <View style={styles.branchText} testID={branchName ? 'redeem-at-line' : undefined}>
          <Text variant="label.md" style={styles.redeemAtLabel}>REDEEM AT</Text>
          {branchName ? (
            <Text variant="body.md" style={styles.branchName} numberOfLines={1} ellipsizeMode="tail">
              {branchName}
              {distance ? <Text style={styles.distanceText}>{` · ${distance}`}</Text> : null}
            </Text>
          ) : (
            <Text variant="body.sm" style={styles.branchPlaceholder} testID="redeem-at-placeholder">
              Resolving branch…
            </Text>
          )}
        </View>

        {isMultiBranch && branchName ? (
          <View style={styles.changeWrap} accessible accessibilityLabel="Change ▾">
            <Text variant="label.md" style={styles.changeText}>Change ▾</Text>
            <ChevronDown size={14} color={color.brandRose} strokeWidth={2.4} />
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginHorizontal: 22,
    marginTop: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.9,
  },
  // ── Merchant identity row (top half) ──────────────────────────
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoFallback: {
    fontSize: 22,
    fontWeight: '800',
    color: NAVY,
  },
  merchantText: {
    flex: 1,
    minWidth: 0,
  },
  merchantName: {
    fontSize: 17,
    fontWeight: '800',
    color: NAVY,
  },
  descriptor: {
    fontSize: 13,
    color: TEXT_2ND,
    fontWeight: '500',
    marginTop: 2,
  },
  // ── Divider between merchant + branch sections ────────────────
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginHorizontal: 16,
  },
  // ── Branch attribution row (bottom half — action context) ─────
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(226,12,4,0.035)',
  },
  branchRowPressed: {
    backgroundColor: 'rgba(226,12,4,0.07)',
  },
  branchIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(226,12,4,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  branchText: {
    flex: 1,
    minWidth: 0,
  },
  redeemAtLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: color.brandRose,
    marginBottom: 2,
  },
  branchName: {
    fontSize: 15,
    fontWeight: '800',
    color: NAVY,
  },
  distanceText: {
    color: TEXT_MUTED,
    fontWeight: '500',
    fontSize: 13,
  },
  branchPlaceholder: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  changeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(226,12,4,0.10)',
  },
  changeText: {
    fontSize: 11,
    fontWeight: '800',
    color: color.brandRose,
    letterSpacing: 0.4,
  },
})
