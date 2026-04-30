import React, { useMemo } from 'react'
import { View, FlatList, Pressable, StyleSheet } from 'react-native'
import { MapPin, Navigation } from 'lucide-react-native'
import { Text, color, spacing, radius, elevation, layer } from '@/design-system'
import { geocodeCity } from '@/lib/geocoding'

export const UK_CITIES = [
  'London',
  'Manchester',
  'Birmingham',
  'Leeds',
  'Glasgow',
  'Liverpool',
  'Newcastle upon Tyne',
  'Sheffield',
  'Bristol',
  'Edinburgh',
  'Leicester',
  'Coventry',
  'Bradford',
  'Cardiff',
  'Belfast',
  'Nottingham',
  'Kingston upon Hull',
  'Plymouth',
  'Stoke-on-Trent',
  'Wolverhampton',
  'Southampton',
  'Derby',
  'Swansea',
  'Salford',
  'Aberdeen',
  'Westminster',
  'Portsmouth',
  'York',
  'Peterborough',
  'Dundee',
  'Lancaster',
  'Oxford',
  'Cambridge',
  'Exeter',
  'Bath',
  'Brighton',
  'Reading',
  'Norwich',
]

type Props = {
  query: string
  onCitySelect: (cityName: string, coords: { lat: number; lng: number }) => void
  onCurrentLocation: () => void
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return <Text variant="body.sm" style={{ color: color.text.primary }}>{text}</Text>

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) {
    return <Text variant="body.sm" style={{ color: color.text.primary }}>{text}</Text>
  }

  const before = text.slice(0, index)
  const match = text.slice(index, index + query.length)
  const after = text.slice(index + query.length)

  return (
    <Text variant="body.sm" style={{ color: color.text.primary }}>
      {before}
      <Text variant="body.sm" style={{ color: color.brandRose, fontFamily: 'Lato-Bold' }}>
        {match}
      </Text>
      {after}
    </Text>
  )
}

export function LocationSearch({ query, onCitySelect, onCurrentLocation }: Props) {
  const filteredCities = useMemo(() => {
    if (!query) return UK_CITIES
    const lower = query.toLowerCase()
    return UK_CITIES.filter((c) => c.toLowerCase().includes(lower))
  }, [query])

  const handleCityPress = async (city: string) => {
    const coords = await geocodeCity(city)
    if (coords) {
      onCitySelect(city, coords)
    }
  }

  return (
    <View style={styles.container}>
      {/* Use current location row */}
      <Pressable
        onPress={onCurrentLocation}
        accessibilityLabel="Use current location"
        style={styles.currentLocationRow}
      >
        <View style={styles.iconWrapper}>
          <Navigation size={16} color={color.brandRose} />
        </View>
        <Text variant="body.sm" style={styles.currentLocationText}>
          Use current location
        </Text>
      </Pressable>

      <View style={styles.divider} />

      {/* Cities list */}
      <FlatList
        data={filteredCities}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleCityPress(item)}
            accessibilityLabel={item}
            style={styles.cityRow}
          >
            <MapPin size={14} color={color.text.tertiary} />
            {highlightMatch(item, query)}
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 56,
    left: spacing[4],
    right: spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    zIndex: layer.sheet,
    maxHeight: 320,
    ...elevation.lg,
  },
  currentLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF6F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationText: {
    color: color.brandRose,
    fontFamily: 'Lato-SemiBold',
  },
  divider: {
    height: 1,
    backgroundColor: color.border.subtle,
    marginHorizontal: spacing[4],
  },
  list: {
    flexGrow: 0,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
})
