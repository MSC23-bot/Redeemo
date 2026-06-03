import React, { useEffect, useRef } from 'react'
import { View, Pressable, StyleSheet, useWindowDimensions, AccessibilityInfo } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Rect, Circle, Polyline, Path } from 'react-native-svg'
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, type SharedValue } from 'react-native-reanimated'
import { Text } from '@/design-system'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { haptics } from '@/design-system/haptics'
import { EXPLORE_ALL_SLUG } from '@/features/shared/categorySlug'

/**
 * Home category grid — the curated six top-level category cards (2 cols × 3
 * rows) plus the "Explore all categories" capsule that bridges into the full
 * /categories surface. Model A: the app draws the card surface, radial
 * gradient, designer icon and Mustica label; separate transparent 3D element
 * PNGs are overlaid with sub-pixel placement (see ElementCluster). Card press
 * routes to /category/[id]; the Explore capsule routes to /categories — both
 * via the onCategoryPress callback so the screen owns navigation.
 */

const H_PAD  = 18
const GAP    = 14
// Short cards (2.1:1) so the six tiles leave room below for the Explore capsule
// and let Featured merchants peek under the fold, while keeping space for the
// top-aligned icons above the 2-line label. Illustrations scale with card
// height automatically; the label size is fixed (14pt, up to 2 lines).
const ASPECT = 2.1

// ── Food & Drink (four elements + a custom icon ASSET) ─────────────────────
const FOOD_ICON = require('../../../../assets/category-icons/home/food-drink-icon.png')
const FOOD_ELEMENTS = [
  // Three elements, no overlaps, with subtle bleed: pizza top-left (bleeds top),
  // coffee top-right (bleeds right), plated dish along the bottom (bleeds bottom).
  // pizza slice — beside the coffee, nudged down a little
  { src: require('../../../../assets/category-illustrations/food-drink/pizza-slice.png'), ihf: 0.713, icx: 0.512, icy: 0.498, th: 0.46, px: 0.71, py: 0.31 },
  // coffee cup — top-right, unchanged, bleeds out the right a little
  { src: require('../../../../assets/category-illustrations/food-drink/coffee-cup.png'),  ihf: 0.760, icx: 0.499, icy: 0.480, th: 0.52, px: 0.91, py: 0.36 },
  // plated dish — BIGGER, wide along the bottom bridging under the pair (bleeds bottom)
  { src: require('../../../../assets/category-illustrations/food-drink/plated-dish.png'), ihf: 0.558, icx: 0.500, icy: 0.543, th: 0.48, px: 0.74, py: 0.85 },
]

// ── Beauty & Wellness icon ASSET (replaces the Lucide stand-in) ─────────────
const BEAUTY_ICON = require('../../../../assets/category-icons/home/beauty-wellness-icon.png')

// ── Beauty & Wellness (five independent element assets — the new approach) ──
// Per element: ihf/icx/icy are MEASURED facts of the 1254² asset (object height
// fraction + object-centre fraction, from sharp trim). th/px/py are the design
// knobs: th = object's on-card height ÷ card height; px/py = where to place the
// object's CENTRE, as a fraction of card w/h (may exceed 1 / go negative for a
// subtle bleed). Ordered back → front.
// NOTE: Metro needs STATIC literal require paths — do not refactor to a dynamic
// base-path template (it won't bundle).
const BEAUTY_ELEMENTS = [
  // Spa-stones dropped to declutter — four elements: mirror, brush, candle, lipstick.
  // vanity mirror — top-right (back)
  { src: require('../../../../assets/category-illustrations/beauty-wellness/vanity-mirror.png'), ihf: 0.716, icx: 0.504, icy: 0.474, th: 0.78, px: 0.90, py: 0.34 },
  // makeup brush — angled, top-centre
  { src: require('../../../../assets/category-illustrations/beauty-wellness/makeup-brush.png'),  ihf: 0.699, icx: 0.496, icy: 0.495, th: 0.70, px: 0.70, py: 0.30 },
  // candle — mid cluster
  { src: require('../../../../assets/category-illustrations/beauty-wellness/candle.png'),        ihf: 0.624, icx: 0.500, icy: 0.511, th: 0.50, px: 0.69, py: 0.62 },
  // lipstick — front, lower-right (fills where the stones were)
  { src: require('../../../../assets/category-illustrations/beauty-wellness/lipstick.png'),      ihf: 0.789, icx: 0.504, icy: 0.496, th: 0.54, px: 0.82, py: 0.66 },
]

