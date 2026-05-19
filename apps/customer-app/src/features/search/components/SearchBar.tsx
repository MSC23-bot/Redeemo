import React from 'react'
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import { Text } from '@/design-system/Text'

type Props = {
  value: string
  onChangeText: (text: string) => void
  onCancel?: () => void
  // §BE — fired when the keyboard's search/return key is pressed. Lets
  // consumers (e.g. MapScreen) resolve the typed query against a city
  // list / geocoder when no suggestion has been tapped. Optional so
  // existing consumers (HomeScreen, SearchScreen) keep their no-op
  // behaviour unchanged.
  onSubmitEditing?: () => void
  autoFocus?: boolean
  placeholder?: string
}

function SearchIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#E20C04" strokeWidth={2} strokeLinecap="round">
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Svg>
  )
}

function ClearIcon() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#010C35" strokeWidth={2.5} strokeLinecap="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  )
}

export function SearchBar({ value, onChangeText, onCancel, onSubmitEditing, autoFocus, placeholder = 'Search merchants...' }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <SearchIcon />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
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
  // PR #112 device-QA fixup-3 (2026-05-19) — design-system token alignment.
  // Calmer surface: navy-tinted elevation.sm (no brand-rose tinted border,
  // no heavy shadow); border-subtle hairline; rounded.md (12px); body.md
  // typography on the input.
  container: {
    flexDirection:     'row',
    paddingHorizontal: 16,
    gap:               10,
    alignItems:        'center',
    marginBottom:      14,
  },
  inputWrapper: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#FFFFFF',           // surface-page
    borderRadius:      12,                  // rounded.md
    paddingHorizontal: 14,
    paddingVertical:   12,
    gap:               10,
    borderWidth:       1,
    borderColor:       '#E5E7EB',           // border-subtle
    shadowColor:       '#010C35',           // navy-tinted elevation.sm
    shadowOpacity:     0.06,
    shadowRadius:      4,
    shadowOffset:      { width: 0, height: 2 },
    elevation:         1,
  },
  input: {
    flex:       1,
    fontFamily: 'Lato-Regular',
    fontSize:   15,                         // body-ish, more readable on device
    color:      '#010C35',                  // text.primary navy
    padding:    0,
  },
  clearBtn: {
    width:           22,
    height:          22,
    borderRadius:    11,
    backgroundColor: '#F3F4F6',             // surface-subtle
    alignItems:      'center',
    justifyContent:  'center',
  },
  cancelText: {
    fontFamily:    'Lato-Medium',           // label.lg — softer than SemiBold
    fontSize:      14,
    color:         '#E20C04',               // brand-rose
    letterSpacing: 0.2,
    paddingLeft:   2,
  },
})
