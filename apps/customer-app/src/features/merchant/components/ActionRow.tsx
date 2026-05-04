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

export function ActionRow({ hasWebsite, onWebsite, onContact, onDirections }: Props) {
  return (
    <View style={styles.row}>
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
  )
}

const styles = StyleSheet.create({
  row: {
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
