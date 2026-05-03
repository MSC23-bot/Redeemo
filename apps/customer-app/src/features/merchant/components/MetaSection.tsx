import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin, Globe, Phone, Navigation } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { RatingPill } from './RatingPill'
import Animated, { useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated'

type Props = {
  businessName: string
  category: string | null
  avgRating: number | null
  reviewCount: number
  branchName: string | null
  distance: number | null
  isOpenNow: boolean
  hoursText: string | null
  singleBranchAddress: string | null
  hasWebsite: boolean
  onWebsite: () => void
  onContact: () => void
  onDirections: () => void
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1609.34).toFixed(1)} mi`
}

export function MetaSection({
  businessName, category, avgRating, reviewCount,
  branchName, distance, isOpenNow, hoursText,
  singleBranchAddress, hasWebsite,
  onWebsite, onContact, onDirections,
}: Props) {
  const distText = formatDistance(distance)

  return (
    <View style={styles.container}>
      <View style={styles.nameRow}>
        <View style={styles.nameCol}>
          <Text variant="display.sm" style={styles.name}>{businessName}</Text>
          {category && (
            <Text variant="body.sm" color="secondary" style={styles.category}>{category}</Text>
          )}
        </View>
        <RatingPill rating={avgRating} count={reviewCount} />
      </View>

      <View style={styles.infoRow}>
        <View style={styles.locItem}>
          <MapPin size={14} color={color.brandRose} />
          <Text variant="label.md" color="secondary" meta style={styles.locText}>
            {singleBranchAddress ?? branchName ?? 'Location'}
          </Text>
        </View>
        {distText && (
          <>
            <Text variant="label.md" color="tertiary" meta style={styles.sep}>·</Text>
            <Text variant="label.md" color="secondary" meta style={styles.locText}>{distText}</Text>
          </>
        )}
        <Text variant="label.md" color="tertiary" meta style={styles.sep}>·</Text>
        <StatusDot isOpen={isOpenNow} />
        <Text variant="label.md" style={[styles.statusText, { color: isOpenNow ? '#16A34A' : '#B91C1C' }]}>
          {isOpenNow ? 'Open' : 'Closed'}
        </Text>
        {hoursText !== null && (
          <Text variant="label.md" color="tertiary" meta style={styles.hoursText}>{hoursText}</Text>
        )}
      </View>

      <View style={styles.actions}>
        {hasWebsite && (
          <Pressable onPress={() => { lightHaptic(); onWebsite() }} style={styles.brandBtn}>
            <LinearGradient
              colors={color.brandGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandBtnGradient}
            >
              <Globe size={16} color="#FFF" />
              <Text variant="label.lg" style={styles.brandBtnText}>Website</Text>
            </LinearGradient>
          </Pressable>
        )}
        <Pressable onPress={() => { lightHaptic(); onContact() }} style={styles.outlineBtn}>
          <Phone size={16} color={color.navy} />
          <Text variant="label.lg" style={styles.outlineBtnText}>Contact</Text>
        </Pressable>
        <Pressable onPress={() => { lightHaptic(); onDirections() }} style={styles.outlineBtn}>
          <Navigation size={16} color={color.navy} />
          <Text variant="label.lg" style={styles.outlineBtnText}>Directions</Text>
        </Pressable>
      </View>
    </View>
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
        isOpen && { shadowColor: '#16A34A', shadowOpacity: 0.5, shadowRadius: 6 },
        pulseStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 48,
    paddingBottom: 24,
    paddingHorizontal: spacing[5],
    backgroundColor: color.cream,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  nameCol: {
    flex: 1,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: color.navy,
    letterSpacing: -0.5,
  },
  category: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  locItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locText: {
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
  hoursText: {
    fontSize: 11,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  brandBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: color.brandRose,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  brandBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  brandBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#F0EBE6',
  },
  outlineBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: color.navy,
  },
})
