import React, { useRef, useState } from 'react'
import { View, Pressable, ActivityIndicator, ScrollView, StyleSheet, Alert } from 'react-native'
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, Button, layout, spacing, radius, color } from '@/design-system'
import {
  ChevronRight,
  ShieldCheck,
  Check,
  Tag,
  MapPin,
  Sparkles,
  Zap,
  RefreshCw,
  BarChart2,
  Gift,
  Receipt,
  Percent,
  Star,
  ShoppingBag,
  Clock,
} from '@/design-system/icons'
import { scale, ms } from '@/design-system/scale'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'

// ─── data ─────────────────────────────────────────────────────────────────────

type FeatureItem = { label: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }> }

const FEATURES: FeatureItem[] = [
  { label: 'Exclusive deals & two-for-one offers at local spots', Icon: Tag },
  { label: 'Discover local gyms, cafés, restaurants & hidden gems', Icon: MapPin },
  { label: 'Save on food, beauty, fitness & more near you', Icon: Sparkles },
  { label: 'Personalised recommendations based on your interests', Icon: Zap },
  { label: 'Fresh vouchers every month, automatically renewed', Icon: RefreshCw },
  { label: 'Savings tracker & full redemption history', Icon: BarChart2 },
]

type VoucherType = {
  label: string
  desc:  string
  Icon:  React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
  bg:    string
  ic:    string
}

const VOUCHER_TYPES: VoucherType[] = [
  { label: 'Buy One\nGet One', desc: 'Get a second\nitem free',          Icon: Gift,        bg: '#FFF0F0', ic: '#E20C04' },
  { label: 'Spend\n& Save',   desc: 'Unlock discounts\nwhen you spend', Icon: Receipt,     bg: '#EFF6FF', ic: '#2563EB' },
  { label: 'Discount',        desc: 'Fixed £ or %\noff your bill',      Icon: Percent,     bg: '#FFFBEB', ic: '#D97706' },
  { label: 'Freebie',         desc: 'Claim a free\ngift or item',       Icon: Star,        bg: '#F5F3FF', ic: '#7C3AED' },
  { label: 'Bundle\nDeal',    desc: 'Multi-item deals\nat one price',    Icon: ShoppingBag, bg: '#F0FDFA', ic: '#0D9488' },
  { label: 'Limited\nTime',   desc: 'Flash offers\nfor a short time',   Icon: Clock,       bg: '#FFF7ED', ic: '#EA580C' },
  { label: 'Monthly\nReuse',  desc: 'Use it again\nevery month',        Icon: RefreshCw,   bg: '#F0FDF4', ic: '#16A34A' },
]

type Plan = 'annual' | 'monthly'

// ─── voucher strip constants ──────────────────────────────────────────────────

const CHIP_W = scale(88)

// ─── voucher strip — user-controlled horizontal scroll ────────────────────────

function VoucherStrip() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.voucherChips}
      accessibilityLabel="Voucher types — swipe to browse"
    >
      {VOUCHER_TYPES.map(({ label, desc, Icon, bg, ic }, i) => (
        <View key={i} style={[s.voucherChip, { backgroundColor: bg }]}>
          <Icon size={scale(18)} color={ic} strokeWidth={1.8} />
          <Text style={[s.voucherChipName, { color: ic }]}>{label}</Text>
          <Text style={s.voucherChipDesc}>{desc}</Text>
        </View>
      ))}
    </ScrollView>
  )
}

// ─── plan card ────────────────────────────────────────────────────────────────

type PlanCardProps = {
  plan:     Plan
  selected: boolean
  onPress:  () => void
}

