import React, { useState } from 'react'
import { View, Text, Switch, StyleSheet } from 'react-native'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { profileApi } from '@/lib/api/profile'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  newsletterConsent: boolean
  userId: string
}

export function NotificationsSection({ newsletterConsent, userId }: Props) {
  const [consent, setConsent] = useState(newsletterConsent)
  const queryClient = useQueryClient()

  const handleNewsletterToggle = async (value: boolean) => {
    const prev = consent
    setConsent(value) // optimistic
    try {
      await profileApi.updateProfile({ newsletterConsent: value })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    } catch {
      setConsent(prev) // rollback
    }
  }

  return (
    <ProfileSectionCard title="Notifications">
      {/* Push notifications — stub, non-interactive */}
      <ProfileRow
        label="Push notifications"
        isFirst
        rightContent={
          <View style={styles.comingSoonPill}>
            <Text style={styles.comingSoonText}>Coming soon</Text>
          </View>
        }
        disabled
      />

      {/* Email newsletter — fully live toggle */}
      <ProfileRow
        label="Email newsletter"
        rightContent={
          <Switch
            value={consent}
            onValueChange={handleNewsletterToggle}
            trackColor={{ false: '#D1D5DB', true: '#E20C04' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Email newsletter"
            accessibilityRole="switch"
          />
        }
      />
    </ProfileSectionCard>
  )
}

const styles = StyleSheet.create({
  comingSoonPill: {
    backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  comingSoonText: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
})
