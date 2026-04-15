export const color = {
  brandRose: '#E20C04',
  brandCoral: '#E84A00',
  brandGradient: ['#E20C04', '#E84A00'] as const,
  onBrand: '#FFFFFF',
  navy: '#010C35',
  text: {
    primary: '#010C35',
    secondary: '#4B5563',
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    danger: '#B91C1C',
  },
  surface: {
    page: '#FFFFFF',
    tint: '#FEF6F5',
    neutral: '#F8F9FA',
    subtle: '#F3F4F6',
    raised: '#FFFFFF',
  },
  border: { subtle: '#E5E7EB', default: '#D1D5DB', strong: '#9CA3AF' },
  success: '#0F7A3E',
  warning: '#B45309',
  danger: '#B91C1C',
  info: '#0E7490',
  focus: '#010C35',
} as const

export const spacing = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const

export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, pill: 9999 } as const

export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm:   { shadowColor: '#010C35', shadowOpacity: 0.08, shadowRadius: 4,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md:   { shadowColor: '#010C35', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  lg:   { shadowColor: '#010C35', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  glow: { shadowColor: '#E20C04', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
} as const

export const motion = {
  duration: { instant: 0, xfast: 120, fast: 180, base: 240, slow: 320, xslow: 400 },
  easing:   { standard: [0.4, 0, 0.2, 1], enter: [0, 0, 0.2, 1], exit: [0.4, 0, 1, 1] },
  spring:   {
    gentle: { damping: 20, stiffness: 180 },
    snappy: { damping: 18, stiffness: 260 },
    rubber: { damping: 14, stiffness: 140 },
  },
  stagger: 40,
} as const

export const layer = { base: 0, raised: 1, sticky: 10, appBar: 20, tabBar: 20, sheet: 40, overlay: 50, toast: 60, alert: 70 } as const

export const opacity = { disabled: 0.4, pressed: 0.85, overlay: 0.55, subtle: 0.72, full: 1 } as const

export const layout = { screenPaddingH: 20, tabBarHeight: 64, appBarHeight: 56, minTouchTarget: 44 } as const

export type TypographyVariant = {
  fontFamily: 'MusticaPro-SemiBold' | 'Lato-Regular' | 'Lato-Medium' | 'Lato-SemiBold' | 'Lato-Bold'
  fontSize: number
  lineHeight: number
  letterSpacing?: number
  textTransform?: 'uppercase'
}

export const typography = {
  'display.xl': { fontFamily: 'MusticaPro-SemiBold', fontSize: 40, lineHeight: 44 },
  'display.lg': { fontFamily: 'MusticaPro-SemiBold', fontSize: 32, lineHeight: 36 },
  'display.md': { fontFamily: 'MusticaPro-SemiBold', fontSize: 26, lineHeight: 30 },
  'display.sm': { fontFamily: 'MusticaPro-SemiBold', fontSize: 22, lineHeight: 26 },
  'heading.lg': { fontFamily: 'Lato-SemiBold', fontSize: 20, lineHeight: 26 },
  'heading.md': { fontFamily: 'Lato-SemiBold', fontSize: 18, lineHeight: 24 },
  'heading.sm': { fontFamily: 'Lato-SemiBold', fontSize: 16, lineHeight: 22 },
  'body.lg':    { fontFamily: 'Lato-Regular',  fontSize: 18, lineHeight: 28 },
  'body.md':    { fontFamily: 'Lato-Regular',  fontSize: 16, lineHeight: 24 },
  'body.sm':    { fontFamily: 'Lato-Regular',  fontSize: 14, lineHeight: 21 },
  'label.lg':   { fontFamily: 'Lato-Medium',   fontSize: 14, lineHeight: 18, letterSpacing: 0.2 },
  'label.md':   { fontFamily: 'Lato-Medium',   fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  'label.eyebrow': { fontFamily: 'Lato-SemiBold', fontSize: 11, lineHeight: 14, letterSpacing: 1.8, textTransform: 'uppercase' },
  'mono.redemption': { fontFamily: 'Lato-Bold', fontSize: 28, lineHeight: 34, letterSpacing: 4 },
} satisfies Record<string, TypographyVariant>
