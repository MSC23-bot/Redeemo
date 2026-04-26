import React from 'react'
import { ActivityIndicator, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { PressableScale } from '../motion/PressableScale'
import { Text } from '../Text'
import { color, radius, spacing, opacity, layout } from '../tokens'

type PrimaryOrDanger = { variant: 'primary' | 'danger'; size?: 'md' | 'lg' }
type SecondaryOrGhost = { variant: 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg' }

type BaseProps = {
  children: React.ReactNode
  onPress: () => void | Promise<void>
  loading?: boolean
  disabled?: boolean
  accessibilityLabel?: string
  fullWidth?: boolean
}

export type ButtonProps = BaseProps & (PrimaryOrDanger | SecondaryOrGhost)

const SIZE: Record<string, { height: number; paddingH: number; variant: 'label.md' | 'label.lg' | 'heading.sm' }> = {
  sm: { height: 36, paddingH: spacing[3], variant: 'label.md' },
  md: { height: 48, paddingH: spacing[5], variant: 'label.lg' },
  lg: { height: 56, paddingH: spacing[6], variant: 'heading.sm' },
}

export function Button(props: ButtonProps) {
  const { variant, size = 'md', children, onPress, loading, disabled, accessibilityLabel, fullWidth } = props
  // SIZE always has 'sm' | 'md' | 'lg' keys — non-null assertion is safe
  const s = SIZE[size]!
  const isInteractiveBlocked = !!(loading || disabled)
  const baseStyle: ViewStyle = {
    minHeight: Math.max(s.height, layout.minTouchTarget),
    paddingHorizontal: s.paddingH,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: disabled ? opacity.disabled : 1,
    alignSelf: fullWidth ? 'stretch' : 'auto',
    flexDirection: 'row',
  }

  const content = loading ? (
    <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? color.navy : color.onBrand} />
  ) : (
    <Text variant={s.variant} color={variant === 'secondary' || variant === 'ghost' ? 'primary' : 'inverse'}>
      {children}
    </Text>
  )

  const accProps = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: accessibilityLabel ?? (typeof children === 'string' ? children : undefined),
    accessibilityState: { disabled: isInteractiveBlocked, busy: !!loading },
  }

  if (variant === 'primary') {
    return (
      <PressableScale disabled={isInteractiveBlocked} onPress={onPress} {...accProps}>
        <LinearGradient colors={[...color.brandGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={baseStyle}>
          {content}
        </LinearGradient>
      </PressableScale>
    )
  }
  if (variant === 'danger') {
    return (
      <PressableScale disabled={isInteractiveBlocked} onPress={onPress} {...accProps}>
        <View style={[baseStyle, { backgroundColor: color.danger }]}>{content}</View>
      </PressableScale>
    )
  }
  if (variant === 'secondary') {
    return (
      <PressableScale disabled={isInteractiveBlocked} onPress={onPress} {...accProps}>
        <View style={[baseStyle, { backgroundColor: color.surface.page, borderWidth: 1, borderColor: color.navy }]}>{content}</View>
      </PressableScale>
    )
  }
  // ghost
  return (
    <PressableScale disabled={isInteractiveBlocked} onPress={onPress} hapticStyle="none" {...accProps}>
      <View style={[baseStyle, { backgroundColor: 'transparent' }]}>{content}</View>
    </PressableScale>
  )
}
