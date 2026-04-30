import React from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { Text, color, spacing, radius, elevation, layer } from '@/design-system'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { FadeIn } from '@/design-system/motion/FadeIn'
import { StarRating } from '@/features/shared/StarRating'
import { SavePill } from '@/features/shared/SavePill'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

function formatDistance(metres: number | null): string {
  if (metres === null) return ''
  if (metres < 1000) return `${Math.round(metres)}m`
  const miles = metres / 1609.34
  return `${miles.toFixed(1)} mi`
}

function getCategoryColor(merchant: MerchantTileType): string {
  const catName = merchant.primaryCategory?.name?.toLowerCase() ?? ''
  if (catName.includes('food') || catName.includes('drink')) return '#E65100'
  if (catName.includes('beauty') || catName.includes('wellness')) return '#E91E8C'
  if (catName.includes('fitness') || catName.includes('sport')) return '#4CAF50'
  if (catName.includes('shopping')) return '#7C4DFF'
  return color.brandRose
}

type MerchantRowProps = {
  merchant: MerchantTileType
  index: number
  onPress: (id: string) => void
}

function MerchantRow({ merchant, index, onPress }: MerchantRowProps) {
  const thumbColor = getCategoryColor(merchant)
  const letter = merchant.businessName.charAt(0).toUpperCase()
  const catName = merchant.primaryCategory?.name ?? ''
  const distStr = formatDistance(merchant.distance)
  const info = [catName, distStr].filter(Boolean).join(' · ')

  return (
    <FadeIn delay={index * 40} y={8}>
      <Pressable
        onPress={() => onPress(merchant.id)}
        accessibilityLabel={merchant.businessName}
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
            {merchant.businessName}
          </Text>
          <Text variant="label.md" style={styles.infoText} numberOfLines={1}>
            {info}
          </Text>
          <View style={styles.pillRow}>
            <StarRating rating={merchant.avgRating} count={merchant.reviewCount} />
            <SavePill amount={merchant.maxEstimatedSaving} />
          </View>
        </View>
      </Pressable>
    </FadeIn>
  )
}

type Props = {
  visible: boolean
  merchants: MerchantTileType[]
  total: number
  onDismiss: () => void
  onMerchantPress: (id: string) => void
}

export function MapListView({ visible, merchants, total, onDismiss, onMerchantPress }: Props) {
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

      {/* Merchant list */}
      <FlatList
        data={merchants}
        keyExtractor={(item) => item.id}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <MerchantRow
            merchant={item}
            index={index}
            onPress={onMerchantPress}
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
