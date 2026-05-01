import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, Button, color, spacing, layout, radius } from '@/design-system'
import { User } from '@/design-system/icons'
import { useAuthStore } from '@/stores/auth'

// Minimal Profile shell: name + email + sign-out. Phase 3C.1h Profile tab
// rebaseline supersedes this with the full surface (subscription mgmt,
// settings, support, delete account, etc.). Until that lands, this is the
// only sign-out path for fully-onboarded users.
export default function ProfileScreen() {
  const insets   = useSafeAreaInsets()
  const user     = useAuthStore((s) => s.user)
  const signOut  = useAuthStore((s) => s.signOut)

  const name  = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || '—'
  const email = user?.email ?? '—'

  // Sign out clears tokens + sets status='unauthenticated'. The (app)/_layout
  // resolveRedirect then routes to /(auth)/welcome on the next render.
  const onSignOut = () => { void signOut() }

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + spacing[6], paddingBottom: insets.bottom + 100 },
      ]}
    >
      <Text variant="heading.lg" style={styles.title} accessibilityRole="header">
        Profile
      </Text>

      <View style={styles.identityCard} accessibilityLabel={`Signed in as ${name}, ${email}`}>
        <View style={styles.avatar}>
          <User size={28} color={color.brandRose} />
        </View>
        <View style={styles.identityText}>
          <Text variant="heading.sm" numberOfLines={1}>{name}</Text>
          <Text variant="body.sm" color="secondary" numberOfLines={1}>{email}</Text>
        </View>
      </View>

      <View style={styles.spacer} />

      <Button
        variant="primary"
        size="md"
        fullWidth
        onPress={onSignOut}
        accessibilityLabel="Sign out"
      >
        Sign out
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface.page,
    paddingHorizontal: layout.screenPaddingH,
  },
  title: {
    marginBottom: spacing[6],
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[4],
    backgroundColor: color.surface.tint,
    borderRadius: radius.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFE5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    flex: 1,
  },
  spacer: { flex: 1 },
})
