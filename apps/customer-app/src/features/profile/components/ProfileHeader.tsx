import React from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { Camera } from 'lucide-react-native'
import type { Profile } from '@/lib/api/profile'
import type { Subscription } from '@/lib/api/subscription'

interface Props {
  profile: Profile
  subscription: Subscription | undefined
  onAvatarPress: () => void
  uploading?: boolean
}

function completenessToTip(pct: number): string | null {
  if (pct >= 100) return null
  if (pct >= 80) return 'Almost there — add your profile photo to complete your profile'
  if (pct >= 40) return 'Add your address and interests to improve your recommendations'
  return 'Add your date of birth, address, and interests to unlock more personalised deals'
}

function badgeText(status: string | undefined): { text: string; variant: 'active' | 'cancelled' | 'amber' } | null {
  if (!status) return null
  if (status === 'ACTIVE' || status === 'TRIALLING') return { text: 'ACTIVE', variant: 'active' }
  if (status === 'CANCELLED') return { text: 'CANCELLED', variant: 'cancelled' }
  if (status === 'PAST_DUE') return { text: 'PAST DUE', variant: 'amber' }
  if (status === 'EXPIRED') return { text: 'EXPIRED', variant: 'cancelled' }
  return null
}

function Initials({ name }: { name: string }) {
  const letter = name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <LinearGradient colors={['#E20C04', '#E84A00']} style={styles.avatarGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text style={styles.initialsText}>{letter}</Text>
    </LinearGradient>
  )
}

export function ProfileHeader({ profile, subscription, onAvatarPress, uploading }: Props) {
  const tip = completenessToTip(profile.profileCompleteness)
  const badge = badgeText(subscription?.status)
  const progressWidth = useSharedValue(0)
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressWidth.value}%` }))

  React.useEffect(() => {
    progressWidth.value = withTiming(profile.profileCompleteness, { duration: 600 })
  }, [profile.profileCompleteness])

  const badgeColors: Record<string, string[]> = {
    active:    ['#E20C04', '#E84A00'],
    cancelled: ['#6B7280', '#9CA3AF'],
    amber:     ['#D97706', '#F59E0B'],
  }

  return (
    <View style={styles.card}>
      {/* Avatar */}
      <Pressable onPress={onAvatarPress} style={({ pressed }) => [styles.avatarWrapper, pressed && { opacity: 0.8 }]}>
        {profile.profileImageUrl ? (
          <Image source={{ uri: profile.profileImageUrl }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Initials name={profile.firstName ?? '?'} />
        )}
        <View style={styles.cameraOverlay}>
          {uploading
            ? <ActivityIndicator size={10} color="#010C35" />
            : <Camera size={10} color="#010C35" strokeWidth={2.5} />
          }
        </View>
      </Pressable>

      {/* Identity + completeness */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{profile.firstName} {profile.lastName ?? ''}</Text>
        <Text style={styles.email} numberOfLines={1}>{profile.email}</Text>

        {/* Completeness bar */}
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>PROFILE STRENGTH · {profile.profileCompleteness}%</Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, progressStyle]} />
        </View>

        {tip && <Text style={styles.tip} numberOfLines={2}>{tip}</Text>}
      </View>

      {/* Subscription badge */}
      {badge && (
        <LinearGradient
          colors={badgeColors[badge.variant] as [string, string]}
          style={styles.badge}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Text style={styles.badgeText}>{badge.text}</Text>
        </LinearGradient>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, marginBottom: 16,
  },
  avatarWrapper: { position: 'relative', flexShrink: 0 },
  avatarImage:   { width: 52, height: 52, borderRadius: 14 },
  avatarGradient: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  initialsText:  { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  cameraOverlay: {
    position: 'absolute', bottom: -4, right: -4,
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2,
  },
  info:      { flex: 1, minWidth: 0 },
  name:      { fontSize: 15, fontWeight: '600', color: '#010C35', marginBottom: 2 },
  email:     { fontSize: 12, color: 'rgba(1,12,53,0.5)', marginBottom: 8 },
  barRow:    { marginBottom: 3 },
  barLabel:  { fontSize: 10, fontWeight: '600', color: 'rgba(1,12,53,0.4)', letterSpacing: 0.3 },
  barTrack:  { height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  barFill:   { height: '100%', borderRadius: 3, backgroundColor: '#E20C04' },
  tip:       { fontSize: 11, color: 'rgba(1,12,53,0.4)', lineHeight: 16 },
  badge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
})
