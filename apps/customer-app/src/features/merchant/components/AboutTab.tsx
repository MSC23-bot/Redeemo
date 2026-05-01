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
}

export function AboutTab({ businessName, description, photos, amenities, openingHours }: Props) {
  const openStatus = useOpenStatus(openingHours)
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
