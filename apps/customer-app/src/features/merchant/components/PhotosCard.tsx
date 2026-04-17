import React from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { Image as ImageIcon } from 'lucide-react-native'
import { Image } from 'expo-image'
import { Text } from '@/design-system/Text'
import { color } from '@/design-system/tokens'
import { LinearGradient } from 'expo-linear-gradient'

type Props = {
  photos: string[]
}

export function PhotosCard({ photos }: Props) {
  if (photos.length === 0) return null

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <ImageIcon size={16} color={color.brandRose} />
        <Text variant="heading.sm" style={styles.title}>Photos</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {photos.map((url, i) => (
          <View key={i} style={styles.photoItem}>
            {url ? (
              <Image source={{ uri: url }} style={styles.photoImage} contentFit="cover" />
            ) : (
              <LinearGradient colors={['#2D3748', '#1A202C']} style={styles.photoImage} />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#010C35',
    letterSpacing: -0.1,
  },
  scroll: {
    gap: 8,
    paddingBottom: 2,
  },
  photoItem: {
    width: 110,
    height: 82,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoImage: {
    width: 110,
    height: 82,
  },
})
