// Plan 4 M3b follow-up — LocalityCaption (Search + Category).
//
// Flat grey caption mounted above a results list to tell the user
// which place the backend resolved the query around. Driven by
// `meta.effectiveLocality.name` on the backend response.
//
// Used by:
//   - SearchScreen (between resultsHeader and the results list)
//   - CategoryResultsScreen (above sortCaption)
//
// Renders `null` when:
//   - `localityName` is null/undefined
//   - `localityName` trims to empty string
//
// Does NOT render its own contextual styling for the Map — the Map
// uses ViewportLocalityBadge instead because a flat caption is
// invisible over arbitrary map backgrounds.

import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'

export type LocalityCaptionProps = {
  localityName: string | null | undefined
}

export function LocalityCaption({ localityName }: LocalityCaptionProps) {
  if (!localityName || localityName.trim() === '') return null
  return (
    <View style={styles.row}>
      <Text style={styles.text} numberOfLines={1}>
        Showing results near {localityName}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 18,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontFamily: 'Lato-Regular',
    color: color.text.tertiary,
  },
})
