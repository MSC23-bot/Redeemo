import React from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import { Text } from '@/design-system/Text'

type Props = {
  value: string
  onChangeText: (text: string) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
}

function SearchIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#E20C04" strokeWidth={2} strokeLinecap="round">
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  )
}

function ClearIcon() {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={3} strokeLinecap="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  )
}

export function SearchBar({ value, onChangeText, onCancel, autoFocus, placeholder = 'Search merchants...' }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <SearchIcon />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          autoFocus={autoFocus}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.input}
          accessibilityLabel="Search merchants"
        />
        {value.length > 0 && (
          <TouchableOpacity
            onPress={() => onChangeText('')}
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={styles.clearBtn}
          >
            <ClearIcon />
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
    gap: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(226,12,4,0.15)',
  },
  input: {
    flex: 1,
    fontFamily: 'Lato-Medium',
    fontSize: 13,
    color: '#010C35',
    padding: 0,
  },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 13,
    color: '#E20C04',
  },
})
