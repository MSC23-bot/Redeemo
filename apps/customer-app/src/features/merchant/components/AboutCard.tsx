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
        <Home size={16} color={color.brandRose} />
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
  // Round 4 §7: shadow bumped so the card visibly elevates against
  // the white body. Same white surface tone — differentiation now
  // entirely via elevation.
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 13,
    lineHeight: 22,
  },
  readMore: {
    color: '#E20C04',
    fontWeight: '700',
    marginTop: 4,
  },
})