type Element = (typeof BEAUTY_ELEMENTS)[number]

// ── Health & Fitness (three elements + a custom icon ASSET, not Lucide) ─────
const HEALTH_ICON = require('../../../../assets/category-icons/home/health-fitness-icon.png')
const HEALTH_ELEMENTS = [
  // water bottle — top-right, eased up + smaller so it sits behind the bigger mat (back)
  { src: require('../../../../assets/category-illustrations/health-fitness/water-bottle.png'), ihf: 0.720, icx: 0.520, icy: 0.490, th: 0.70, px: 0.93, py: 0.38 },
  // dumbbells — crossed pair, centre, in front of the bottle
  { src: require('../../../../assets/category-illustrations/health-fitness/dumbbells.png'),    ihf: 0.612, icx: 0.500, icy: 0.493, th: 0.55, px: 0.64, py: 0.42 },
  // yoga mat — rolled, BIGGER but bleed held the same (centre moved up/left as it grows)
  { src: require('../../../../assets/category-illustrations/health-fitness/yoga-mat.png'),     ihf: 0.521, icx: 0.507, icy: 0.500, th: 0.58, px: 0.83, py: 0.79 },
]

// ── Out & About (four elements + a custom icon ASSET, not Lucide) ───────────
const OUT_ICON = require('../../../../assets/category-icons/home/out-about-icon.png')
const OUT_ELEMENTS = [
  // Tree dropped to declutter — three elements: binoculars, compass, basket.
  // binoculars — top-right, subtle bleed past the right (back)
  { src: require('../../../../assets/category-illustrations/out-about/binoculars.png'),    ihf: 0.630, icx: 0.513, icy: 0.495, th: 0.50, px: 0.88, py: 0.30 },
  // compass — centre-left
  { src: require('../../../../assets/category-illustrations/out-about/compass.png'),       ihf: 0.713, icx: 0.494, icy: 0.483, th: 0.58, px: 0.62, py: 0.42 },
  // picnic basket — bottom-right, moved right into the space the tree left (front)
  { src: require('../../../../assets/category-illustrations/out-about/picnic-basket.png'), ihf: 0.596, icx: 0.506, icy: 0.478, th: 0.52, px: 0.82, py: 0.78 },
]

// ── Shopping (four elements + a custom icon ASSET; one-word label) ──────────
const SHOP_ICON = require('../../../../assets/category-icons/home/shopping-icon.png')
// Cardboard-parcel intentionally dropped (the cart already carries a box) to
// declutter — three elements: bags + cart + gift.
const SHOP_ELEMENTS = [
  // shopping bags — top-right, moved UP to detach from the gift (back)
  { src: require('../../../../assets/category-illustrations/shopping/shopping-bags.png'), ihf: 0.669, icx: 0.502, icy: 0.491, th: 0.50, px: 0.88, py: 0.29 },
  // shopping cart — centre hero, in front of the bags
  { src: require('../../../../assets/category-illustrations/shopping/shopping-cart.png'), ihf: 0.721, icx: 0.486, icy: 0.503, th: 0.74, px: 0.64, py: 0.50 },
  // gift box — bottom-right, moved DOWN so it no longer overlaps the bags (front)
  { src: require('../../../../assets/category-illustrations/shopping/gift-box.png'),      ihf: 0.658, icx: 0.498, icy: 0.492, th: 0.46, px: 0.89, py: 0.79 },
]

