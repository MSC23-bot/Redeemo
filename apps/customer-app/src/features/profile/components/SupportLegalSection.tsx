import React from 'react'
import * as WebBrowser from 'expo-web-browser'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { LINKS } from '@/lib/config/links'

interface Props {
  onGetHelp: () => void
}

export function SupportLegalSection({ onGetHelp }: Props) {
  const open = (url: string) => WebBrowser.openBrowserAsync(url)

  return (
    <ProfileSectionCard title="Support & Legal">
      <ProfileRow label="Get help" isFirst onPress={onGetHelp} />
      <ProfileRow label="About Redeemo"  onPress={() => { void open(LINKS.about) }}   preview="↗" />
      <ProfileRow label="FAQs"           onPress={() => { void open(LINKS.faq) }}     preview="↗" />
      <ProfileRow label="Terms of Use"   onPress={() => { void open(LINKS.terms) }}   preview="↗" />
      <ProfileRow label="Privacy Policy" onPress={() => { void open(LINKS.privacy) }} preview="↗" />
    </ProfileSectionCard>
  )
}
