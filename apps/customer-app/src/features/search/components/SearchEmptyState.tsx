import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

// PR #112 fixup-6.4 (2026-05-20) — owner-locked copy refresh.  All three
// states use Redeemo-persona language: confident, plain-spoken, British
// English, no em dashes.  Banned wording (regression-pinned in tests):
//   - "Nothing for X..."         — owner direction: avoid `nothing`.
//   - "in the UK"                — implies regional limit / dead end.
//   - "come back soon" / "check back soon" — sounds like a dead end.
//   - em dashes / double dashes.
//
// State machine:
//   reason='none'              → user searched, predicate matched no rows
//   reason='no_uk_supply'      → no platform supply for the query
//   reason='pre_search'        → user hasn't typed yet; render this above
//                                <TrendingSearches> as a discovery prompt
//   reason='expanded_to_wider' → component renders nothing; the unified
//                                result header carries the locality-aware
//                                "Closest matches for X near Y" copy
//
// Animated illustration slot is reserved here for §CH (deferred — Motion
// + 21st.dev tooling).  The empty <View> above the title is the mount
// slot; when assets land, an <Illustration reason={reason} /> renders
// there.

type EmptyStateReason = 'none' | 'no_uk_supply' | 'expanded_to_wider' | 'pre_search'

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
      case 'pre_search':
        return {
          title: 'Find your next local saving',
          body:  'Search restaurants, cafés, salons, gyms and more.',
        }
      case 'no_uk_supply':
        return q
          ? {
              title: `We could not find a match for "${q}"`,
              body:  'Try another search, or explore what is available near you.',
            }
          : {
              title: 'We could not find a match',
              body:  'Try another search, or explore what is available near you.',
            }
      case 'none':
      default:
        return q
          ? {
              title: `No exact matches for "${q}"`,
              body:  'Try a different keyword, or browse nearby categories.',
            }
          : {
              title: 'No exact matches',
              body:  'Try a different keyword, or browse nearby categories.',
            }
    }
  })()

  return (
    <View
      style={reason === 'pre_search' ? styles.containerPreSearch : styles.container}
      testID={`search-empty-${reason}`}
    >
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
  // Pre-search variant sits above <TrendingSearches>, so it uses tighter
  // top padding (the search bar above already provides breathing room).
  containerPreSearch: {
    paddingHorizontal: 28,
    paddingTop:        24,
    paddingBottom:     16,
    alignItems:        'center',
  },
  title: {
    fontSize:    18,                // heading.md
    fontFamily:  'Lato-SemiBold',
    color:       '#010C35',         // text.primary navy
    lineHeight:  24,
    textAlign:   'center',
    marginBottom: 6,
  },
  body: {
    fontSize:   14,                 // body.sm
    fontFamily: 'Lato-Regular',
    color:      '#4B5563',          // text.secondary
    lineHeight: 20,
    textAlign:  'center',
  },
})
