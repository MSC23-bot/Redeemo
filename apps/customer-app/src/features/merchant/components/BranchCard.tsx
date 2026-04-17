import React from 'react'
import { View, Pressable, StyleSheet, Linking } from 'react-native'
import { MapPin, Star, ChevronRight, Phone as PhoneIcon, Navigation, Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import Animated, { useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import type { BranchDetail } from '@/lib/api/merchant'

type Props = {
  branch: BranchDetail
  isNearest: boolean
  onPress: () => void
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1609.34).toFixed(1)} mi`
}

export function BranchCard({ branch, isNearest, onPress }: Props) {
  const distText = formatDistance(branch.distance)
  const address = [branch.addressLine1, branch.city, branch.postcode].filter(Boolean).join(', ')

  return (
    <Pressable
      onPress={() => { lightHaptic(); onPress() }}
      style={[styles.card, isNearest && styles.cardNearest]}
      accessibilityRole="button"
      accessibilityLabel={`${branch.name} branch${isNearest ? ', your nearest branch' : ''}. ${address}`}
    >
      {/* Nearest label */}
      {isNearest && (
        <View style={styles.nearestLabel}>
          <MapPin size={12} color={color.brandRose} />
          <Text variant="label.md" style={styles.nearestText}>YOUR NEAREST BRANCH</Text>
        </View>
      )}

      {/* Branch name + chevron */}
      <View style={styles.nameRow}>
        <Text variant="heading.sm" style={styles.name}>{branch.name}</Text>
        <ChevronRight size={18} color="#9CA3AF" />
      </View>

      {/* Address */}
      <Text variant="body.sm" color="secondary" style={styles.address}>{address}</Text>

      {/* Meta row */}
      <View style={styles.metaRow}>
        {distText && (
          <Text variant="label.md" color="secondary" meta style={styles.dist}>{distText}</Text>
        )}
        {distText && <Text variant="label.md" color="tertiary" meta style={styles.sep}>·</Text>}
        <StatusDot isOpen={branch.isOpenNow} />
        <Text variant="label.md" style={[styles.statusText, { color: branch.isOpenNow ? '#16A34A' : '#B91C1C' }]}>
          {branch.isOpenNow ? 'Open' : 'Closed'}
        </Text>
        {branch.avgRating !== null && branch.reviewCount > 0 && (
          <>
            <Text variant="label.md" color="tertiary" meta style={styles.sep}>·</Text>
            <Star size={12} color="#F59E0B" fill="#F59E0B" />
            <Text variant="label.md" style={styles.rating}>
              {branch.avgRating.toFixed(1)} ({branch.reviewCount})
            </Text>
          </>
        )}
      </View>

      {/* Action buttons (nearest branch only) */}
      {isNearest && (
        <View style={styles.actions}>
          {branch.phone && (
            <Pressable
              onPress={() => { lightHaptic(); Linking.openURL(`tel:${branch.phone}`) }}
              style={styles.actionBtn}
              accessibilityLabel="Call branch"
            >
              <PhoneIcon size={14} color={color.navy} />
              <Text variant="label.md" style={styles.actionText}>Call</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              lightHaptic()
              if (branch.latitude && branch.longitude) {
                Linking.openURL(`https://maps.apple.com/?daddr=${branch.latitude},${branch.longitude}`)
              }
            }}
            style={styles.actionBtn}
            accessibilityLabel="Get directions"
          >
            <Navigation size={14} color={color.navy} />
            <Text variant="label.md" style={styles.actionText}>Directions</Text>
          </Pressable>
          <Pressable onPress={() => { lightHaptic(); onPress() }} style={styles.actionBtn} accessibilityLabel="View hours">
            <Clock size={14} color={color.navy} />
            <Text variant="label.md" style={styles.actionText}>Hours</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  )
}

function StatusDot({ isOpen }: { isOpen: boolean }) {
  const pulseStyle = useAnimatedStyle(() => {
    if (!isOpen) return { opacity: 1 }
    return {
      opacity: withRepeat(
        withTiming(0.45, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    }
  })

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: isOpen ? '#16A34A' : '#B91C1C' },
        pulseStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  cardNearest: {
    borderWidth: 1.5,
    borderColor: color.brandRose,
    shadowColor: color.brandRose,
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  nearestLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  nearestText: {
    fontSize: 10,
    fontWeight: '800',
    color: color.brandRose,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    color: '#010C35',
  },
  address: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  dist: {
    fontSize: 12,
    fontWeight: '600',
  },
  sep: {
    fontSize: 8,
    color: '#D1D5DB',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rating: {
    fontSize: 11,
    fontWeight: '700',
    color: '#010C35',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFF9F5',
    borderWidth: 1,
    borderColor: '#F0EBE6',
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#010C35',
  },
})
