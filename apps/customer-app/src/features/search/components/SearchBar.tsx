import React from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { Search, X } from 'lucide-react-native'
import { Text, color, spacing, radius, elevation } from '@/design-system'

type Props = {
  value: string
  onChangeText: (text: string) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
}

export function SearchBar({ value, onChangeText, onCancel, autoFocus, placeholder = 'Search merchants...' }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <Search size={18} color={color.text.tertiary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.text.tertiary}
          autoFocus={autoFocus}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.input}
          accessibilityLabel="Search merchants"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChangeText('')} accessibilityLabel="Clear search" hitSlop={8}>
            <X size={18} color={color.text.tertiary} />
          </TouchableOpacity>
        )}
      </View>
      {onCancel && (
        <TouchableOpacity onPress={onCancel} accessibilityLabel="Cancel search">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: spacing[3],
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    height: 44,
    gap: spacing[2],
    ...elevation.sm,
  },
  input: {
    flex: 1,
    fontFamily: 'Lato-Regular',
    fontSize: 15,
    lineHeight: 21,
    color: color.text.primary,
    padding: 0,
  },
  cancelText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 14,
    color: color.brandRose,
  },
})
