import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

// PR #112 fixup-6 (2026-05-20) — Search-specific empty-state copy aligned to
// Redeemo persona (PRODUCT.md: confident, plain-spoken, British English, no
// em dashes).  Owner direction: empty-state copy must be persona-appropriate
// and NOT the verbatim mockup wording.
//
// Animated illustration assets are explicitly DEFERRED to §CH — this
// component ships the copy + structure only.  When §CH lands, the
// illustration slot mounts INSIDE this same component so the copy/contract
// is preserved.
//
//   reason='none'              → "Nothing for 'X' yet" + "Try a different keyword."
//   reason='no_uk_supply'      → "Nothing for 'X' in the UK yet" + "We're growing. Check back soon."
//   reason='expanded_to_wider' → component does NOT render; the unified
//                                 result header carries the locality-aware
//                                 "Closest matches for X near Y" copy.
//
// `query` is optional.  When absent (e.g. user navigated to Search with an
// empty input), the title/body fall back to query-free wording.

type EmptyStateReason = 'none' | 'no_uk_supply' | 'expanded_to_wider'

type Props = {
  reason: EmptyStateReason | null | undefined
  query?: string
}

function trimmed(q?: string): string | null {
  if (!q) return null
  const t = q.trim()
  return t.length > 0 ? t : null
}

export function SearchEmptyState({ reason, query }: Props) {
  if (!reason || reason === 'expanded_to_wider') return null

  const q = trimmed(query)
  const { title, body } = (() => {
    switch (reason) {
      case 'no_uk_supply':
        return {
          title: q ? `Nothing for "${q}" in the UK yet` : 'Nothing in the UK yet',
          body:  "We're growing. Check back soon.",
        }
      case 'none':
      default:
        return {
          title: q ? `Nothing for "${q}" yet` : 'Nothing here yet',
          body:  'Try a different keyword.',
        }
    }
  })()

  return (
    <View style={styles.container} testID={`search-empty-${reason}`}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.body} numberOfLines={2}>
        {body}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 28,
    paddingTop:        48,
    paddingBottom:     32,
    alignItems:        'center',
  },
  title: {
    fontSize:   18,                // heading.md
    fontFamily: 'Lato-SemiBold',
    color:      '#010C35',         // text.primary navy
    lineHeight: 24,
    textAlign:  'center',
    marginBottom: 6,
  },
  body: {
    fontSize:   14,                // body.sm
    fontFamily: 'Lato-Regular',
    color:      '#4B5563',         // text.secondary
    lineHeight: 20,
    textAlign:  'center',
  },
})
