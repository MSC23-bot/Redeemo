import React from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Search } from '@/design-system/icons'
import { Text, color } from '@/design-system'

type Props = {
  /** Tap-through to /search — parent (HomeScreen) owns the routing. */
  onPress: () => void
}

/**
 * Expanded Home search affordance: a full-width pill that LOOKS like a
 * search field but is a button — tapping routes to /search (the real
 * search screen owns the actual TextInput). Home-owned; it visually
 * echoes features/search/SearchBar (white surface, brand-rose hairline,
 * soft navy-tinted lift, brand-rose glyph) but does NOT import it, so the
 * Home bar reads as a true preview of the destination while keeping the
 * Search surface untouched (spec §7).
 *
 * The hairline + soft shadow "pin" the bar into the warm header instead of
 * letting it float against the cream body. Press feedback (subtle scale)
 * signals it's tappable; there is no cursor / inline input on Home.
 */
export function HomeSearchBar({ onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      testID="home-search-bar"
      accessibilityRole="button"
      accessibilityLabel="Search"
      style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
    >
      <Search size={18} color={color.brandRose} />
      <Text variant="body.md" style={styles.placeholder} numberOfLines={1}>
        Search merchants, vouchers…
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Matches features/search/SearchBar resting treatment so the tap-through
  // bar is visually identical to the destination input.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF', // surface-page; pops off the warm cream header
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.12)', // brand-rose hairline (very subtle)
    gap: 10,
    // Soft navy-tinted lift — tints toward brand, not muddy black.
    shadowColor: color.navy,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
  placeholder: {
    flex: 1,
    color: '#9CA3AF', // placeholder grey (matches SearchBar) — reads as a hint, not entered text
  },
})
