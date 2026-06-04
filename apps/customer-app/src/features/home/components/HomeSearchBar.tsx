import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Search } from 'lucide-react-native'
import { Text, color } from '@/design-system'

type Props = {
  /** Tap-through to /search — parent (HomeScreen) owns the routing. */
  onPress: () => void
}

/**
 * Expanded Home search affordance: a full-width pill that LOOKS like a
 * search field but is a button — tapping routes to /search (the real
 * search screen owns the actual TextInput). Home-owned; it visually
 * echoes features/search/SearchBar but does NOT import it, keeping the
 * Search surface untouched (spec §7).
 */
export function HomeSearchBar({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      testID="home-search-bar"
      accessibilityRole="button"
      accessibilityLabel="Search"
      style={styles.bar}
    >
      <Search size={18} color={color.brandRose} />
      <Text variant="body.md" color="secondary" style={styles.placeholder} numberOfLines={1}>
        Search merchants, vouchers…
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: color.surface.tint, // cream-rose — echoes SearchBar
    gap: 10,
  },
  placeholder: {
    flex: 1,
  },
})
