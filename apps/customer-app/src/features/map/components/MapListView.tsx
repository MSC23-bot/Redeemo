import React from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { Text, color, spacing, radius, elevation } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { StarRating } from '@/features/shared/StarRating'
import { SavePill } from '@/features/shared/SavePill'
import { formatDistance } from '@/design-system/utils/formatters'
import { BranchTile as BranchTileType } from '@/lib/api/discovery'

/**
 * Fold 2 (PR-3 Phase C) — read the backend-emitted
 * `branch.merchant.primaryCategory.pinColour` for the row thumbnail
 * first, fall through to the hardcoded palette by category name only
 * when the backend field is null/undefined.  Closes a §7.8
 * visual-correctness gap where non-Big-Four categories' list-row
 * thumbnails diverged from their pin colours.  Same logic as
 * `MapPins.getPinColor` (Fold 1 in Phase B).
 */
function getCategoryColor(branch: BranchTileType): string {
  const backendPinColour = branch.merchant.primaryCategory?.pinColour
  if (backendPinColour) return backendPinColour
  const catName = branch.merchant.primaryCategory?.name?.toLowerCase() ?? ''
  if (catName.includes('food') || catName.includes('drink')) return '#E65100'
  if (catName.includes('beauty') || catName.includes('wellness')) return '#E91E8C'
  if (catName.includes('fitness') || catName.includes('sport')) return '#4CAF50'
  if (catName.includes('shopping')) return '#7C4DFF'
  return color.brandRose
}

type BranchRowProps = {
  branch: BranchTileType
  index: number
  onPress: (branchId: string) => void
}

function BranchRow({ branch, index, onPress }: BranchRowProps) {
  const thumbColor = getCategoryColor(branch)
  const letter = branch.merchant.businessName.charAt(0).toUpperCase()
  const catName = branch.merchant.primaryCategory?.name ?? ''
  // Shared miles-only formatter (PR #112 fixup-6 lock).  Returns null
  // for null/undefined distance — caller filters out of the info string.
  const distStr = formatDistance(branch.distance) ?? ''
  const info = [catName, distStr].filter(Boolean).join(' · ')

  return (
    <FadeIn delay={index * 40} y={8}>
      <Pressable
        onPress={() => onPress(branch.id)}
        accessibilityLabel={branch.merchant.businessName}
        style={styles.row}
      >
        {/* Colored thumb */}
        <View style={[styles.thumb, { backgroundColor: thumbColor }]}>
          <Text variant="label.md" style={styles.thumbLetter}>
            {letter}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.rowContent}>
          <Text variant="heading.sm" style={styles.merchantName} numberOfLines={1}>
            {branch.merchant.businessName}
          </Text>
          <Text variant="label.md" style={styles.infoText} numberOfLines={1}>
            {info}
          </Text>
          <View style={styles.pillRow}>
            <StarRating rating={branch.avgRating} count={branch.reviewCount} />
            <SavePill amount={branch.merchant.maxEstimatedSaving} />
          </View>
        </View>
      </Pressable>
    </FadeIn>
  )
}

type Props = {
  visible: boolean
  branches: BranchTileType[]
  total: number
  onDismiss: () => void
  /**
   * Fires with the tapped row's `branch.id`.  Phase D will wire the
   * `?branch=${id}&from=map` URL contract on top of this signature.
   */
  onBranchPress: (branchId: string) => void
}

export function MapListView({ visible, branches, total, onDismiss, onBranchPress }: Props) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      accessibilityLabel="Nearby Merchants list"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="heading.md" style={styles.headerTitle}>
          Nearby Merchants
        </Text>
        <View style={styles.countBadge}>
          <Text variant="label.md" style={styles.countText}>
            {total}
          </Text>
        </View>
      </View>

      {/* Branch list — branch-keyed identity (PR-3 Phase C).  Two
          branches of the same merchant render as TWO distinct rows. */}
      <FlatList
        data={branches}
        keyExtractor={(item) => item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <BranchRow
            branch={item}
            index={index}
            onPress={onBranchPress}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[4],
  },
  headerTitle: {
    color: color.navy,
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.brandRose,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  countText: {
    color: '#FFFFFF',
    fontFamily: 'Lato-Bold',
    fontSize: 12,
  },
  list: {
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...elevation.sm,
  },
  thumbLetter: {
    color: '#FFFFFF',
    fontFamily: 'Lato-Bold',
    fontSize: 20,
  },
  rowContent: {
    flex: 1,
    gap: 3,
  },
  merchantName: {
    color: color.navy,
    fontSize: 15,
  },
  infoText: {
    color: color.text.tertiary,
    fontSize: 12,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: color.border.subtle,
    marginLeft: 52 + spacing[3],
  },
})
