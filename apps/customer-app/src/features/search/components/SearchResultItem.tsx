import React from 'react'
import { View, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
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
  return `${miles.toFixed(1)} mi`
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  if (!query.trim()) return <Text style={styles.merchantName}>{name}</Text>
  const lower = name.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lower.indexOf(lowerQuery)
  if (idx === -1) return <Text style={styles.merchantName}>{name}</Text>
  return (
    <Text style={styles.merchantName} numberOfLines={1}>
      {name.slice(0, idx)}
      <Text style={[styles.merchantName, { color: '#E20C04' }]}>{name.slice(idx, idx + query.length)}</Text>
      {name.slice(idx + query.length)}
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

  const savingText = merchant.maxEstimatedSaving != null && merchant.maxEstimatedSaving > 0
    ? `Save £${merchant.maxEstimatedSaving}`
    : null

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(merchant.id)}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${metaParts.join(', ')}`}
      activeOpacity={0.7}
    >
      {/* Logo */}
      <View style={styles.logoWrapper}>
        {merchant.logoUrl ? (
          <Image source={{ uri: merchant.logoUrl }} style={styles.logo} />
        ) : (
          <LinearGradient
            colors={['#2d1810', '#4a2520']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <Text style={styles.logoInitial}>{displayName.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <HighlightedName name={displayName} query={query} />
        {metaParts.length > 0 && (
          <Text style={styles.meta} numberOfLines={1}>{metaParts.join(' · ')}</Text>
        )}
      </View>

      {/* Right */}
      <View style={styles.right}>
        {savingText && (
          <View style={styles.savePill}>
            <Text style={styles.saveText}>{savingText}</Text>
          </View>
        )}
        {/*
          Open/closed badge intentionally omitted — backend MerchantTile
          contract does not include isOpen / isOpenNow on list responses
          (only on getCustomerMerchant / getCustomerMerchantBranches detail
          responses). PR B M4 audit removed the matching hardcoded badge in
          MerchantTile.tsx; this is the same fix for SearchResultItem.
          Re-enable when the backend extends the tile contract to include
          per-tile open state.
        */}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 12,
    marginHorizontal: 18,
    marginBottom: 6,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  logoWrapper: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontSize: 16,
    fontFamily: 'Lato-Bold',
    color: 'rgba(255,255,255,0.7)',
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  merchantName: {
    fontSize: 12,
    fontFamily: 'Lato-Bold',
    color: '#010C35',
  },
  meta: {
    fontSize: 10,
    fontFamily: 'Lato-Regular',
    color: '#6B7280',
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  savePill: {
    backgroundColor: '#ECFDF5',
    borderRadius: 50,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(5,150,105,0.12)',
  },
  saveText: {
    fontSize: 8,
    fontFamily: 'Lato-Bold',
    color: '#047857',
  },
})