// ── Home & Local Services (five elements + a custom icon ASSET) ─────────────
const HOME_ICON = require('../../../../assets/category-icons/home/home-local-services-icon.png')
const HOME_ELEMENTS = [
  // Folded-cloth dropped (four elements). Grouped as a tidy still-life — wrench
  // the central hero, bucket + mop gathered top-right behind it, trowel front.
  // Tidy 2×2 pulled tighter so it reads as one group (small gaps, no overlap).
  // mop — top-LEFT, handle pokes out the top edge a little; dropped down toward
  // the group so it's less isolated
  { src: require('../../../../assets/category-illustrations/home-local-services/mop.png'),             ihf: 0.842, icx: 0.506, icy: 0.480, th: 0.54, px: 0.74, py: 0.16 },
  // cleaning bucket — top-RIGHT, nudged in toward the mop
  { src: require('../../../../assets/category-illustrations/home-local-services/cleaning-bucket.png'), ihf: 0.650, icx: 0.504, icy: 0.504, th: 0.50, px: 0.90, py: 0.34 },
  // wrench — bottom-LEFT, brought up toward the group
  { src: require('../../../../assets/category-illustrations/home-local-services/wrench.png'),          ihf: 0.666, icx: 0.477, icy: 0.481, th: 0.52, px: 0.70, py: 0.72 },
  // garden trowel — bottom-RIGHT, brought up + in toward the group
  { src: require('../../../../assets/category-illustrations/home-local-services/garden-trowel.png'),   ihf: 0.647, icx: 0.533, icy: 0.478, th: 0.50, px: 0.90, py: 0.80 },
]

/** Places independently-positioned 3D elements over a card (overflow: visible). */
function ElementCluster({ w, h, elements }: { w: number; h: number; elements: Element[] }) {
  return (
    <>
      {elements.map((e, i) => {
        const square = (e.th * h) / e.ihf // size the square so the object hits its target height
        const left = e.px * w - square * e.icx
        const top = e.py * h - square * e.icy
        return (
          <Image
            key={i}
            source={e.src}
            style={{ position: 'absolute', left, top, width: square, height: square }}
            contentFit="contain"
            pointerEvents="none"
          />
        )
      })}
    </>
  )
}

/**
 * Organic radial "glow" background — light pools from an off-centre point in the
 * upper area and fades out in curved isolines, rather than a straight vertical
 * or horizontal band. Same recipe across all six cards.
 */
function CardGradient({ w, h, light, deep, gid }: { w: number; h: number; light: string; deep: string; gid: string }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={gid} cx="70%" cy="16%" r="82%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="1" stopColor={deep} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={w} height={h} rx="20" ry="20" fill={`url(#${gid})`} />
    </Svg>
  )
}

function FoodCard({ w, h, onPress }: { w: number; h: number; onPress?: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Food & Drink category"
      style={[styles.tileWrap, { width: w, height: h }]}
    >
      <View style={[styles.cardBase, styles.foodShadow, styles.iconBottomText, { width: w, height: h }]}>
        <CardGradient w={w} h={h} light="#FF9159" deep="#D03E09" gid="grad-food" />
        <Image source={FOOD_ICON} style={styles.foodIcon} contentFit="contain" pointerEvents="none" />
        <Text style={styles.cardName}>Food &amp;{'\n'}Drink</Text>
      </View>
      <ElementCluster w={w} h={h} elements={FOOD_ELEMENTS} />
    </PressableScale>
  )
}

function BeautyCard({ w, h, onPress }: { w: number; h: number; onPress?: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Beauty & Wellness category"
      style={[styles.tileWrap, { width: w, height: h }]}
    >
      <View style={[styles.cardBase, styles.beautyShadow, styles.iconBottomText, { width: w, height: h }]}>
        <CardGradient w={w} h={h} light="#BFA9ED" deep="#8C6DCB" gid="grad-beauty" />
        <Image source={BEAUTY_ICON} style={styles.beautyIcon} contentFit="contain" pointerEvents="none" />
        <Text style={styles.cardName}>Beauty &amp;{'\n'}Wellness</Text>
      </View>
      <ElementCluster w={w} h={h} elements={BEAUTY_ELEMENTS} />
    </PressableScale>
  )
}

