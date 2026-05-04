import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Globe, Phone, Navigation } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  hasWebsite:   boolean
  onWebsite:    () => void
  onContact:    () => void
  onDirections: () => void
}

// Visual correction round §2 (post-PR-#35 QA): action row calibrated for
// hierarchy. Website is the primary action (filled brand gradient,
// retained); Contact + Directions are secondary utilities (outline,
// de-emphasised). All three buttons drop from ~52pt → 40pt height —
// they're contextual actions on a detail page, not checkout-tier CTAs.
//
// Per /interface-design "Every choice must be a choice": the previous
// equal-weight trio sized like primary CTAs each was a default. Hierarchy
// re-established: filled-gradient (Website) → outline (Contact +
// Directions). All retain ≥44pt touch target via hitSlop on the smaller
// visual size.
export function ActionRow({ hasWebsite, onWebsite, onContact, onDirections }: Props) {
  return (
    <View style={styles.row}>
      {hasWebsite && (
        <Pressable
          onPress={() => { lightHaptic(); onWebsite() }}
          style={styles.brandBtn}
          accessibilityRole="button"
          accessibilityLabel="Open website"
          hitSlop={6}
        >
          <LinearGradient
            colors={color.brandGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandBtnGradient}
          >
            <Globe size={14} color="#FFF" />
            <Text variant="label.md" style={styles.brandBtnText}>Website</Text>
          </LinearGradient>
        </Pressable>
      )}
      <Pressable
        onPress={() => { lightHaptic(); onContact() }}
        style={styles.outlineBtn}
        accessibilityRole="button"
        accessibilityLabel="Contact merchant"
        hitSlop={6}
      >
        <Phone size={14} color={color.navy} />
        <Text variant="label.md" style={styles.outlineBtnText}>Contact</Text>
      </Pressable>
      <Pressable
        onPress={() => { lightHaptic(); onDirections() }}
        style={styles.outlineBtn}
        accessibilityRole="button"
        accessibilityLabel="Get directions"
        hitSlop={6}
      >
        <Navigation size={14} color={color.navy} />
        <Text variant="label.md" style={styles.outlineBtnText}>Directions</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  brandBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: color.brandRose,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  brandBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  brandBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    letterSpacing: -0.1,
  },
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: '#FCFAF7',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: color.navy,
    letterSpacing: -0.1,
  },
})
