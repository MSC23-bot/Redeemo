import React from 'react'
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native'
import { color, typography, type TypographyVariant } from './tokens'

type Variant = keyof typeof typography
type Shade = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'danger'

export type TextProps = RNTextProps & {
  variant?: Variant
  color?: Shade
  /** When true, allows color="tertiary" on body variants (metadata use only). */
  meta?: boolean
  align?: TextStyle['textAlign']
}

export function Text({
  variant = 'body.md',
  color: shade = 'primary',
  meta = false,
  align,
  style,
  children,
  accessibilityRole,
  ...rest
}: TextProps) {
  const t: TypographyVariant = typography[variant]
  const isBodyLike = variant.startsWith('body.') || variant.startsWith('heading.')
  const resolvedShade: Shade = shade === 'tertiary' && isBodyLike && !meta ? 'primary' : shade

  const textStyle: TextStyle = {
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    ...(t.letterSpacing !== undefined ? { letterSpacing: t.letterSpacing } : {}),
    ...(t.textTransform !== undefined ? { textTransform: t.textTransform } : {}),
    ...(align !== undefined ? { textAlign: align } : {}),
    color: color.text[resolvedShade],
  }
  return (
    <RNText
      accessibilityRole={accessibilityRole ?? (variant.startsWith('display.') || variant.startsWith('heading.') ? 'header' : 'text')}
      style={[textStyle, style]}
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      {...rest}
    >
      {children}
    </RNText>
  )
}
