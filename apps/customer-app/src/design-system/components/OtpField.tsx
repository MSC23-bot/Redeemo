import React, { useRef, useState } from 'react'
import { TextInput, View, Pressable } from 'react-native'
import { Text } from '../Text'
import { color, radius, spacing } from '../tokens'

type Props = {
  length?: number
  onComplete: (code: string) => void
  error?: string
  disabled?: boolean
}

export function OtpField({ length = 6, onComplete, error, disabled }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<TextInput>(null)
  const cells = Array.from({ length }, (_, i) => value[i] ?? '')

  return (
    <View>
      <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="One-time code input">
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {cells.map((c, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: 56, borderRadius: radius.md,
                borderWidth: 1, borderColor: error ? color.danger : (i === value.length ? color.navy : color.border.default),
                backgroundColor: color.surface.subtle, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text variant="heading.lg">{c}</Text>
            </View>
          ))}
        </View>
      </Pressable>
      <TextInput
        ref={ref}
        accessibilityLabel="One-time code"
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        value={value}
        onChangeText={(t) => {
          const clean = t.replace(/\D/g, '').slice(0, length)
          setValue(clean)
          if (clean.length === length) onComplete(clean)
        }}
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
      />
      {error && (
        <View style={{ marginTop: spacing[2] }}>
          <Text variant="label.md" color="danger" accessibilityLiveRegion="polite">{error}</Text>
        </View>
      )}
    </View>
  )
}
