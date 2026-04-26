import React, { useState, useEffect, useMemo } from 'react'
import {
  ScrollView, View, Text, StyleSheet, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ProfileHeader } from '../components/ProfileHeader'
import { ProfileSectionCard } from '../components/ProfileSectionCard'
import { ProfileRow } from '../components/ProfileRow'
import { PersonalInfoSheet } from '../components/PersonalInfoSheet'
import { AddressSheet } from '../components/AddressSheet'
import { InterestsSheet } from '../components/InterestsSheet'
import { ChangePasswordSheet } from '../components/ChangePasswordSheet'
import { SubscriptionManagementSheet } from '../components/SubscriptionManagementSheet'
import { NotificationsSection } from '../components/NotificationsSection'
import { AppSettingsSection } from '../components/AppSettingsSection'
import { RedeemoSection } from '../components/RedeemoSection'
import { GetHelpModal } from '../components/GetHelpModal'
import { SupportLegalSection } from '../components/SupportLegalSection'
import { DeleteAccountFlow } from '../components/DeleteAccountFlow'
import { useMe } from '@/hooks/useMe'
import { useSubscription } from '@/hooks/useSubscription'
import { useUpdateAvatar } from '@/hooks/useUpdateAvatar'
import { useAuthStore } from '@/stores/auth'
import { prefsStorage } from '@/lib/storage'
import type { SupportTopic } from '@/lib/constants/supportTopics'

