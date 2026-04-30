import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text, color, spacing } from '@/design-system'

/**
 * Locked copy strings (do not change without owner sign-off).
 * Mapping:
 *   - reason='none'              → result set is empty for the current query
 *   - reason='expanded_to_wider' → results exist but scope was widened
 *                                  (shown as a banner ABOVE the list, not inline)
 *   - reason='no_uk_supply'      → no UK supply at all for the query
 */
const COPY = {
  none:               'No merchants found',
  expanded_to_wider:  'No matches nearby — showing wider results',
  no_uk_supply:       'No matches in the UK yet — we’re growing daily',
} as const

type EmptyStateReason = keyof typeof COPY

type Props = {
  reason: EmptyStateReason | null | undefined
}

export function EmptyStateMessage({ reason }: Props) {
  if (!reason) return null
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{COPY[reason]}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[5],
    paddingVertical:   spacing[4],
    alignItems:        'center',
  },
  text: {
    fontSize:   13,
    fontFamily: 'Lato-Regular',
    color:      color.text.secondary,
    textAlign:  'center',
  },
})