function HealthCard({ w, h, onPress }: { w: number; h: number; onPress?: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Health & Fitness category"
      style={[styles.tileWrap, { width: w, height: h }]}
    >
      <View style={[styles.cardBase, styles.healthShadow, styles.iconBottomText, { width: w, height: h }]}>
        <CardGradient w={w} h={h} light="#EB7364" deep="#C0392D" gid="grad-health" />
        {/* custom icon ASSET (not Lucide), anchored top-left */}
        <Image source={HEALTH_ICON} style={styles.healthIcon} contentFit="contain" pointerEvents="none" />
        <Text style={styles.cardName}>Health &amp;{'\n'}Fitness</Text>
      </View>
      <ElementCluster w={w} h={h} elements={HEALTH_ELEMENTS} />
    </PressableScale>
  )
}

function OutAboutCard({ w, h, onPress }: { w: number; h: number; onPress?: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Out & About category"
      style={[styles.tileWrap, { width: w, height: h }]}
    >
      <View style={[styles.cardBase, styles.outShadow, styles.iconBottomText, { width: w, height: h }]}>
        <CardGradient w={w} h={h} light="#81A7ED" deep="#4C74C8" gid="grad-out" />
        <Image source={OUT_ICON} style={styles.outIcon} contentFit="contain" pointerEvents="none" />
        <Text style={styles.cardName}>Out &amp;{'\n'}About</Text>
      </View>
      <ElementCluster w={w} h={h} elements={OUT_ELEMENTS} />
    </PressableScale>
  )
}

function ShoppingCard({ w, h, onPress }: { w: number; h: number; onPress?: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Shopping category"
      style={[styles.tileWrap, { width: w, height: h }]}
    >
      <View style={[styles.cardBase, styles.shopShadow, styles.iconBottomText, { width: w, height: h }]}>
        <CardGradient w={w} h={h} light="#F8C965" deep="#D89724" gid="grad-shopping" />
        <Image source={SHOP_ICON} style={styles.shoppingIcon} contentFit="contain" pointerEvents="none" />
        {/* one-word label — single line, unlike the two-word categories */}
        <Text style={styles.cardName}>Shopping</Text>
      </View>
      <ElementCluster w={w} h={h} elements={SHOP_ELEMENTS} />
    </PressableScale>
  )
}

function HomeServicesCard({ w, h, onPress }: { w: number; h: number; onPress?: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Home & Local Services category"
      style={[styles.tileWrap, { width: w, height: h }]}
    >
      <View style={[styles.cardBase, styles.homeShadow, styles.iconBottomText, { width: w, height: h }]}>
        <CardGradient w={w} h={h} light="#82D176" deep="#4CA442" gid="grad-home" />
        <Image source={HOME_ICON} style={styles.homeIcon} contentFit="contain" pointerEvents="none" />
        {/* long 3-word label — 2 lines (the reference's 3 lines won't fit the
            short card alongside the icon) */}
        <Text style={styles.cardName}>Home &amp; Local{'\n'}Services</Text>
      </View>
      <ElementCluster w={w} h={h} elements={HOME_ELEMENTS} />
    </PressableScale>
  )
}