type SheetName =
  | 'personal-info' | 'address' | 'interests' | 'change-password'
  | 'subscription' | 'delete-account' | null

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ProfileScreen() {
  const { data: profile, isLoading: profileLoading } = useMe()
  const { subscription } = useSubscription()
  const { mutate: updateAvatar, isPending: avatarUploading } = useUpdateAvatar()
  const queryClient = useQueryClient()
  const signOut = useAuthStore(s => s.signOut)

  const [openSheet, setOpenSheet] = useState<SheetName>(null)
  const [helpVisible, setHelpVisible] = useState(false)
  const [helpTopic, setHelpTopic] = useState<SupportTopic | undefined>(undefined)
  const [helpMessage, setHelpMessage] = useState<string | undefined>(undefined)

  const [deviceName, setDeviceName] = useState<string | null>(null)
  useEffect(() => {
    prefsStorage.get<string>('redeemo:deviceName').then(setDeviceName)
  }, [])

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85, base64: true,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (!asset.base64) return
    const sizeBytes = (asset.base64.length * 3) / 4
    if (sizeBytes > 3 * 1024 * 1024) {
      Alert.alert('Image too large', 'Please choose an image under 3 MB.')
      return
    }
    const mimeType = asset.mimeType ?? 'image/jpeg'
    updateAvatar(`data:${mimeType};base64,${asset.base64}`)
  }

  const openGetHelp = (topic?: SupportTopic, message?: string) => {
    setHelpTopic(topic)
    setHelpMessage(message)
    setHelpVisible(true)
  }

  const handleSignOut = async () => {
    queryClient.clear()
    await signOut()
    router.replace('/(auth)/login')
  }

  const interestPreview = useMemo(() => {
    if (!profile?.interests?.length) return undefined
    const names = profile.interests.map(i => i.name)
    if (names.length <= 2) return names.join(', ')
    return `${names[0]}, ${names[1]} +${names.length - 2}`
  }, [profile?.interests])

  if (profileLoading || !profile) return null

  const sub = subscription
  const priceSuffix = sub?.plan.billingInterval === 'ANNUAL' ? '/yr' : '/mo'
  const subPreview = sub
    ? (sub.cancelAtPeriodEnd
        ? `Access until ${formatDate(sub.currentPeriodEnd)}`
        : `Renews ${formatDate(sub.currentPeriodEnd)}`)
    : 'Subscribe to redeem vouchers'

  const personalInfoPreview = [profile.firstName, profile.gender].filter(Boolean).join(' · ') || undefined
  const addressPreview = [profile.city, profile.postcode].filter(Boolean).join(', ') || undefined

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ProfileHeader
        profile={profile}
        subscription={sub ?? undefined}
        onAvatarPress={handleAvatarPress}
        uploading={avatarUploading}
      />

      <ProfileSectionCard title="My Account">
        <ProfileRow
          label="Personal info"
          isFirst
          {...(personalInfoPreview !== undefined ? { preview: personalInfoPreview } : {})}
          onPress={() => setOpenSheet('personal-info')}
        />
        <ProfileRow
          label="Address"
          {...(addressPreview !== undefined ? { preview: addressPreview } : {})}
          onPress={() => setOpenSheet('address')}
        />
        <ProfileRow
          label="Interests"
          {...(interestPreview !== undefined ? { preview: interestPreview } : {})}
          onPress={() => setOpenSheet('interests')}
        />
        <ProfileRow
          label="Change password"
          onPress={() => setOpenSheet('change-password')}
        />
        <ProfileRow
          label="Active session"
          preview={deviceName ? `Signed in on ${deviceName}` : 'Signed in on this device'}
          disabled
        />
      </ProfileSectionCard>

      <ProfileSectionCard title="Subscription">
        {sub ? (
          <ProfileRow
            label={`${sub.plan.name} · £${sub.plan.priceGbp.toFixed(2)}${priceSuffix}`}
            isFirst
            preview={subPreview}
            onPress={() => setOpenSheet('subscription')}
          />
        ) : (
          <ProfileRow
            label="No active plan"
            isFirst
            preview={subPreview}
            onPress={() => router.push('/(auth)/subscription-prompt')}
          />
        )}
        <ProfileRow
          label="Payment method"
          rightContent={
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonText}>Coming soon</Text>
            </View>
          }
          disabled
        />
      </ProfileSectionCard>

      <NotificationsSection
        newsletterConsent={profile.newsletterConsent ?? false}
        userId={profile.id}
      />

      <AppSettingsSection />

      <RedeemoSection />

      <SupportLegalSection onGetHelp={() => openGetHelp()} />

      <ProfileSectionCard title="">
        <ProfileRow
          label="Sign out"
          isFirst
          onPress={() => { void handleSignOut() }}
        />
        <ProfileRow
          label="Delete account"
          destructive
          onPress={() => setOpenSheet('delete-account')}
        />
      </ProfileSectionCard>

      <Text style={styles.version}>Redeemo v1.0.0</Text>

      <PersonalInfoSheet
        visible={openSheet === 'personal-info'}
        onDismiss={() => setOpenSheet(null)}
        profile={profile}
        onGetHelp={(topic, message) => { setOpenSheet(null); openGetHelp(topic as SupportTopic, message) }}
      />
      <AddressSheet
        visible={openSheet === 'address'}
        onDismiss={() => setOpenSheet(null)}
        profile={profile}
      />
      <InterestsSheet
        visible={openSheet === 'interests'}
        onDismiss={() => setOpenSheet(null)}
        selectedIds={profile.interests.map(i => i.id)}
      />
      <ChangePasswordSheet
        visible={openSheet === 'change-password'}
        onDismiss={() => setOpenSheet(null)}
        onSuccess={() => {}}
      />
      <SubscriptionManagementSheet
        visible={openSheet === 'subscription'}
        onDismiss={() => setOpenSheet(null)}
        subscription={sub}
      />
      <DeleteAccountFlow
        visible={openSheet === 'delete-account'}
        onDismiss={() => setOpenSheet(null)}
      />
      <GetHelpModal
        visible={helpVisible}
        onDismiss={() => { setHelpVisible(false); setHelpTopic(undefined); setHelpMessage(undefined) }}
        {...(helpTopic !== undefined ? { initialTopic: helpTopic } : {})}
        {...(helpMessage !== undefined ? { initialMessage: helpMessage } : {})}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#FAF8F5' },
  content:        { padding: 16, paddingBottom: 40 },
  comingSoonPill: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  comingSoonText: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  version:        { fontSize: 12, color: 'rgba(1,12,53,0.35)', textAlign: 'center', marginTop: 8, marginBottom: 16 },
})
