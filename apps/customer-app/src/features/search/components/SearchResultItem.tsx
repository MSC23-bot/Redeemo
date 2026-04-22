import React from 'react'
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { Text, color, spacing, radius } from '@/design-system'
import { SavePill } from '@/features/shared/SavePill'
import { OpenStatusBadge } from '@/features/shared/OpenStatusBadge'
import { MerchantTile as MerchantTileType } from '@/lib/api/discovery'

type Props = {
  merchant: MerchantTileType
  query: string
  onPress: (id: string) => void
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  const miles = metres / 1609.34
  return `${miles.toFixed(1)}mi`
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query.trim()) {
    return <Text style={styles.merchantName}>{name}</Text>
  }
  const lower = name.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lower.indexOf(lowerQuery)

  if (idx === -1) {
    return <Text style={styles.merchantName}>{name}</Text>
  }

  const before = name.slice(0, idx)
  const match = name.slice(idx, idx + query.length)
  const after = name.slice(idx + query.length)

  return (
    <Text style={styles.merchantName} numberOfLines={1}>
      {before}
      <Text style={[styles.merchantName, { color: color.brandRose }]}>{match}</Text>
      {after}
    </Text>
  )
}

export function SearchResultItem({ merchant, query, onPress }: Props) {
  const displayName = merchant.tradingName ?? merchant.businessName
  const distanceStr = formatDistance(merchant.distance)
  const categoryName = merchant.primaryCategory?.name ?? null

  const metaParts: string[] = []
  if (categoryName) metaParts.push(categoryName)
  if (distanceStr) metaParts.push(distanceStr)

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(merchant.id)}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${metaParts.join(', ')}`}
      activeOpacity={0.7}
    >
      {/* Logo */}
      <View style={styles.logo}>
        {merchant.logoUrl ? (
          <Image source={{ uri: merchant.logoUrl }} style={styles.logoImage} />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoInitial}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <HighlightedName name={displayName} query={query} />
        {metaParts.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(' · ')}
          </Text>
        )}
      </View>

      {/* Right side */}
      <View style={styles.right}>
        <SavePill amount={merchant.maxEstimatedSaving} />
        <OpenStatusBadge isOpen />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
  },
  logoImage: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  logoPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: color.surface.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontFamily: 'Lato-Bold',
    fontSize: 18,
    color: color.navy,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  merchantName: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: color.text.primary,
  },
  meta: {
    fontFamily: 'Lato-Regular',
    fontSize: 12,
    lineHeight: 16,
    color: color.text.secondary,
  },
  right: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
})
