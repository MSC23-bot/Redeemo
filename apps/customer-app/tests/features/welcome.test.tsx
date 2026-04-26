import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { WelcomeScreen } from '@/features/auth/screens/WelcomeScreen'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, style }: any) => {
    const { View } = require('react-native')
    return <View style={style}>{children}</View>
  },
}))

describe('WelcomeScreen', () => {
  beforeEach(() => mockPush.mockClear())
  it('navigates to register on primary CTA', () => {
    const { getByText } = render(<WelcomeScreen />)
    fireEvent.press(getByText('Create your free account'))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register')
  })
  it('navigates to login on Sign in link', () => {
    const { getByText } = render(<WelcomeScreen />)
    fireEvent.press(getByText('Sign in'))
    expect(mockPush).toHaveBeenCalledWith('/(auth)/login')
  })
})
