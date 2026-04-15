jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }))
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, style }: any) => {
    const { View } = require('react-native')
    return <View style={style}>{children}</View>
  },
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SubscribePromptScreen } from '@/features/subscribe/screens/SubscribePromptScreen'
import { router } from 'expo-router'

describe('SubscribePromptScreen', () => {
  it('"Maybe later" navigates to /(app)/', () => {
    const { getByText } = render(<SubscribePromptScreen />)
    fireEvent.press(getByText('Maybe later'))
    expect(router.replace).toHaveBeenCalledWith('/(app)/')
  })
})
