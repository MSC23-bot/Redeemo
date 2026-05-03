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
  // Server-computed live status (Europe/London) — threaded down from the
  // screen and passed straight into OpeningHoursCard's header pill so the
  // tab and MetaSection share a single source of truth.
  serverIsOpenNow: boolean
}

export function AboutTab({ businessName, description, photos, amenities, openingHours, serverIsOpenNow }: Props) {
  const { weekSchedule } = useOpenStatus(openingHours)
  return (
    <View style={styles.container}>
      {description && <AboutCard businessName={businessName} description={description} />}
      <PhotosCard photos={photos} />
      <AmenitiesCard amenities={amenities} />
      {openingHours.length > 0 && (
        <OpeningHoursCard weekSchedule={weekSchedule} isOpen={serverIsOpenNow} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
})
