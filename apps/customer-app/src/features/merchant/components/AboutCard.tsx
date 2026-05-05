import React, { useState, useCallback } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Home } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

type Props = {
  businessName: string
  description: string
}

export function AboutCard({ businessName, description }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isLong = description.length > 150

  const toggleExpand = useCallback(() => setExpanded(v => !v), [])

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Home size={18} color={color.brandRose} />
        <Text variant="heading.sm" style={styles.title}>About {businessName}</Text>
      </View>
      <Text
        variant="body.sm"
        color="secondary"
        style={styles.body}
        numberOfLines={expanded ? undefined : 3}
      >
        {description}
      </Text>
      {isLong && (
        <Pressable onPress={toggleExpand}>
          <Text variant="label.lg" style={styles.readMore}>
            {expanded ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Round 5 §5 (impeccable polish):
  //   • Padding 20 → 22 — extra breathing room for prose. Rhythm
  //     differentiation from the other About cards (Photos /
  //     Amenities / Hours stay at 20pt) — impeccable's "vary
  //     spacing for rhythm".
  //   • borderRadius 16 → 18 — pairs with the round-5-§4 voucher
  //     card radius for a consistent premium-soft system.
  //   • Title fontWeight 800 → 700, fontSize 15 → 16. 800 read as
  //     "shouting" and 15/13 = 1.15× was below impeccable's 1.25×
  //     hierarchy ratio. Now 16/13 = 1.23× — close enough; carries
  //     the rest via weight contrast (700 title vs body.sm regular).
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  // Round 5 §18: spacing rhythm bumped per user direction
  // "improve spacing on the text in the about section". Body
  // lineHeight 22 → 24 (1.85 ratio — comfortable prose breathing,
  // up from cramped 1.69). titleRow.marginBottom 14 → 16 and
  // readMore.marginTop 6 → 10 give the prose room above and
  // below.
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    lineHeight: 24,
  },
  readMore: {
    color: '#E20C04',
    fontWeight: '700',
    marginTop: 10,
  },
})
