import React from 'react'
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle, type TextStyle } from 'react-native'
import { Text, color, spacing, radius } from '@/design-system'

/**
 * Batch 3 (2026-06-01) — the single Home chrome-card primitive (spec §9.8).
 * Consolidates the five ad-hoc cream cards (hint / no-location banner /
 * nearby empty / explore-more / context note) into one consistent surface:
 * radius, hairline border, padding scale, typography, 48pt CTA buttons, an
 * icon anchor, and a deterministic per-variant surface.
 *
 * Owner-locked decisions (Batch 3 plan §11):
 *   D2 surface map (no default rose-cream):
 *     hint   → white (surface.page) + brand-rose hairline
 *     banner → white + neutral hairline
 *     note   → white + neutral hairline
 *     empty  → warm cream (#FFF9F5, band family) + neutral hairline
 *   D3 radius: hint = md; banner/empty/note = lg
 *   D4 title : banner/empty = Mustica ~20 (mirrors <RailHeader>; there is NO
 *              Mustica-20 design-system variant, and display.sm is reserved
 *              for the greeting) — hardcoded fontFamily like RailHeader does.
 *   D7 padding: banner/empty ≈ 20/20; hint/note ≈ 12/16
 *
 * Motion: none here (D5 — static). The honesty hint keeps its own exit
 * animation wrapper and renders this primitive inside it (see SavedAreaHonestyHint).
 */

export type ChromeAction = {
  label: string
  onPress: () => void
  kind?: 'primary' | 'secondary' // primary = navy fill; secondary = navy outline
  accessibilityLabel?: string
  testID?: string
}

type Variant = 'hint' | 'banner' | 'empty' | 'note'

type Props = {
  variant: Variant
  body: string | React.ReactNode
  title?: string
  icon?: React.ReactNode
  actions?: ChromeAction[]
  /** hint only — whole-card tap + a trailing "Update ›"-style affordance
   *  (optional trailing icon, e.g. a chevron). */
  inlineAffordance?: { label: string; onPress: () => void; accessibilityLabel?: string; icon?: React.ReactNode }
  /** Hairline accent. Defaults to 'accent' (brand-rose) for `hint`, else 'neutral'. */
  tone?: 'neutral' | 'accent'
  align?: 'start' | 'center'
  /** Spoken label for the whole-card tap (hint). */
  accessibilityLabel?: string
  testID?: string
}

// D2 — deterministic surface per variant. Rose-cream #FEF6F5 is retired.
const SURFACE: Record<Variant, string> = {
  hint:   color.surface.page, // white
  banner: color.surface.page,
  note:   color.surface.page,
  empty:  '#FFF9F5',          // warm cream, band family
}

// D3 — radius per variant.
const CARD_RADIUS: Record<Variant, number> = {
  hint:   radius.md,
  banner: radius.lg,
  empty:  radius.lg,
  note:   radius.lg,
}

// D7 — padding per variant.
const PADDING: Record<Variant, ViewStyle> = {
  hint:   { paddingVertical: spacing[3], paddingHorizontal: spacing[4] }, // 12 / 16
  note:   { paddingVertical: spacing[3], paddingHorizontal: spacing[4] }, // 12 / 16
  banner: { paddingVertical: spacing[5], paddingHorizontal: spacing[5] }, // 20 / 20
  empty:  { paddingVertical: spacing[5], paddingHorizontal: spacing[5] }, // 20 / 20
}

// Margin rhythm — low-weight cards sit tighter (tunable in M5 / device QA).
const MARGIN_V: Record<Variant, number> = {
  hint:   spacing[2],
  note:   spacing[2],
  banner: spacing[3],
  empty:  spacing[3],
}

function renderBody(body: string | React.ReactNode, style: StyleProp<TextStyle>) {
  return typeof body === 'string' ? <Text style={style}>{body}</Text> : body
}

