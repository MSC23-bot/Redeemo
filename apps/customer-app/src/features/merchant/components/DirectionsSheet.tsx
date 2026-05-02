import React from 'react'
import { View, Pressable, Modal, Linking, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin, Navigation } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  visible: boolean
  onDismiss: () => void
  address: string
  distance: number | null
  latitude: number | null
  longitude: number | null
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m away`
  const miles = metres / 1609.34
  // Above 100 km the precise mileage is product-irrelevant ("3,189.6 mi")
  // and the address line carries the real "where" information; show a
  // tidy whole-number "X mi" instead.
  if (metres >= 100_000) return `${Math.round(miles)} mi away`
  return `${miles.toFixed(1)} miles away`
}

// Walking estimate is only meaningful for short distances. 80 m/min is a
// brisk pace; > 5 km is no longer a walking decision; > 100 km becomes
// noise (e.g. "64,163 min walk" for a Qatar device looking at a UK branch).
// Switch to a rough drive estimate (≈50 km/h average urban) up to 100 km;
// hide entirely above that — distance + address tell the user what they
// need to know.
function estimateTravelTime(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 5_000) {
    const minutes = Math.round(metres / 80)
    if (minutes < 1) return '< 1 min walk'
    return `~${minutes} min walk`
  }
  if (metres < 100_000) {
    const minutes = Math.round(metres / 833)  // 50 km/h ≈ 833 m/min
    return `~${minutes} min drive`
  }
  return null
}

export function DirectionsSheet({ visible, onDismiss, address, distance, latitude, longitude }: Props) {
  const distText = formatDistance(distance)
  const travelText = estimateTravelTime(distance)

  const handleGetDirections = () => {
    lightHaptic()
    if (latitude && longitude) {
      Linking.openURL(`https://maps.apple.com/?daddr=${latitude},${longitude}`)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.dragHandle} />
          <Text variant="heading.lg" style={styles.title}>Directions</Text>

          {/* Map preview placeholder */}
          <Pressable onPress={handleGetDirections} style={styles.mapPreview}>
            <MapPin size={32} color="#9CA3AF" />
            <View style={styles.mapLabel}>
              <Text variant="label.md" color="tertiary" meta>Tap to open map</Text>
            </View>
          </Pressable>

          {/* Address */}
          <Text variant="heading.sm" style={styles.address}>{address}</Text>

          {/* Distance + walk time */}
          <View style={styles.distRow}>
            <MapPin size={14} color={color.brandRose} />
            <Text variant="body.sm" color="secondary" style={styles.distText}>
              {[distText, travelText].filter(Boolean).join(' · ')}
            </Text>
          </View>

          {/* Get Directions CTA */}
          <Pressable onPress={handleGetDirections} style={styles.ctaBtn}>
            <LinearGradient
              colors={color.brandGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGradient}
            >
              <Navigation size={18} color="#FFF" />
              <Text variant="heading.sm" style={styles.ctaText}>Get Directions</Text>
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(1,12,53,0.5)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  mapPreview: {
    height: 160,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0EBE6',
  },
  mapLabel: {
    marginTop: 8,
  },
  address: {
    fontSize: 16,
    fontWeight: '800',
    color: '#010C35',
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 24,
  },
  distText: {
    fontSize: 13,
  },
  ctaBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  ctaText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
})