function PlanCard({ plan, selected, onPress }: PlanCardProps) {
  const scaleAnim = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleAnim.value }] }))

  const isAnnual        = plan === 'annual'
  const activeTextColor = isAnnual ? '#92400E' : '#0F5E3A'
  const accentColor     = isAnnual ? '#D97706' : '#059669'

  return (
    <Animated.View style={[s.cardWrap, animStyle]}>
      {isAnnual && (
        <View style={s.bestValueBadge}>
          <Text style={s.bestValueText}>BEST VALUE</Text>
        </View>
      )}

      <Pressable
        onPress={onPress}
        onPressIn={() => { scaleAnim.value = withSpring(0.97, { damping: 22, stiffness: 320 }) }}
        onPressOut={() => { scaleAnim.value = withSpring(1,    { damping: 16, stiffness: 260 }) }}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={isAnnual ? 'Annual plan, £69.99 per year, 2 months free' : 'Monthly plan, £6.99 per month, cancel anytime'}
        style={[
          s.card,
          isAnnual ? (selected ? s.annualSelected : s.annualUnselected)
                   : (selected ? s.monthlySelected : s.monthlyUnselected),
        ]}
      >
        <View style={s.cardRow}>
          <View style={s.cardLeft}>
            <View style={[s.radio, selected && s.radioSelected]}>
              {selected && <View style={s.radioDot} />}
            </View>
            <View style={s.cardLabels}>
              <Text style={[s.planName, selected && { color: activeTextColor }]}>
                {isAnnual ? 'Annual' : 'Monthly'}
              </Text>
              <Text style={s.planTagline}>
                {isAnnual ? '2 months free' : 'No commitment · cancel anytime'}
              </Text>
              <View style={s.planAccessRow}>
                <Check size={scale(12)} color={accentColor} strokeWidth={2.6} />
                <Text style={s.planAccessText}>
                  Every voucher, from every merchant on Redeemo
                </Text>
              </View>
              {isAnnual && selected && (
                <View style={s.savingsPill}>
                  <Text style={s.savingsText}>SAVE 17% vs monthly</Text>
                </View>
              )}
            </View>
          </View>

          <View style={s.priceBlock}>
            <Text style={[s.price, selected && { color: activeTextColor }]}>
              {isAnnual ? '£69.99' : '£6.99'}
            </Text>
            <Text style={s.pricePer}>{isAnnual ? '/year' : '/month'}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
}

// ─── screen ───────────────────────────────────────────────────────────────────

