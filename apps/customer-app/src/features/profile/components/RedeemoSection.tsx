import React, { useState } from 'react'
import { Linking, Share, Platform, Alert } from 'react-native'
import * as StoreReview from 'expo-store-review'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { LINKS } from '@/lib/config/links'
import { useToast } from '@/design-system/motion/Toast'

export function RedeemoSection() {
  const [requestOpen, setRequestOpen] = useState(false)
  const { show: showToast } = useToast()

  const handleBecomeMerchant = () => {
    void Linking.openURL(LINKS.merchantPortal)
  }

  const handleRequestMerchant = () => {
    // Sub-PR 2 stub — merchant-request API not yet on main
    Alert.alert('Coming soon', 'Merchant requests are coming in a future update.')
  }

  const handleRateApp = async () => {
    const available = await StoreReview.isAvailableAsync()
    if (available) {
      await StoreReview.requestReview()
    } else {
      const storeUrl = Platform.OS === 'ios' ? LINKS.appStoreIos : LINKS.appStoreAndroid
      void Linking.openURL(storeUrl)
    }
  }

  const handleShare = async () => {
    const storeUrl = Platform.OS === 'ios' ? LINKS.appStoreIos : LINKS.appStoreAndroid
    await Share.share({
      message: `I've been saving money with Redeemo — check it out! ${storeUrl}`,
    })
  }

  return (
    <ProfileSectionCard title="Redeemo">
      <ProfileRow
        label="Become a merchant"
        isFirst
        onPress={handleBecomeMerchant}
        preview="↗"
      />
      <ProfileRow
        label="Request a merchant"
        onPress={handleRequestMerchant}
      />
      <ProfileRow
        label="Rate Redeemo ⭐"
        onPress={() => { void handleRateApp() }}
      />
      <ProfileRow
        label="Share Redeemo"
        onPress={() => { void handleShare() }}
      />
    </ProfileSectionCard>
  )
}
