import React from 'react'
import { View, StyleSheet, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

// §Savings impeccable 6/6 2026-05-17 — hero chrome accepts a tone.
//
// `tone='brand'` (default) — original 5-stop brand-rose gradient
//   used for the State-1 free-user conversion hero where brand-rose
//   IS the call to action.
//
// `tone='cream'` — cream identity-zone gradient (FFF9F5 → FCF0E5)
//   per DESIGN.md Cream-for-Identity Rule.  Used for subscriber
//   states (empty + populated) where the savings amount is product
//   narrative, not a conversion punch.  Drops the dark vignette —
//   cream is light; depth comes from the navy type, not overlays.
//
// One component, two tones — keeps the silhouette logic in one place
// and avoids fork-and-drift between BrandHero and CreamHero shells.

type Tone = 'brand' | 'cream'

export function SavingsHeroGradient({
  children,
  style,
  tone = 'brand',
}: {
  children: React.ReactNode
  style?: ViewStyle | ViewStyle[]
  tone?: Tone
}) {
  if (tone === 'cream') {
    return (
      <View style={style}>
        <LinearGradient
          colors={['#FFF9F5', '#FCF0E5']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    )
  }

  return (
    <View style={style}>
      <LinearGradient
        colors={['#B80E08', '#D10A03', '#E20C04', '#CC3500', '#C83200']}
        locations={[0, 0.28, 0.52, 0.78, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'transparent', 'rgba(0,0,0,0.2)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  )
}