// ── Explore all categories affordance ──────────────────────────────────────
// Compact ONE-ROW capsule: an overlapping stack of the REMAINING categories
// (the extras NOT already shown in the six Home cards above) that expand
// horizontally on tap to reveal each name, a calm title/subtitle, and a brand
// rose→coral arrow CTA (view all). Each extra category keeps its own hue but is
// rendered with the SAME radial-gradient recipe + tonal range (light → deep) as
// the six Home category cards, so the chips read as one family (owner direction
// 2026-06-03). Four have a real glyph (Travel / Auto / Pets / Health & Medical);
// Family & Kids still points at the unmapped-screenshot placeholder file, pending
// a designer-supplied glyph (icon-completeness follow-up). light/deep are
// APPROXIMATE pending a confirmed allocation.
const EXPLORE_CHIPS = [
  { key: 'travel',  label: 'Travel',  light: '#E6BC78', deep: '#9C7330', icon: require('../../../../assets/category-icons/all/travel-hotels-icon.png') as number | null },
  { key: 'family',  label: 'Family',  light: '#F2928C', deep: '#CB4B4B', icon: require('../../../../assets/category-icons/all/family-kids-icon.png') as number | null },
  { key: 'auto',    label: 'Auto',    light: '#6E9AD8', deep: '#2F5790', icon: require('../../../../assets/category-icons/all/auto-garage-icon.png') as number | null },
  { key: 'pets',    label: 'Pets',    light: '#77C98D', deep: '#3A8552', icon: require('../../../../assets/category-icons/all/pet-services-icon.png') as number | null },
  { key: 'medical', label: 'Medical', light: '#5FC6BE', deep: '#208079', icon: require('../../../../assets/category-icons/all/health-medical-icon.png') as number | null },
]

const EXPLORE_H = 74
const CHIP_CIRCLE = 34 // collapsed chip diameter
const CHIP_PILL = 96 // expanded chip width (icon + label)
const CHIP_OVERLAP = 18 // overlap when collapsed (stacked look)
const CHIP_SPREAD = 6 // gap that isolates the expanded chip from its neighbours
// One-time intro demo: on first mount each chip auto-opens in turn (travel →
// family → auto → pets → medical) so users learn the thumbnails are tappable,
// then the card settles to its static resting state. Reduce-motion skips it; a
// tap or scroll cancels it and hands control back to the user.
// The intro fires 1s AFTER the page finishes loading (driven by the `ready`
// prop), not on a blind timer from mount — a mount timer raced the loading
// skeleton, so the demo played under it and was never seen.
const DEMO_START = 1000 // delay after the page is ready, before the demo begins
const DEMO_HOLD = 1000 // how long each chip stays open before the next

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** Brand rose→coral chevron CTA (view-all affordance). */
function ExploreCta() {
  return (
    <Svg width={44} height={44}>
      <Defs>
        <LinearGradient id="explore-cta" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E20C04" />
          <Stop offset="1" stopColor="#E84A00" />
        </LinearGradient>
      </Defs>
      <Circle cx="22" cy="22" r="22" fill="url(#explore-cta)" />
      <Polyline points="19,14 27,22 19,30" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/**
 * Chip background — the SAME organic radial recipe as <CardGradient> (light
 * pools upper-right, fades to deep lower-left), sized to the EXPANDED pill and
 * pinned top-left so it reads consistently whether the chip is collapsed
 * (overflow clips it to the circle) or open. White icon sits on the deeper
 * area, exactly like the six category cards.
 */
function ChipGradient({ light, deep, gid }: { light: string; deep: string; gid: string }) {
  return (
    <Svg width={CHIP_PILL} height={CHIP_CIRCLE} style={styles.exChipGradient} pointerEvents="none">
      <Defs>
        <RadialGradient id={gid} cx="70%" cy="16%" r="82%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="1" stopColor={deep} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={CHIP_PILL} height={CHIP_CIRCLE} fill={`url(#${gid})`} />
    </Svg>
  )
}

/** One chip: a circle that expands horizontally into an icon+label pill on tap. */
function ExploreChip({
  index,
  item,
  active,
  onToggle,
}: {
  index: number
  item: (typeof EXPLORE_CHIPS)[number]
  active: SharedValue<number>
  onToggle: (i: number) => void
}) {
  const chipStyle = useAnimatedStyle(() => {
    const isActive = active.value === index
    // gap before the active chip AND before the chip just after it, so the
    // expanded pill (icon + label) is never covered by a neighbour; otherwise overlap.
    const spread = active.value === index || active.value === index - 1
    return {
      width: withTiming(isActive ? CHIP_PILL : CHIP_CIRCLE, { duration: 260 }),
      marginLeft: index === 0 ? 0 : withTiming(spread ? CHIP_SPREAD : -CHIP_OVERLAP, { duration: 260 }),
      zIndex: isActive ? 99 : EXPLORE_CHIPS.length - index,
    }
  })
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(active.value === index ? 1 : 0, { duration: 160 }),
  }))
  return (
    <AnimatedPressable
      onPress={() => onToggle(index)}
      accessibilityRole="button"
      accessibilityLabel={`Preview ${item.label} category`}
      style={[styles.exChip, chipStyle]}
    >
      <ChipGradient light={item.light} deep={item.deep} gid={`grad-chip-${item.key}`} />
      <View style={styles.exChipIconWrap}>
        {item.icon ? (
          <Image source={item.icon} style={styles.exChipImg} contentFit="contain" pointerEvents="none" />
        ) : (
          // Defensive placeholder cross if a chip's icon is ever null. None are
          // today: Health & Medical has a real glyph, and Family & Kids points at
          // the (non-null) unmapped-screenshot placeholder file — so this branch
          // is currently unreached.
          <Svg width={20} height={20}>
            <Path d="M10 4 L10 16 M4 10 L16 10" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
          </Svg>
        )}
      </View>
      <Animated.Text style={[styles.exChipLabel, labelStyle]} numberOfLines={1}>
        {item.label}
      </Animated.Text>
    </AnimatedPressable>
  )
}

