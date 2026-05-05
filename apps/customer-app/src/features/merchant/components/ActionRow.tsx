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

// Round 4 §2: Contact button promoted to a brand-secondary navy
// gradient (white text + icon) per direction "I want the contact
// button to be blue, the navy blue we use on our branding —
// gradient navy blue button with text and icon being white, similar
// to website".
//
// The action row hierarchy is now a clear two-tone primary-action
// pair (Website red + Contact navy, both white-on-gradient,
// matching the brand's two anchor colours) followed by Directions as
// the lone outline tertiary. Reads as: brand-red is the merchant's
// front door, navy is "talk to them", outline-navy is "go there".
const NAVY_GRADIENT = ['#010C35', '#1F2A55'] as const

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
        style={styles.navyBtn}
        accessibilityRole="button"
        accessibilityLabel="Contact merchant"
        hitSlop={6}
      >
        <LinearGradient
          colors={NAVY_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.navyBtnGradient}
        >
          <Phone size={14} color="#FFF" />
          <Text variant="label.md" style={styles.navyBtnText}>Contact</Text>
        </LinearGradient>
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
  // Round 5 §7 (impeccable polish): identity zone unified at 24pt
  // gutter. marginTop tightened 18 → 14 — the BranchContextBand
  // now carries `paddingBottom: 12` of its own breathing room, so
  // less needed here. marginBottom kept at 20 (separation from the
  // sticky tab bar).
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  // Website (brand red gradient) — borderRadius/overflow on the
  // gradient (where it clips), shadow on the outer Pressable (where
  // the layer renders it without being clipped).
  brandBtn: {
    flex: 1,
    borderRadius: 12,
    shadowColor: color.brandRose,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Round 5 §7: paddingHorizontal 4 → 8 for text breathing room.
  // 4pt was so tight the labels ("Website" / "Contact" / "Directions")
  // touched the inner gradient edges; 8pt gives the icon+label
  // pair a comfortable margin inside the button.
  brandBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  brandBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    letterSpacing: -0.1,
  },
  // Contact (navy gradient) — same architecture as Website. Navy
  // shadow tinted toward `color.navy` so it reads as a soft drop
  // shadow against the cream identity zone, not a generic black.
  navyBtn: {
    flex: 1,
    borderRadius: 12,
    shadowColor: color.navy,
    shadowOpacity: 0.20,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  navyBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  navyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    letterSpacing: -0.1,
  },
  // Directions stays as the lone outline button — visual hierarchy:
  // brand-red filled (primary) → navy filled (secondary) → outline
  // (tertiary). Outline keeps a subtle navy text + icon so it
  // visually connects to the navy Contact button beside it.
  outlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#FCFAF7',
    borderWidth: 1,
    borderColor: 'rgba(1,12,53,0.10)',
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: color.navy,
    letterSpacing: -0.1,
  },
})
