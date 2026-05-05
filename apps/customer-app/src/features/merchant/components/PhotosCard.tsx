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
        <ImageIcon size={18} color={color.brandRose} />
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
  // Round 5 §5 (impeccable polish):
  //   • borderRadius 16 → 18 (system consistency).
  //   • Title 15pt 800 → 16pt 700 (less shouty, better hierarchy).
  //   • Photo dimensions 110×82 → 130×96. Round 4 §7's thumbnails
  //     read as too small to actually see the food / interior; the
  //     bumped size makes photos feel like a real preview rather
  //     than icons.
  //   • Photo radius 12 → 14, gap 8 → 10 — pairs with the larger
  //     photo size and gives the carousel more breathing room.
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  scroll: {
    gap: 10,
    paddingBottom: 2,
  },
  photoItem: {
    width: 130,
    height: 96,
    borderRadius: 14,
    overflow: 'hidden',
  },
  photoImage: {
    width: 130,
    height: 96,
  },
})
