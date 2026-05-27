import React, { useState } from 'react'
import { Switch } from 'react-native'
import * as Location from 'expo-location'
import { router, useFocusEffect } from 'expo-router'
import { MapPin } from '@/design-system/icons'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { useAuthStore } from '@/stores/auth'
import { useOsReduceMotion } from '../hooks/useReduceMotion'

function useLocationStatus() {
  const [status, setStatus] = useState<string>('UNDETERMINED')

  const refresh = async () => {
    try {
      const result = await Location.getForegroundPermissionsAsync()
      if (result.status === 'granted') {
        setStatus((result as any).ios?.scope === 'whenInUse' ? 'WHEN_IN_USE' : 'GRANTED')
      } else {
        setStatus(result.status.toUpperCase())
      }
    } catch {
      setStatus('UNDETERMINED')
    }
  }

  useFocusEffect(React.useCallback(() => { void refresh() }, []))

  return status
}

// Friendly user-facing copy for the Location row preview. Replaces the
// raw permission enum strings ("Denied", "Not set") that read like
// system errors. The row routes to /saved-area where the §DF v1 Your
// Location screen owns the full status detail (postcode, GPS state,
// recovery actions) — this preview just needs to telegraph state at a
// glance.
const locationLabel: Record<string, string> = {
  GRANTED:      'On',
  WHEN_IN_USE:  'On while using',
  DENIED:       'Off',
  UNDETERMINED: 'Set up',
}

export function AppSettingsSection() {
  const hapticsEnabled = useAuthStore(s => s.hapticsEnabled)
  const motionScale    = useAuthStore(s => s.motionScale)
  const setHaptics     = useAuthStore(s => s.setHaptics)
  const setMotionScale = useAuthStore(s => s.setMotionScale)
  // OS-only signal — must NOT mix in the in-app motionScale here, or the
  // lock would engage as soon as the user toggles in-app and the user
  // could never turn it back off. The combined signal is the
  // `useReduceMotion()` hook; this surface needs the OS-only bit.
  const osReduceMotion = useOsReduceMotion()
  const locationStatus = useLocationStatus()

  // Lock engages WHENEVER the OS is forcing reduce motion, regardless of
  // the in-app motionScale. Reasoning: when the OS is reduce-motion-on,
  // the effective reduce-motion is ON system-wide and the in-app toggle
  // cannot override it. Letting the user tap the switch creates a "stuck
  // ON" feel — the switch flips visually then snaps back because the
  // effective value (`motionScale === 0 || osReduceMotion`) is still
  // true. Locking the switch surfaces the constraint honestly ("change
  // this in OS Settings"). Pinned by AppSettingsSection.test.tsx.
  const isReduceMotionLocked = osReduceMotion

  return (
    <ProfileSectionCard title="App Settings">
      <ProfileRow
        label="Haptic feedback"
        isFirst
        rightContent={
          <Switch
            value={hapticsEnabled}
            onValueChange={setHaptics}
            trackColor={{ false: '#D1D5DB', true: '#E20C04' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Haptic feedback"
            accessibilityRole="switch"
          />
        }
      />
      <ProfileRow
        label="Reduce motion"
        disabled={isReduceMotionLocked}
        rightContent={
          <Switch
            value={motionScale === 0 || osReduceMotion}
            onValueChange={v => { if (!isReduceMotionLocked) setMotionScale(v ? 0 : 1) }}
            disabled={isReduceMotionLocked}
            trackColor={{ false: '#D1D5DB', true: '#E20C04' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Reduce motion"
            accessibilityRole="switch"
          />
        }
      />
      <ProfileRow
        label="Location"
        preview={locationLabel[locationStatus] ?? 'Set up'}
        // ?from=profile so SavedAreaScreen.handleBack routes back here
        // instead of falling to Home via the Tabs.Screen default. Mirrors
        // the existing ?from=search pattern that closes the same loophole
        // when Your Location is opened from Search.
        onPress={() => router.push('/saved-area?from=profile' as any)}
        leftIcon={<MapPin size={16} color="rgba(1,12,53,0.4)" />}
      />
    </ProfileSectionCard>
  )
}