export function HomeChromeCard({
  variant,
  body,
  title,
  icon,
  actions,
  inlineAffordance,
  tone,
  align = 'start',
  accessibilityLabel,
  testID,
}: Props) {
  const accent = (tone ?? (variant === 'hint' ? 'accent' : 'neutral')) === 'accent'

  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: SURFACE[variant],
      borderRadius:    CARD_RADIUS[variant],
      borderColor:     accent ? color.brandRose : color.border.subtle,
      marginVertical:  MARGIN_V[variant],
    },
    PADDING[variant],
  ]

  // hint — whole-card tappable row: [icon] [title + body] [inline affordance].
  if (inlineAffordance) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={inlineAffordance.onPress}
        style={({ pressed }) => [cardStyle, styles.hintRow, pressed && styles.pressed]}
      >
        {icon ? <View style={styles.hintIcon}>{icon}</View> : null}
        <View style={styles.hintCopy}>
          {title ? <Text style={styles.hintTitle}>{title}</Text> : null}
          {renderBody(body, styles.body)}
        </View>
        <View style={styles.affordance}>
          <Text style={styles.affordanceLabel}>{inlineAffordance.label}</Text>
          {inlineAffordance.icon ?? null}
        </View>
      </Pressable>
    )
  }

  // banner / empty / note — column: [icon?] [title?] [body] [actions?].
  return (
    <View testID={testID} style={[cardStyle, align === 'center' && styles.alignCenter]}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {renderBody(body, [styles.body, align === 'center' ? styles.bodyCenter : null])}
      {actions && actions.length > 0 ? (
        <View style={[styles.actionRow, align === 'center' && styles.actionRowCenter]}>
          {actions.map((a, i) => {
            const secondary = a.kind === 'secondary'
            return (
              <Pressable
                key={`${a.label}-${i}`}
                testID={a.testID}
                accessibilityRole="button"
                accessibilityLabel={a.accessibilityLabel ?? a.label}
                onPress={a.onPress}
                style={({ pressed }) => [
                  styles.btn,
                  secondary ? styles.btnSecondary : styles.btnPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={secondary ? styles.btnSecondaryLabel : styles.btnPrimaryLabel}>{a.label}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    borderWidth: 1,
    // backgroundColor / borderRadius / borderColor / marginVertical / padding
    // are applied per-variant inline above. No shadow (spec §9.8).
  },
  alignCenter: { alignItems: 'center' },
  pressed: { opacity: 0.85 },

  // ---- hint (row) ----
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  hintIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  hintCopy: { flex: 1, gap: spacing[1] },
  hintTitle: { fontSize: 16, lineHeight: 22, fontFamily: 'Lato-SemiBold', color: color.text.primary },
  affordance: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  affordanceLabel: { fontSize: 14, fontFamily: 'Lato-SemiBold', color: color.brandRose },

  // ---- column (banner / empty / note) ----
  iconWrap: { marginBottom: spacing[2] },
  // D4 — Mustica ~20, mirroring <RailHeader>'s hardcoded title (no Mustica-20
  // design-system variant exists; display.sm is reserved for the greeting).
  title: { fontSize: 20, lineHeight: 26, fontFamily: 'MusticaPro-Semibold', color: color.navy, marginBottom: spacing[2] },
  body: { fontSize: 14, lineHeight: 20, fontFamily: 'Lato-Regular', color: color.text.secondary },
  bodyCenter: { textAlign: 'center' },

  // ---- 48pt CTA buttons (spec §9.8) ----
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[4] },
  actionRowCenter: { justifyContent: 'center' },
  btn: { height: 48, justifyContent: 'center', paddingHorizontal: spacing[4], borderRadius: radius.md },
  btnPrimary: { backgroundColor: color.navy },
  btnPrimaryLabel: { fontSize: 14, fontFamily: 'Lato-SemiBold', color: '#FFFFFF' },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.navy },
  btnSecondaryLabel: { fontSize: 14, fontFamily: 'Lato-SemiBold', color: color.navy },
})