function ExploreCategoriesCard({ w, onPress, collapseSignal, demoToken }: { w: number; onPress?: () => void; collapseSignal?: SharedValue<number> | undefined; demoToken?: number | undefined }) {
  const active = useSharedValue(-1)
  // 1 while the intro demo is auto-playing, so the scroll-collapse reaction
  // leaves the demo alone (only user-opened chips collapse on scroll).
  const demoActive = useSharedValue(0)
  // Cross-fade the copy: the idle two-line block fades out and a compact two-line
  // "Explore categories" fades in while a chip is open, so the copy always fits
  // beside the expanded thumbnail without shrinking.
  const idleCopyStyle = useAnimatedStyle(() => ({ opacity: withTiming(active.value >= 0 ? 0 : 1, { duration: 180 }) }))
  const openCopyStyle = useAnimatedStyle(() => ({ opacity: withTiming(active.value >= 0 ? 1 : 0, { duration: 180 }) }))

  // Intro-demo cancellation. Per-RUN (local `cancelled`), not a single shared
  // ref — React 18 strict mode runs mount→cleanup→mount in dev, and a shared
  // ref set by the first cleanup would permanently cancel the demo before it
  // started. `demoCancel` points at the LIVE run so a tap / scroll can stop it.
  const demoCancel = useRef<(() => void) | null>(null)
  const stopDemo = () => { demoCancel.current?.() }

  const toggle = (i: number) => {
    stopDemo() // a tap takes over from the intro demo
    haptics.selection()
    active.value = active.value === i ? -1 : i
  }
  // Tapping the card background (not a chip) collapses an open chip; otherwise view-all.
  const handlePress = () => {
    stopDemo()
    if (active.value >= 0) {
      haptics.selection()
      active.value = -1
    } else {
      haptics.touch.light()
      onPress?.()
    }
  }

  // Intro demo — fires DEMO_START (1s) after `demoToken` changes (the first
  // load completed, or a pull-to-refresh finished), so it plays on first load
  // AND replays on every refresh. Reduce-motion skips it; a tap cancels it.
  useEffect(() => {
    if (!demoToken) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    demoCancel.current = () => { cancelled = true; demoActive.value = 0; if (timer) { clearTimeout(timer); timer = null } }
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return
      const run = (step: number) => {
        if (cancelled) return
        if (step < EXPLORE_CHIPS.length) {
          demoActive.value = 1
          active.value = step
          timer = setTimeout(() => run(step + 1), DEMO_HOLD)
        } else {
          active.value = -1 // collapse → static resting state; tap still expands
          demoActive.value = 0
        }
      }
      timer = setTimeout(() => run(0), DEMO_START)
    })
    return () => { cancelled = true; demoActive.value = 0; if (timer) clearTimeout(timer) }
  }, [demoToken, active, demoActive])

  // Collapse an open chip when the page is scrolled — but never while the intro
  // demo is playing (a stray scroll must not fight it, only a tap stops it).
  useAnimatedReaction(
    () => (collapseSignal ? collapseSignal.value : 0),
    (cur, prev) => {
      if (prev !== null && cur !== prev && active.value >= 0 && demoActive.value === 0) active.value = -1
    },
  )
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Explore all categories. Browse merchants by category."
      style={[styles.exploreCard, { width: w }]}
    >
      {/* warm-neutral base + subtle brand-tinted radial accent */}
      <Svg width={w} height={EXPLORE_H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="explore-accent" cx="92%" cy="0%" r="95%">
            <Stop offset="0" stopColor="#FBE3DB" />
            <Stop offset="1" stopColor="#FFF7F1" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={w} height={EXPLORE_H} rx="22" ry="22" fill="url(#explore-accent)" />
      </Svg>

      <View style={styles.exploreRow}>
        <View style={styles.exChipsRow}>
          {EXPLORE_CHIPS.map((item, i) => (
            <ExploreChip key={item.key} index={i} item={item} active={active} onToggle={toggle} />
          ))}
        </View>
        <View style={styles.exploreTextCol} pointerEvents="none">
          {/* Idle: the full two-line copy. Fades out while a chip is open. */}
          <Animated.View style={idleCopyStyle}>
            <Text style={styles.exploreTitle} numberOfLines={1}>Explore all categories</Text>
            <Text style={styles.exploreSubtitle} numberOfLines={1}>Browse merchants by category</Text>
          </Animated.View>
          {/* While a chip is open: a compact two-line "Explore categories" that
              fits the tighter space without shrinking. Overlaid + cross-faded. */}
          <Animated.View style={[styles.exploreOpenCopy, openCopyStyle]}>
            <Text style={styles.exploreTitleCompact} numberOfLines={2}>Explore all{'\n'}categories</Text>
          </Animated.View>
        </View>
        <ExploreCta />
      </View>
    </Pressable>
  )
}

