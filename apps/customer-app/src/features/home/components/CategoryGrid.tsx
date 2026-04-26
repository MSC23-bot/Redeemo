import React from 'react'
import { View, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg'
import { Text } from '@/design-system/Text'
import { type Category } from '@/lib/api/discovery'

type Props = {
  categories: Category[]
  onCategoryPress: (id: string) => void
  onMorePress: () => void
}

// Preset palette for categories — used when pinColour is null
const PALETTE: Array<[number, number, number]> = [
  [220, 38, 38],   // red
  [190, 24, 93],   // pink
  [4, 120, 87],    // green
  [29, 78, 216],   // blue
  [180, 83, 9],    // amber
]
const MORE_RGB: [number, number, number] = [109, 40, 217] // purple

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m || !m[1] || !m[2] || !m[3]) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function getRgb(category: Category, index: number): [number, number, number] {
  if (category.pinColour) {
    const rgb = hexToRgb(category.pinColour)
    if (rgb) return rgb
  }
  return PALETTE[index % PALETTE.length] ?? PALETTE[0]!
}

// ── Inline SVG icons (matching brainstorm HTML exactly) ────────────────────────

function FoodIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <Path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <Line x1="6" y1="1" x2="6" y2="4" />
      <Line x1="10" y1="1" x2="10" y2="4" />
      <Line x1="14" y1="1" x2="14" y2="4" />
    </Svg>
  )
}

function BeautyIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2z" />
      <Path d="M9 3v1a3 3 0 0 0 6 0V3" />
      <Path d="M12 6c-4 0-6 3-6 7 0 2 1 4 2 5h8c1-1 2-3 2-5 0-4-2-7-6-7z" />
    </Svg>
  )
}

function FitnessIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M6.5 6.5h11" />
      <Path d="M17.5 6.5V4.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1" />
      <Path d="M6.5 6.5V4.5a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1" />
      <Path d="M17.5 17.5h-11" />
      <Path d="M6.5 17.5V19.5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1" />
      <Path d="M17.5 17.5V19.5a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1" />
    </Svg>
  )
}

function ShoppingIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Line x1="3" y1="6" x2="21" y2="6" />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </Svg>
  )
}

function EntertainmentIcon({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round">
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="10 8 16 12 10 16 10 8" />
    </Svg>
  )
}

function DefaultLetterIcon({ c, letter }: { c: string; letter: string }) {
  return <Text style={{ fontSize: 13, fontFamily: 'Lato-Bold', color: c }}>{letter}</Text>
}

function MoreDotsIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth={2} strokeLinecap="round">
      <Circle cx="5" cy="12" r="1.5" />
      <Circle cx="12" cy="12" r="1.5" />
      <Circle cx="19" cy="12" r="1.5" />
    </Svg>
  )
}

function categoryIcon(name: string, color: string) {
  const n = name.toLowerCase()
  if (n.includes('food') || n.includes('drink') || n.includes('restaurant') || n.includes('cafe') || n.includes('coffee') || n.includes('dining')) return <FoodIcon c={color} />
  if (n.includes('beauty') || n.includes('salon') || n.includes('hair') || n.includes('spa') || n.includes('wellness')) return <BeautyIcon c={color} />
  if (n.includes('fitness') || n.includes('gym') || n.includes('sport') || n.includes('health') || n.includes('active')) return <FitnessIcon c={color} />
  if (n.includes('shopping') || n.includes('retail') || n.includes('store') || n.includes('fashion')) return <ShoppingIcon c={color} />
  if (n.includes('entertainment') || n.includes('cinema') || n.includes('leisure') || n.includes('activity') || n.includes('fun')) return <EntertainmentIcon c={color} />
  return <DefaultLetterIcon c={color} letter={name.charAt(0).toUpperCase()} />
}

export function CategoryGrid({ categories, onCategoryPress, onMorePress }: Props) {
  const { width: screenWidth } = useWindowDimensions()
  const H_PAD = 18
  const GAP = 8
  const tileWidth = (screenWidth - H_PAD * 2 - GAP * 2) / 3

  const topLevel = categories.filter((c) => c.parentId === null).slice(0, 5)

  return (
    <View style={[styles.container, { paddingHorizontal: H_PAD }]}>
      <View style={[styles.grid, { gap: GAP }]}>
        {topLevel.map((category, index) => {
          const [r, g, b] = getRgb(category, index)
          const iconColor = `rgb(${r},${g},${b})`
          const gradStart = `rgba(${r},${g},${b},0.28)` as const
          const gradMid   = `rgba(${r},${g},${b},0.18)` as const
          const gradEnd   = `rgba(${r},${g},${b},0.12)` as const
          const iconBg    = `rgba(${r},${g},${b},0.15)`

          return (
            <Animated.View
              key={category.id}
              entering={FadeInDown.delay(index * 40).springify()}
              style={{ width: tileWidth }}
            >
              <TouchableOpacity
                onPress={() => onCategoryPress(category.id)}
                activeOpacity={0.8}
                accessibilityLabel={`${category.name} category`}
              >
                <LinearGradient
                  colors={[gradStart, gradMid, gradEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.card}
                >
                  <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
                    {categoryIcon(category.name, iconColor)}
                  </View>
                  <Text style={styles.label} numberOfLines={2}>{category.name}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )
        })}

        {/* More tile */}
        <Animated.View
          entering={FadeInDown.delay(topLevel.length * 40).springify()}
          style={{ width: tileWidth }}
        >
          <TouchableOpacity
            onPress={onMorePress}
            activeOpacity={0.8}
            accessibilityLabel="More categories"
          >
            <LinearGradient
              colors={['rgba(109,40,217,0.22)', 'rgba(139,92,246,0.14)', 'rgba(196,181,253,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <View style={[styles.iconBox, { backgroundColor: 'rgba(109,40,217,0.10)' }]}>
                <MoreDotsIcon />
              </View>
              <Text style={[styles.label, { color: '#6D28D9' }]}>More</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    paddingBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  label: {
    fontSize: 9,
    fontFamily: 'Lato-Bold',
    color: '#010C35',
    textAlign: 'center',
    lineHeight: 12,
  },
})
