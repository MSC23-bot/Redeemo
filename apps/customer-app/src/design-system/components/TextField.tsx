import React, { useState } from 'react'
import { TextInput, TextInputProps, View, Pressable } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'
// eslint-disable-next-line tokens/no-raw-tokens
import { Eye, EyeOff } from 'lucide-react-native'

export type TextFieldProps = Omit<TextInputProps, 'secureTextEntry'> & {
  label: string
  error?: string
  helper?: string
  secure?: boolean
}

export function TextField({ label, error, helper, secure, value, ...rest }: TextFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const borderColor = error ? color.danger : color.border.default
  return (
    <View style={{ gap: spacing[1] }}>
      <Text variant="label.md" color="secondary" meta>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor, borderRadius: radius.sm, backgroundColor: color.surface.page }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          placeholderTextColor={color.text.tertiary}
          style={{ flex: 1, minHeight: 48, paddingHorizontal: spacing[4], color: color.text.primary, fontFamily: 'Lato-Regular', fontSize: 16 }}
          secureTextEntry={!!secure && !revealed}
          {...rest}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed(v => !v)}
            style={{ paddingHorizontal: spacing[3] }}
          >
            {revealed ? <EyeOff size={20} color={color.text.secondary} /> : <Eye size={20} color={color.text.secondary} />}
          </Pressable>
        )}
      </View>
      {error ? (
        <Text variant="label.md" color="danger" accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text variant="label.md" color="secondary">{helper}</Text>
      ) : null}
    </View>
  )
}
