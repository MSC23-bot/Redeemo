import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

// PR #112 device-QA fixup-3 (2026-05-19) — locality-aware "expanded scope"
// banner.  Renders above the result list when the backend cascaded out of
// the user's requested scope to find supply (e.g. nothing in Huddersfield,
// showing UK-wide).
//
// Owner-locked copy:
//   localityName present → title "Nothing in {localityName} yet"
//   localityName null    → title "Nothing nearby yet"
//   body (both)          → "Here are the closest matches"
//
// Style: soft warm-cream tint surface, no border, no shadow — sits inside
// the list-area tone.  Title is heading.sm Lato-SemiBold navy; body is
// body.sm Lato-Regular muted.  No em dashes, British English, trust-first
// tone per PRODUCT.md.
//
// Why a dedicated component (not <EmptyStateMessage reason="expanded_to_wider"/>):
// `EmptyStateMessage` is shared with `CategoryResultsScreen` which has not
// been visually rebaselined and currently uses the legacy single-line
// em-dash copy.  Migrating both surfaces in one PR is out of PR #112 scope.
// Category screen copy refresh tracked in deferred-followups §CC.

type Props = {
  localityName: string | null | undefined
}

export function ExpandedResultBanner({ localityName }: Props) {
  const trimmed = (localityName ?? '').trim()
  const title = trimmed.length > 0
    ? `Nothing in ${trimmed} yet`
    : 'Nothing nearby yet'
  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>Here are the closest matches</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor:   '#FEF6F5',       // surface-tint per DESIGN.md
    paddingVertical:   14,
    paddingHorizontal: 18,
    marginHorizontal:  16,
    marginBottom:      10,
    borderRadius:      12,              // rounded.md
  },
  title: {
    fontSize:   16,                     // heading.sm
    fontFamily: 'Lato-SemiBold',
    color:      '#010C35',              // navy / text.primary
    lineHeight: 22,
  },
  body: {
    fontSize:   14,                     // body.sm
    fontFamily: 'Lato-Regular',
    color:      '#4B5563',              // text.secondary
    lineHeight: 21,
    marginTop:  4,
  },
})
