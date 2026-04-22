import React from 'react'
import { View, StyleSheet } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { Text, color } from '@/design-system'
import { MerchantTile } from '@/lib/api/discovery'

type Props = {
  merchants: MerchantTile[]
  selectedId: string | null
  onPress: (merchant: MerchantTile) => void
}

function getPinColor(merchant: MerchantTile): string {
  const catName = merchant.primaryCategory?.name?.toLowerCase() ?? ''
  if (catName.includes('food') || catName.includes('drink')) return color.pin.foodDrink
  if (catName.includes('beauty') || catName.includes('wellness')) return color.pin.beautyWellness
  if (catName.includes('fitness') || catName.includes('sport')) return color.pin.fitnessSport
  if (catName.includes('shopping')) return color.pin.shopping
  return color.pin.default
}

function CustomPin({
  merchant,
  selected,
}: {
  merchant: MerchantTile
  selected: boolean
}) {
  const pinColor = getPinColor(merchant)
  const size = selected ? 42 : 34
  const letter = merchant.businessName.charAt(0).toUpperCase()

  return (
    <View style={styles.pinContainer}>
      {/* Circle with letter */}
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: pinColor,
          },
        ]}
      >
        <Text
          variant="label.md"
          style={[styles.pinLetter, { fontSize: selected ? 16 : 13 }]}
        >
          {letter}
        </Text>
      </View>
      {/* Pin tail triangle */}
      <View
        style={[
          styles.pinTail,
          { borderTopColor: pinColor, borderTopWidth: selected ? 10 : 8 },
        ]}
      />
    </View>
  )
}

export function MapPins({ merchants, selectedId, onPress }: Props) {
  return (
    <>
      {merchants.map((merchant) => {
        // Only render pins for merchants that have location data
        // In a real scenario the merchant tile would have lat/lng from nearest branch
        // For now we skip merchants without coordinates
        const lat = (merchant as any).lat as number | undefined
        const lng = (merchant as any).lng as number | undefined

        if (lat === undefined || lng === undefined) return null

        return (
          <Marker
            key={merchant.id}
            identifier={merchant.id}
            coordinate={{ latitude: lat, longitude: lng }}
            onPress={() => onPress(merchant)}
            tracksViewChanges={false}
          >
            <CustomPin merchant={merchant} selected={selectedId === merchant.id} />
          </Marker>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  pinContainer: {
    alignItems: 'center',
  },
  circle: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinLetter: {
    color: '#FFFFFF',
    fontFamily: 'Lato-Bold',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
})
