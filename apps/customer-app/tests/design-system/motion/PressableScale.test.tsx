import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
  }
})

import { PressableScale } from '@/design-system/motion/PressableScale'

describe('<PressableScale>', () => {
  it('calls onPress', () => {
    const onPress = jest.fn()
    const { getByText } = render(<PressableScale onPress={onPress} accessibilityLabel="tap"><Text>x</Text></PressableScale>)
    fireEvent.press(getByText('x'))
    expect(onPress).toHaveBeenCalled()
  })
  it('is disabled when prop.disabled=true', () => {
    const onPress = jest.fn()
    const { getByText } = render(<PressableScale onPress={onPress} disabled accessibilityLabel="tap"><Text>x</Text></PressableScale>)
    fireEvent.press(getByText('x'))
    expect(onPress).not.toHaveBeenCalled()
  })
})