export function SubscribePromptScreen() {
  const refreshUser = useAuthStore((s) => s.refreshUser)
  const inFlightRef = useRef(false)
  const [selected, setSelected] = useState<Plan>('annual')
  const [busy, setBusy]         = useState(false)
  const insets                  = useSafeAreaInsets()

  // TODO (Phase 3C - Subscription):
  // - Replace "Explore full access" CTA with real purchase flow
  // - iOS → Apple StoreKit (IAP)
  // - Android → Google Play Billing / Stripe
  // - Only mark subscriptionPromptSeenAt after:
  //    a) user chooses free OR
  //    b) purchase is completed

  // Premium path (temporary stub — pending IAP).
  // Shows a coming-soon alert and keeps the user on this screen.
  // DOES NOT mark the prompt seen — routing guard in resolveRedirect would
  // bounce the user straight back here on next render anyway, so we make
  // the prompt a real decision point: pay later, or pick free now.
  function handlePremiumChoice() {
    if (busy) return
    Alert.alert(
      'Coming soon',
      'Premium unlocks all vouchers. Payment coming soon — for now, you can continue with free access.',
      [{ text: 'OK', style: 'cancel' }],
    )
  }

  // Free path — only place subscriptionPromptSeenAt is stamped.
  async function handleFreeChoice() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setBusy(true)
    try {
      await profileApi.markSubscriptionPromptSeen()
      await refreshUser()
      router.replace('/(app)/' as never)
    } catch {
      inFlightRef.current = false
      setBusy(false)
    }
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>

      {/* ── Scrollable content ────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0).duration(300)} style={s.header}>
          <Text style={s.title}>
            Pays for itself<Text style={s.titleDot}>.</Text>
          </Text>
          <Text style={s.subtitle}>
            Most members cover their monthly fee of £6.99 with their first voucher redemption.
          </Text>
        </Animated.View>

        {/* Plan cards */}
        <Animated.View entering={FadeInDown.delay(80).duration(300).springify()}>
          <PlanCard
            plan="annual"
            selected={selected === 'annual'}
            onPress={() => setSelected('annual')}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).duration(300).springify()}>
          <PlanCard
            plan="monthly"
            selected={selected === 'monthly'}
            onPress={() => setSelected('monthly')}
          />
        </Animated.View>

        {/* Voucher types marquee */}
        <Animated.View entering={FadeInDown.delay(210).duration(300)} style={s.voucherSection}>
          <Text style={s.voucherSectionLabel}>Vouchers you&apos;ll unlock</Text>
          <VoucherStrip />
        </Animated.View>

        {/* What's included */}
        <Animated.View entering={FadeInDown.delay(280).duration(300)} style={s.featuresCard}>
          <Text style={s.featuresHeading}>What&apos;s included</Text>
          <View style={s.featuresList}>
            {FEATURES.map(({ label, Icon }, i) => (
              <Animated.View
                key={label}
                entering={FadeInDown.delay(310 + i * 25).duration(220)}
                style={s.featureRow}
              >
                <Icon size={scale(14)} color={color.brandRose} strokeWidth={2} />
                <Text style={s.featureText}>{label}</Text>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

      </ScrollView>

      {/* ── Fixed footer — CTAs always visible ───────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(350).duration(280)}
        style={[
          s.footer,
          { paddingBottom: insets.bottom > 0 ? insets.bottom + spacing[2] : spacing[5] },
        ]}
      >
        <Pressable
          onPress={handlePremiumChoice}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Explore full access"
          accessibilityState={{ busy, disabled: busy }}
        >
          <LinearGradient
            colors={[...color.brandGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.unlockBtn, busy && { opacity: 0.6 }]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={s.unlockBtnText}>Explore full access</Text>
                <ChevronRight size={scale(18)} color="#FFFFFF" strokeWidth={2.5} />
              </>
            )}
          </LinearGradient>
        </Pressable>

        <Button
          variant="secondary"
          size="md"
          disabled={busy}
          onPress={handleFreeChoice}
        >
          Start with free access
        </Button>

        <View style={s.trustRow}>
          <ShieldCheck size={scale(13)} color="#16A34A" strokeWidth={2} />
          <Text style={s.trustText}>Trusted by thousands of members</Text>
        </View>
      </Animated.View>

    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: color.surface.tint,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop:        spacing[6],
    paddingBottom:     spacing[4],
  },

  // ── Header ────────────────────────────────────────────────────────────
  header: {
    marginBottom: spacing[5],
    gap:          spacing[2],
  },
  title: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize:   ms(30),
    color:      color.text.primary,
    lineHeight: ms(38),
  },
  titleDot: {
    color:      color.brandRose,
    fontSize:   ms(48),
    lineHeight: ms(38),
  },
  subtitle: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(14),
    color:      color.text.secondary,
    lineHeight: ms(21),
  },

  // ── Plan cards ────────────────────────────────────────────────────────
  cardWrap: {
    marginBottom: spacing[2],
    paddingTop:   scale(11),
  },
  card: {
    borderRadius:      radius.xl,
    paddingTop:        spacing[4],
    paddingBottom:     spacing[3],
    paddingHorizontal: spacing[4],
  },

  annualSelected: {
    backgroundColor: '#FFFBEB',
    borderWidth:     2,
    borderColor:     '#D97706',
    shadowColor:     '#D97706',
    shadowOpacity:   0.18,
    shadowRadius:    scale(10),
    shadowOffset:    { width: 0, height: 4 },
    elevation:       4,
  },
  annualUnselected: {
    backgroundColor: '#FEF3C7',
    borderWidth:     1.5,
    borderColor:     '#D97706',
    borderStyle:     'dashed' as const,
  },
  monthlySelected: {
    backgroundColor: '#ECFDF5',
    borderWidth:     2,
    borderColor:     '#059669',
    shadowColor:     '#059669',
    shadowOpacity:   0.18,
    shadowRadius:    scale(10),
    shadowOffset:    { width: 0, height: 4 },
    elevation:       4,
  },
  monthlyUnselected: {
    backgroundColor: '#D1FAE5',
    borderWidth:     1.5,
    borderColor:     '#059669',
    borderStyle:     'dashed' as const,
  },

  bestValueBadge: {
    position:          'absolute',
    top:               0,
    right:             spacing[4],
    zIndex:            1,
    backgroundColor:   '#D97706',
    borderRadius:      radius.pill,
    paddingHorizontal: ms(10),
    paddingVertical:   ms(4),
  },
  bestValueText: {
    fontFamily:    'Lato-SemiBold',
    fontSize:      ms(9),
    color:         '#FFFFFF',
    letterSpacing: 1.4,
  },

  cardRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            spacing[3],
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           spacing[3],
    flex:          1,
  },

  radio: {
    width:          scale(20),
    height:         scale(20),
    borderRadius:   scale(10),
    borderWidth:    2,
    borderColor:    color.border.default,
    alignItems:     'center',
    justifyContent: 'center',
    marginTop:      ms(2),
  },
  radioSelected: {
    borderColor:     color.brandRose,
    backgroundColor: 'rgba(226,12,4,0.05)',
  },
  radioDot: {
    width:           scale(10),
    height:          scale(10),
    borderRadius:    scale(5),
    backgroundColor: color.brandRose,
  },

  cardLabels: {
    gap:  spacing[1],
    flex: 1,
  },
  planName: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize:   ms(16),
    color:      color.text.secondary,
    lineHeight: ms(22),
  },
  planTagline: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(13),
    color:      color.text.tertiary,
    lineHeight: ms(18),
  },
  planAccessRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           ms(5),
    marginTop:     ms(2),
  },
  planAccessText: {
    fontFamily: 'Lato-SemiBold',
    fontSize:   ms(11),
    color:      color.text.secondary,
    lineHeight: ms(15),
    flex:       1,
  },
  savingsPill: {
    alignSelf:         'flex-start',
    marginTop:         spacing[1],
    backgroundColor:   'rgba(217,119,6,0.12)',
    borderRadius:      radius.pill,
    paddingHorizontal: ms(9),
    paddingVertical:   ms(3),
  },
  savingsText: {
    fontFamily:    'Lato-SemiBold',
    fontSize:      ms(10),
    color:         '#92400E',
    letterSpacing: 0.4,
  },

  priceBlock: {
    alignItems: 'flex-end',
    gap:        ms(1),
  },
  price: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize:   ms(22),
    color:      color.text.secondary,
    lineHeight: ms(28),
  },
  pricePer: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(12),
    color:      color.text.tertiary,
  },

  // ── Voucher types — user-controlled horizontal scroll ────────────────
  voucherSection: {
    marginTop:    spacing[2],
    marginBottom: spacing[3],
    marginLeft:   -layout.screenPaddingH,
    marginRight:  -layout.screenPaddingH,
  },
  voucherSectionLabel: {
    fontFamily:        'Lato-SemiBold',
    fontSize:          ms(11),
    color:             color.text.tertiary,
    letterSpacing:     0.8,
    textTransform:     'uppercase' as const,
    marginBottom:      spacing[2],
    paddingHorizontal: layout.screenPaddingH,
  },
  voucherChips: {
    paddingHorizontal: layout.screenPaddingH,
    gap:               ms(8),
  },
  voucherChip: {
    width:             CHIP_W,
    borderRadius:      radius.lg,
    paddingVertical:   spacing[3],
    paddingHorizontal: ms(8),
    alignItems:        'center',
    justifyContent:    'center',
    gap:               ms(4),
  },
  voucherChipName: {
    fontFamily: 'Lato-Bold',
    fontSize:   ms(10),
    lineHeight: ms(13),
    textAlign:  'center',
  },
  voucherChipDesc: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(9),
    color:      color.text.tertiary,
    lineHeight: ms(12),
    textAlign:  'center',
  },

  // ── What's included ───────────────────────────────────────────────────
  featuresCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    radius.xl,
    padding:         spacing[4],
    borderWidth:     1,
    borderColor:     color.border.subtle,
    marginBottom:    spacing[2],
    marginTop:       spacing[1],
  },
  featuresHeading: {
    fontFamily:   'MusticaPro-SemiBold',
    fontSize:     ms(14),
    color:        color.text.primary,
    lineHeight:   ms(20),
    marginBottom: spacing[2],
  },
  featuresList: {
    gap: ms(7),
  },
  featureRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           ms(10),
  },
  featureText: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(13),
    color:      color.text.secondary,
    lineHeight: ms(19),
    flex:       1,
  },

  // ── Fixed footer ──────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop:        spacing[3],
    gap:               spacing[3],
    backgroundColor:   color.surface.tint,
    borderTopWidth:    1,
    borderTopColor:    color.border.subtle,
  },

  unlockBtn: {
    minHeight:         Math.max(56, 44),
    borderRadius:      radius.md,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               ms(8),
    paddingHorizontal: spacing[6],
  },
  unlockBtnText: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize:   ms(16),
    color:      '#FFFFFF',
    lineHeight: ms(22),
  },

  // ── Trust signal ──────────────────────────────────────────────────────
  trustRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            ms(6),
    marginBottom:   spacing[1],
  },
  trustText: {
    fontFamily: 'Lato-Regular',
    fontSize:   ms(12),
    color:      color.text.tertiary,
    lineHeight: ms(18),
  },
})
