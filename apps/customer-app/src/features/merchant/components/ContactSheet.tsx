import React from 'react'
import { View, Pressable, Linking, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Phone, Mail, Globe, ChevronRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  visible: boolean
  onDismiss: () => void
  branchName: string
  phone: string | null
  email: string | null
  websiteUrl: string | null
}

// Round 3 §A4: migrated onto the shared `<BottomSheet>` primitive.
// Drag handle + scrim + swipe-down-to-dismiss live there.
export function ContactSheet({ visible, onDismiss, branchName, phone, email, websiteUrl }: Props) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Contact merchant">
      <Text variant="heading.lg" style={styles.title}>Contact</Text>
      <Text variant="label.md" color="tertiary" meta style={styles.subtitle}>{branchName}</Text>

      {phone && (
        <Pressable
          onPress={() => { lightHaptic(); Linking.openURL(`tel:${phone}`) }}
          style={styles.item}
          accessibilityLabel={`Call ${phone}`}
        >
          <LinearGradient colors={['#E20C04', '#E84A00']} style={styles.iconCircle}>
            <Phone size={20} color="#FFF" />
          </LinearGradient>
          <View style={styles.itemInfo}>
            <Text variant="label.md" color="tertiary" meta style={styles.itemLabel}>PHONE</Text>
            <Text variant="label.lg" style={styles.itemValue}>{phone}</Text>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </Pressable>
      )}

      {email && (
        <Pressable
          onPress={() => { lightHaptic(); Linking.openURL(`mailto:${email}`) }}
          style={styles.item}
          accessibilityLabel={`Email ${email}`}
        >
          <LinearGradient colors={['#010C35', '#1a2550']} style={styles.iconCircle}>
            <Mail size={20} color="#FFF" />
          </LinearGradient>
          <View style={styles.itemInfo}>
            <Text variant="label.md" color="tertiary" meta style={styles.itemLabel}>EMAIL</Text>
            <Text variant="label.lg" style={styles.itemValue}>{email}</Text>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </Pressable>
      )}

      {websiteUrl && (
        <Pressable
          onPress={() => { lightHaptic(); Linking.openURL(websiteUrl) }}
          style={[styles.item, styles.itemLast]}
          accessibilityLabel={`Visit website`}
        >
          <LinearGradient colors={['#E84A00', '#F97316']} style={styles.iconCircle}>
            <Globe size={20} color="#FFF" />
          </LinearGradient>
          <View style={styles.itemInfo}>
            <Text variant="label.md" color="tertiary" meta style={styles.itemLabel}>WEBSITE</Text>
            <Text variant="label.lg" style={styles.itemValue} numberOfLines={1}>{websiteUrl.replace(/^https?:\/\//, '')}</Text>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </Pressable>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE6',
  },
  itemLast: {
    borderBottomWidth: 0,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  itemValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#010C35',
    marginTop: 4,
  },
})
