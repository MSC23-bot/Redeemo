import React from 'react'
import { View, FlatList, StyleSheet, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
import { Text, PressableScale, color, spacing } from '@/design-system'
import { FadeIn, FadeInDown } from '@/design-system/motion/FadeIn'
import { useCategories } from '@/hooks/useCategories'
import { Category } from '@/lib/api/discovery'

// ── Card-base + icon assets, keyed by category slug ─────────────────────────
// Designer-supplied card-base PNGs (gradient + 3D + soft shadow baked, 1200×414,
// 2.8986:1, transparent L/R margin) and the white glyph icons. Rendered as-is —
// the background/gradient/3D are NOT recreated in code.
const CARD_BASES: Record<string, number> = {
  'food-drink': require('../../../../assets/category-card-bases/view-all/food-drink-card-base.png'),
  'beauty-wellness': require('../../../../assets/category-card-bases/view-all/beauty-wellness-card-base.png'),
  'health-fitness': require('../../../../assets/category-card-bases/view-all/health-fitness-card-base.png'),
  'out-about': require('../../../../assets/category-card-bases/view-all/out-about-card-base.png'),
  'shopping': require('../../../../assets/category-card-bases/view-all/shopping-card-base.png'),
  'home-local-services': require('../../../../assets/category-card-bases/view-all/home-local-services-card-base.png'),
  'travel-hotels': require('../../../../assets/category-card-bases/view-all/travel-hotels-card-base.png'),
  'health-medical': require('../../../../assets/category-card-bases/view-all/health-medical-card-base.png'),
  'family-kids': require('../../../../assets/category-card-bases/view-all/family-kids-card-base.png'),
  'auto-garage': require('../../../../assets/category-card-bases/view-all/auto-garage-card-base.png'),
  'pet-services': require('../../../../assets/category-card-bases/view-all/pet-services-card-base.png'),
}
// All 11 categories now have a confirmed glyph (padded originals in `all/`).
const CAT_ICONS: Record<string, number | null> = {
  'food-drink': require('../../../../assets/category-icons/all/food-drink-icon.png'),
  'beauty-wellness': require('../../../../assets/category-icons/all/beauty-wellness-icon.png'),
  'health-fitness': require('../../../../assets/category-icons/all/health-fitness-icon.png'),
  'out-about': require('../../../../assets/category-icons/all/out-about-icon.png'),
  'shopping': require('../../../../assets/category-icons/all/shopping-icon.png'),
  'home-local-services': require('../../../../assets/category-icons/all/home-local-services-icon.png'),
  'travel-hotels': require('../../../../assets/category-icons/all/travel-hotels-icon.png'),
  'health-medical': require('../../../../assets/category-icons/all/health-medical-icon.png'),
  'family-kids': require('../../../../assets/category-icons/all/family-kids-icon.png'),
  'auto-garage': require('../../../../assets/category-icons/all/auto-garage-icon.png'),
  'pet-services': require('../../../../assets/category-icons/all/pet-services-icon.png'),
}

// "Food & Drink" → "food-drink", "Home & Local Services" → "home-local-services"
const toSlug = (name: string) =>
  name.toLowerCase().replace(/ & /g, ' ').trim().replace(/\s+/g, '-')

const CARD_ASPECT = 1200 / 414 // 2.8986
const CORE_INSET = 26 / 1200 // transparent L/R margin fraction (soft shadow)

function PlaceholderCross({ size }: { size: number }) {
  const c = size / 2
  return (
    <Svg width={size} height={size}>
      <Path
        d={`M${c} ${size * 0.24} V${size * 0.76} M${size * 0.24} ${c} H${size * 0.76}`}
        stroke="#FFFFFF"
        strokeWidth={size * 0.11}
        strokeLinecap="round"
      />
    </Svg>
  )
}

// /categories is a tab screen WITH the tab bar visible → clear it at the bottom.
const TAB_BAR_HEIGHT = 80
const SCROLL_BOTTOM_GUTTER = 24

// Entrance choreography: cascade only the first screenful of rows. Rows beyond
// it mount lazily on scroll — staggering those by absolute index would leave a
// visible blank row while it waits out the delay, so they enter immediately.
const STAGGER_VISIBLE = 6
const STAGGER_STEP = 45 // ms between cascading rows

export function AllCategoriesScreen() {
  const router = useRouter()
  const { width: screenW } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useCategories()

  // Supply-aware rule (already agreed): top-level categories only; HIDDEN
  // filtering is deliberately out-of-scope (locked 2026-05-21 — see discovery.ts).
  const topLevel: Category[] = (data?.categories ?? []).filter((c) => c.parentId === null)

  const cardW = screenW - 16 // 8pt list padding each side; image holds its own shadow margin
  const cardH = cardW / CARD_ASPECT
  const overlayLeft = cardW * CORE_INSET + 16 // inside the card core's left edge

  return (
    <View style={styles.container}>
      <FadeIn>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} hapticStyle="light">
            <View style={styles.backButton}>
              <ArrowLeft size={20} color={color.navy} />
            </View>
          </PressableScale>
          <Text variant="heading.md" style={styles.title}>
            All Categories
          </Text>
        </View>
      </FadeIn>

      <FlatList
        data={topLevel}
        keyExtractor={(item) => item.id}
        initialNumToRender={STAGGER_VISIBLE + 1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + SCROLL_BOTTOM_GUTTER },
        ]}
        renderItem={({ item, index }) => {
          const slug = toSlug(item.name)
          const cardBase = CARD_BASES[slug]
          const icon = CAT_ICONS[slug]
          return (
            <FadeInDown delay={index < STAGGER_VISIBLE ? index * STAGGER_STEP : 0}>
              <PressableScale
                onPress={() => router.push(`/category/${item.id}` as any)}
                hapticStyle="light"
                accessibilityRole="button"
                accessibilityLabel={`${item.name} category`}
                style={styles.rowWrap}
              >
                {cardBase ? (
                  <View style={{ width: cardW, height: cardH }}>
                    {/* designer card base — rendered as-is, no clipping (preserves shadow + 3D bleed) */}
                    <Image source={cardBase} style={{ width: cardW, height: cardH }} contentFit="contain" pointerEvents="none" />
                    <View style={[styles.overlay, { left: overlayLeft, maxWidth: cardW * 0.56 }]}>
                      <View style={styles.iconWrap}>
                        {icon ? (
                          <Image source={icon} style={styles.catIcon} contentFit="contain" pointerEvents="none" />
                        ) : (
                          <PlaceholderCross size={40} />
                        )}
                      </View>
                      <Text variant="display.sm" style={styles.catLabel} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </View>
                  </View>
                ) : (
                  // Fallback for any category without a supplied card base (asset mismatch).
                  <View style={[styles.fallback, { width: cardW, height: cardH, backgroundColor: item.pinColour ?? color.brandRose }]}>
                    <Text variant="display.sm" style={styles.catLabel} numberOfLines={2}>
                      {item.name}
                    </Text>
                  </View>
                )}
              </PressableScale>
            </FadeInDown>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 18,
    gap: spacing[3],
    paddingBottom: spacing[3],
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.surface.neutral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: color.navy },
  listContent: { paddingHorizontal: 8, paddingBottom: spacing[8] },
  rowWrap: { marginBottom: 6 },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  catIcon: { width: 80, height: 80 },
  catLabel: {
    marginLeft: 12,
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 21,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  fallback: {
    borderRadius: 20,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
})