export function HomeCategoryGrid({ onCategoryPress, collapseSignal, demoToken }: { onCategoryPress?: (slug: string) => void; collapseSignal?: SharedValue<number>; demoToken?: number }) {
  const { width } = useWindowDimensions()
  const tileW = (width - H_PAD * 2 - GAP) / 2
  const tileH = tileW / ASPECT
  // Curated cards emit a CANONICAL SLUG (matching categorySlug(backendName)),
  // not a display name, so HomeScreen maps them to a backend Category by slug.
  return (
    <View>
      <View style={[styles.grid, { paddingHorizontal: H_PAD, gap: GAP }]}>
        <FoodCard w={tileW} h={tileH} onPress={() => onCategoryPress?.('food-drink')} />
        <BeautyCard w={tileW} h={tileH} onPress={() => onCategoryPress?.('beauty-wellness')} />
        <HealthCard w={tileW} h={tileH} onPress={() => onCategoryPress?.('health-fitness')} />
        <OutAboutCard w={tileW} h={tileH} onPress={() => onCategoryPress?.('out-about')} />
        <ShoppingCard w={tileW} h={tileH} onPress={() => onCategoryPress?.('shopping')} />
        <HomeServicesCard w={tileW} h={tileH} onPress={() => onCategoryPress?.('home-local-services')} />
      </View>
      {/* Explore all categories — bridge into the full category surface */}
      <View style={{ paddingHorizontal: H_PAD, marginTop: 16 }}>
        <ExploreCategoriesCard w={width - H_PAD * 2} collapseSignal={collapseSignal} demoToken={demoToken} onPress={() => onCategoryPress?.(EXPLORE_ALL_SLUG)} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // ── Explore all categories affordance ──
  exploreCard: {
    height: EXPLORE_H,
    borderRadius: 22,
    backgroundColor: '#FFF7F1',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(1,12,53,0.06)',
    // softer than the category cards — it's a calm destination, not a competitor
    shadowColor: '#010C35',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    justifyContent: 'center', // vertically centre the single content row
  },
  exploreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  exChipsRow: { flexDirection: 'row', alignItems: 'center' },
  exChip: {
    height: CHIP_CIRCLE,
    borderRadius: CHIP_CIRCLE / 2,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  // Radial gradient fill, pinned top-left at the expanded-pill width; the chip's
  // overflow:hidden clips it to the current (animating) width.
  exChipGradient: { position: 'absolute', left: 0, top: 0 },
  exChipIconWrap: { width: CHIP_CIRCLE - 4, height: CHIP_CIRCLE - 4, alignItems: 'center', justifyContent: 'center' },
  exChipImg: { width: 44, height: 44 },
  exChipLabel: { color: '#FFFFFF', fontSize: 13, fontFamily: 'MusticaPro-Semibold', marginRight: 10, letterSpacing: -0.1 },
  exploreTextCol: { flex: 1, paddingHorizontal: 8 },
  exploreTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'MusticaPro-Semibold',
    color: '#010C35',
    letterSpacing: -0.2,
  },
  exploreSubtitle: { fontSize: 12, lineHeight: 15, color: '#4B5563', marginTop: 1 },
  // While a chip is open: a compact two-line "Explore all / categories",
  // cross-faded over the idle copy, vertically centred and pushed toward the
  // red CTA (owner: move it closer to the button).
  exploreOpenCopy: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 8 },
  exploreTitleCompact: { fontSize: 14, lineHeight: 17, fontFamily: 'MusticaPro-Semibold', color: '#010C35', letterSpacing: -0.2, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'visible' },
  tileWrap: { overflow: 'visible' },
  cardBase: {
    borderRadius: 20,
    padding: 12,
    // icon pinned top-left, name pinned bottom-left
    justifyContent: 'space-between',
    // stronger soft float so the whole card lifts off the page (3D feel)
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  foodShadow: { shadowColor: '#7A1E00' },
  beautyShadow: { shadowColor: '#3D2A6B' },
  healthShadow: { shadowColor: '#6B1E14' },
  outShadow: { shadowColor: '#1E3A6B' },
  shopShadow: { shadowColor: '#7A5410' },
  homeShadow: { shadowColor: '#1E5418' },
  iconBottomText: { justifyContent: 'flex-end' },
  // Per-icon boxes — a uniform ~20pt glyph aligned top-left to (12,12) to match
  // the text's left + top padding. Box sizes differ because each glyph has its
  // own padding/aspect inside the 1845² square (computed from measured glyph boxes).
  // food / beauty / out are lighter-weight glyphs — bumped ~10% bigger so they
  // read consistently with the other three (still aligned top-left to ~12,12).
  foodIcon:     { position: 'absolute', left: -5, top: -5, width: 54, height: 54 },
  beautyIcon:   { position: 'absolute', left: -3, top: -3, width: 52, height: 52 },
  healthIcon:   { position: 'absolute', left: -5, top: -6, width: 56, height: 56 },
  outIcon:      { position: 'absolute', left: -3, top: -5, width: 55, height: 55 },
  shoppingIcon: { position: 'absolute', left: -2, top: -3, width: 49, height: 49 },
  homeIcon:     { position: 'absolute', left: -3, top: -3, width: 50, height: 50 },
  cardName: {
    // matches the placeholder cards' label style/size; 2 lines via the \n above
    fontSize: 14,
    lineHeight: 16,
    fontFamily: 'MusticaPro-Semibold',
    color: '#FFFFFF',
    letterSpacing: -0.1,
    maxWidth: '62%',
  },
})
