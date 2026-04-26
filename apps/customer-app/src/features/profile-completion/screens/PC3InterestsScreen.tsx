import React, { useState } from 'react'
import { View, Pressable, StyleSheet, ScrollView } from 'react-native'
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Text,
  Button,
  StepIndicator,
  Card,
  layout,
  spacing,
  radius,
  color,
  haptics,
} from '@/design-system'
import {
  ArrowLeft, Sparkles, Zap,
  Coffee, Utensils, Dumbbell, Shirt, Plane, Wine, Scissors, Music, Sofa,
  Gamepad2, BookOpen, PawPrint, Palette, Baby, Heart, Home, Wallet, Camera, Navigation, Flame, Gift,
  GraduationCap, ShoppingBag,
} from '@/design-system/icons'
import type { LucideIcon } from 'lucide-react-native'

// ─── interest → icon mapping ──────────────────────────────────────────────────

const ICON_MAP: Array<{ pattern: RegExp; Icon: LucideIcon }> = [
  { pattern: /beauty|skin|spa|salon|nail|hair|makeup|cosmetic|groom/i,  Icon: Scissors  },
  { pattern: /coffee|cafe|tea|bakery|brunch/i,                          Icon: Coffee    },
  { pattern: /food|dining|cuisine|eat|kitchen|restaurant|takeaway/i,    Icon: Utensils  },
  { pattern: /drink|bar|pub|alcohol|beer|wine|cocktail/i,               Icon: Wine      },
  { pattern: /fitness|gym|sport|wellness|yoga|pilates|run|swim|active/i, Icon: Dumbbell },
  { pattern: /fashion|cloth|style|wear|outfit|boutique/i,               Icon: Shirt     },
  { pattern: /travel|holiday|hotel|trip|tour|escape/i,                  Icon: Plane     },
  { pattern: /entertain|cinema|theatre|concert|show|event/i,            Icon: Music     },
  { pattern: /home|garden|furniture|decor|interior|diy/i,               Icon: Sofa      },
  { pattern: /gaming|game|esport/i,                                     Icon: Gamepad2  },
  { pattern: /tech|electron|gadget|computer|phone/i,                    Icon: Zap       },
  { pattern: /book|read|librar|literature/i,                            Icon: BookOpen  },
  { pattern: /art|culture|museum|gallery|creative|craft/i,              Icon: Palette   },
  { pattern: /pet|animal|dog|cat/i,                                     Icon: PawPrint  },
  { pattern: /kid|child|baby|family|parent|nursery/i,                   Icon: Baby      },
  { pattern: /health|medic|pharmacy|wellbeing/i,                        Icon: Heart     },
  { pattern: /finance|money|invest|saving|bank/i,                       Icon: Wallet    },
  { pattern: /photo|camera/i,                                           Icon: Camera    },
  { pattern: /car|auto|vehicle|motor/i,                                 Icon: Navigation },
  { pattern: /music|band|festival/i,                                    Icon: Music     },
  { pattern: /food|snack|chocolate|dessert|sweet/i,                     Icon: Flame     },
  { pattern: /gift|present|occasion/i,                                  Icon: Gift      },
  { pattern: /professional|develop|career|business|skill|learn|course|training/i, Icon: GraduationCap },
  { pattern: /shopping|retail|market|shop|store|boutique/i,             Icon: ShoppingBag },
]

function getIcon(name: string): LucideIcon | null {
  for (const { pattern, Icon } of ICON_MAP) {
    if (pattern.test(name)) return Icon
  }
  return null
}
import { scale, ms } from '@/design-system/scale'
import { useUpdateInterests } from '@/hooks/useUpdateInterests'
import { useInterestsCatalogue } from '@/hooks/useInterestsCatalogue'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'

const MIN_INTERESTS = 3

// ─── interest chip ────────────────────────────────────────────────────────────

type ChipProps = {
  label: string
  selected: boolean
  onPress: () => void
  index: number
}

