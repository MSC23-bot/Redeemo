import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
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
