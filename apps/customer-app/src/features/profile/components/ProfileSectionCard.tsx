import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  title: string
  children: React.ReactNode
  style?: object
}

export function ProfileSectionCard({ title, children, style }: Props) {
  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper:      { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: 'rgba(1,12,53,0.5)',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
})
