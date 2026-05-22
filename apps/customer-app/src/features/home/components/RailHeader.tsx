import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'

type RailMeta = {
  locality:      { id: string; name: string } | null
  scope:         'nearby' | 'city' | 'platform'
  scopeExpanded: boolean
}

export interface RailHeaderProps {
  fixedCopy?:    string
  meta:          RailMeta | null
  fallbackCopy?: string
  subtitle?:     string
  railKind?:     'featured' | 'trending' | 'popular' | 'nearbyByCategory'
  categoryName?: string
}

export function RailHeader({ fixedCopy, meta, fallbackCopy, subtitle, railKind, categoryName }: RailHeaderProps) {
  const title = (() => {
    if (fixedCopy) return fixedCopy
    if (!meta) return fallbackCopy ?? ''
    if (railKind === 'featured') {
      if (meta.scopeExpanded) return 'Featured on Redeemo'
      if (meta.locality)      return `Featured in ${meta.locality.name}`
      return 'Featured near you'
    }
    if (railKind === 'nearbyByCategory' && categoryName) {
      return `${categoryName} near you`
    }
    return fallbackCopy ?? ''
  })()

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row:      { paddingHorizontal: 18, paddingTop: 12 },
  title:    { fontSize: 20, fontFamily: 'MusticaPro-Semibold', color: '#010C35' },
  subtitle: { fontSize: 13, fontFamily: 'Lato-Regular',         color: '#6B7280', marginTop: 2 },
})