function InterestChip({ label, selected, onPress, index }: ChipProps) {
  const scaleAnim = useSharedValue(1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleAnim.value }] }))
  const Icon = getIcon(label)

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 30).duration(240).springify()}
      style={animStyle}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={() => {
          scaleAnim.value = withSpring(0.94, { damping: 22, stiffness: 320 })
        }}
        onPressOut={() => {
          scaleAnim.value = withSpring(1, { damping: 16, stiffness: 260 })
        }}
        style={[s.chip, selected ? s.chipSelected : s.chipUnselected]}
      >
        {Icon ? (
          <Icon size={scale(13)} color={selected ? '#FFFFFF' : color.text.tertiary} strokeWidth={1.8} />
        ) : null}
        <Text
          variant="label.lg"
          style={[s.chipLabel, { color: selected ? '#FFFFFF' : color.text.secondary }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

// ─── screen ───────────────────────────────────────────────────────────────────

export function PC3InterestsScreen() {
  const { markStepComplete, totalSteps, isNavigating } = useProfileCompletion()
  const update = useUpdateInterests()
  const { data, isLoading } = useInterestsCatalogue()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const insets = useSafeAreaInsets()

  function handleBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/profile-completion/address')
  }

  function toggle(id: string) {
    void haptics.touch.light()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function onSave() {
    try {
      await update.mutateAsync(Array.from(selected))
      await markStepComplete('pc3')
    } catch { /* toast handled by global error boundary */ }
  }

  async function onSkip() {
    await markStepComplete('pc3')
  }

  const interests = data?.interests ?? []
  const count = selected.size
  const readyToGo = count >= MIN_INTERESTS
  const countLabel = count === 0
    ? null
    : readyToGo
    ? `${count} selected — you're good to go`
    : `${count} selected`

  return (
    <View style={[s.screen, { backgroundColor: color.surface.tint }]}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <View style={[s.stickyHeader, { paddingTop: insets.top }]}>
        <View style={s.appBarRow}>
          <Pressable
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={s.backBtn}
          >
            <ArrowLeft size={scale(22)} color={color.text.primary} />
          </Pressable>
          <Text variant="heading.md" align="center" style={{ flex: 1 }}>
            Your interests
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.stepBarRow}>
          <StepIndicator
            current={3}
            total={totalSteps}
            activeColor={color.brandRose}
            segmentWidth={52}
            barHeight={5}
          />
          <Text variant="label.md" color="tertiary" meta align="center">
            Step 3 of {totalSteps}
          </Text>
        </View>
      </View>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: insets.bottom + spacing[7] },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroIconWrap}>
            <Sparkles size={scale(26)} color={color.brandRose} />
            <View style={s.heroBadge}>
              <Zap size={scale(11)} color={color.brandRose} fill={color.brandRose} />
            </View>
          </View>
          <View style={s.heroText}>
            <Text variant="display.sm">What do you enjoy?</Text>
            <Text variant="body.sm" color="tertiary" meta style={{ marginTop: spacing[1] }}>
              Pick at least 3 interests so we can personalise your deals.
            </Text>
          </View>
        </View>

        {/* Chips card */}
        <Card style={s.card}>
          {isLoading ? (
            <View style={s.chipGrid}>
              {Array.from({ length: 12 }).map((_, i) => (
                <View key={i} style={s.skeletonChip} />
              ))}
            </View>
          ) : (
            <Animated.View entering={FadeInDown.duration(260)} style={s.chipGrid}>
              {interests.map((interest, i) => (
                <InterestChip
                  key={interest.id}
                  label={interest.name}
                  selected={selected.has(interest.id)}
                  onPress={() => toggle(interest.id)}
                  index={i}
                />
              ))}
            </Animated.View>
          )}

          {countLabel ? (
            <Animated.View entering={FadeInDown.duration(180)} style={s.selectionHint}>
              <Text
                variant="label.md"
                style={readyToGo ? s.hintReady : s.hintPending}
                meta
                align="center"
              >
                {countLabel}
              </Text>
            </Animated.View>
          ) : null}
        </Card>

        <View style={{ height: spacing[5] }} />

        <Button
          variant="primary"
          size="lg"
          loading={update.isPending || isNavigating}
          onPress={onSave}
          disabled={count === 0 || isNavigating}
        >
          Continue
        </Button>

        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
          disabled={isNavigating}
          style={[s.skipBtn, isNavigating && { opacity: 0.4 }]}
          hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
        >
          <Text variant="label.md" style={s.skipLabel}>
            Skip for now
          </Text>
        </Pressable>

      </ScrollView>
    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
  },

  stickyHeader: {
    backgroundColor: color.surface.page,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  appBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.appBarHeight,
    paddingHorizontal: spacing[4],
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  stepBarRow: {
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    alignItems: 'center',
  },

  scrollContent: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: spacing[4],
  },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(14),
    marginBottom: spacing[4],
  },
  heroIconWrap: {
    width: scale(58),
    height: scale(58),
    borderRadius: scale(29),
    backgroundColor: 'rgba(226,12,4,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    bottom: scale(2),
    right: scale(2),
  },
  heroText: {
    flex: 1,
  },

  card: {
    padding: spacing[4],
    borderRadius: radius.xl,
    shadowOpacity: 0.04,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },

  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(13),
    paddingVertical: ms(10),
    borderRadius: radius.pill,
    minHeight: layout.minTouchTarget,
  },
  chipSelected: {
    backgroundColor: color.navy,
    shadowColor: color.navy,
    shadowOpacity: 0.22,
    shadowRadius: scale(6),
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  chipUnselected: {
    backgroundColor: color.surface.page,
    borderWidth: 1.5,
    borderColor: color.border.subtle,
  },
  chipLabel: {
    fontFamily: 'Lato-SemiBold',
    fontSize: ms(14),
    lineHeight: ms(20),
  },

  selectionHint: {
    marginTop: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: color.border.subtle,
  },
  hintPending: {
    color: color.text.tertiary,
  },
  hintReady: {
    color: '#16A34A',
  },

  skeletonChip: {
    height: scale(40),
    width: scale(80),
    borderRadius: radius.pill,
    backgroundColor: color.surface.subtle,
  },

  skipBtn: {
    alignSelf: 'center',
    marginTop: spacing[4],
    paddingVertical: spacing[2],
  },
  skipLabel: {
    fontFamily: 'Lato-Regular',
    fontSize: ms(13),
    color: color.text.tertiary,
  },
})
