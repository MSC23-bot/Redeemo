import React, { useState, useMemo } from 'react'
import {
  ScrollView, View, Text, StyleSheet, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProfileHeader } from '../components/ProfileHeader'
import { ProfileSkeleton } from '../components/ProfileSkeleton'
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
import type { SupportTopic } from '@/lib/constants/supportTopics'

type SheetName =
  | 'personal-info' | 'address' | 'interests' | 'change-password'
  | 'subscription' | 'delete-account' | null

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { data: profile, isLoading: profileLoading } = useMe()
  const { subscription } = useSubscription()
  const { mutate: updateAvatar, isPending: avatarUploading } = useUpdateAvatar()
  const queryClient = useQueryClient()
  const signOut = useAuthStore(s => s.signOut)

  const [openSheet, setOpenSheet] = useState<SheetName>(null)
  const [helpVisible, setHelpVisible] = useState(false)
  const [helpTopic, setHelpTopic] = useState<SupportTopic | undefined>(undefined)
  const [helpMessage, setHelpMessage] = useState<string | undefined>(undefined)

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
    const names = profile.interests.map((i: { name: string }) => i.name)
    if (names.length <= 2) return names.join(', ')
    return `${names[0]}, ${names[1]} +${names.length - 2}`
  }, [profile?.interests])

  if (profileLoading || !profile) return <ProfileSkeleton />

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
    // Outer View carries the safe-area top inset + page bg colour. The
    // ScrollView sits BELOW the status area / Dynamic Island, bounded by
    // this wrapper, so content can never scroll behind native iOS chrome.
    // Pre-fix the ScrollView extended to the device top and content slid
    // behind the notch / Dynamic Island when scrolled — visible bug
    // reported during PR #133 device QA.
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          // Bottom: device safe-area + 100pt clearance for the absolute
          // tab bar so the last row (Sign out / Delete / version) can
          // scroll into view.
          { paddingBottom: insets.bottom + 100 },
        ]}
      >
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
      </ProfileSectionCard>

      <ProfileSectionCard title="Subscription">
        {sub ? (
          <ProfileRow
            label={`${sub.plan.name} Plan · £${sub.plan.priceGbp.toFixed(2)}${priceSuffix}`}
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
        selectedIds={profile.interests.map((i: { id: string }) => i.id)}
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
    </View>
  )
}

const styles = StyleSheet.create({
  // Outer View: page bg + safe-area top inset is applied inline. The bg
  // colour occludes the status bar area with the page colour so content
  // never visually bleeds behind the notch / Dynamic Island.
  screen:         { flex: 1, backgroundColor: '#FAF8F5' },
  // ScrollView: transparent (inherits page bg) so the wrapper bg shows
  // through during pull-to-refresh overscroll.
  scroll:         { flex: 1, backgroundColor: 'transparent' },
  // Content padding: horizontal + top only. Bottom inset + tab-bar
  // clearance are applied inline.
  content:        { paddingHorizontal: 16, paddingTop: 16 },
  comingSoonPill: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  comingSoonText: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  version:        { fontSize: 12, color: 'rgba(1,12,53,0.35)', textAlign: 'center', marginTop: 8, marginBottom: 16 },
})
