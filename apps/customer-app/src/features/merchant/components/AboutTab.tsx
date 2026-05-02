import React from 'react'
import { View, StyleSheet } from 'react-native'
import { AboutCard } from './AboutCard'
import { PhotosCard } from './PhotosCard'
import { AmenitiesCard } from './AmenitiesCard'
import { OpeningHoursCard } from './OpeningHoursCard'
import type { Amenity, OpeningHourEntry } from '@/lib/api/merchant'
import { useOpenStatus } from '../hooks/useOpenStatus'

type Props = {
  businessName: string
  description: string | null
  photos: string[]
  amenities: Amenity[]
  openingHours: OpeningHourEntry[]
  // Server-computed live status (Europe/London) threaded down from the
  // screen so MetaSection + this tab share a single source of truth.
  // Optional only because the hook supports a local-time fallback for
  // tests / older callers; production callers pass it.
  serverIsOpenNow?: boolean
}

export function AboutTab({ businessName, description, photos, amenities, openingHours, serverIsOpenNow }: Props) {
  const openStatus = useOpenStatus(openingHours, serverIsOpenNow)
  return (
    <View style={styles.container}>
      {description && <AboutCard businessName={businessName} description={description} />}
      <PhotosCard photos={photos} />
      <AmenitiesCard amenities={amenities} />
      {openingHours.length > 0 && (
        <OpeningHoursCard weekSchedule={openStatus.weekSchedule} isOpen={openStatus.isOpen} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
})
