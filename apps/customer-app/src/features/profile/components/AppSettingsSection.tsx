import React, { useState } from 'react'
import { Switch, Linking } from 'react-native'
import * as Location from 'expo-location'
import { useFocusEffect } from 'expo-router'
import { MapPin } from 'lucide-react-native'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { useAuthStore } from '@/stores/auth'
import { useReduceMotion } from '../hooks/useReduceMotion'

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

const locationLabel: Record<string, string> = {
  GRANTED:      'Allowed',
  WHEN_IN_USE:  'While using',
  DENIED:       'Denied',
  UNDETERMINED: 'Not set',
}

export function AppSettingsSection() {
  const hapticsEnabled = useAuthStore(s => s.hapticsEnabled)
  const motionScale    = useAuthStore(s => s.motionScale)
  const setHaptics     = useAuthStore(s => s.setHaptics)
  const setMotionScale = useAuthStore(s => s.setMotionScale)
  const osReduceMotion = useReduceMotion()
  const locationStatus = useLocationStatus()

  const isReduceMotionLocked = osReduceMotion && motionScale === 0

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
        label="Location access"
        preview={locationLabel[locationStatus] ?? 'Not set'}
        onPress={() => { void Linking.openSettings() }}
        leftIcon={<MapPin size={16} color="rgba(1,12,53,0.4)" />}
      />
    </ProfileSectionCard>
  )
}
