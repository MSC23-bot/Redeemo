jest.mock('expo-font', () => ({ useFonts: () => [true] }))
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }))
jest.mock('expo-router', () => ({ Slot: () => null }))
jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((sel: (s: any) => any) => sel({
    status: 'unauthenticated',
    bootstrap: jest.fn(),
    signOut: jest.fn(),
    setMotionScale: jest.fn(),
    onboarding: { profileCompletion: 'not_started', furthestStep: 'pc1', phoneVerifiedAtLeastOnce: false },
    user: null,
  })),
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: any) => children,
}))
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children, style }: any) => children,
}))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('@/app-bootstrap/DeepLinkListener', () => ({ DeepLinkListener: () => null }))
jest.mock('@/app-bootstrap/ReduceMotionListener', () => ({ ReduceMotionListener: () => null }))
jest.mock('@/app-bootstrap/SessionExpiredBridge', () => ({ SessionExpiredBridge: () => null }))
jest.mock('@/design-system/motion/Toast', () => ({ ToastProvider: ({ children }: any) => children, emitToast: jest.fn() }))
jest.mock('@tanstack/react-query', () => ({ QueryClient: jest.fn(), QueryClientProvider: ({ children }: any) => children, MutationCache: jest.fn() }))

import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import RootLayout from '@/../app/_layout'

describe('RootLayout', () => {
  it('renders without crashing when fonts ready and status not bootstrapping', async () => {
    const { toJSON } = render(<RootLayout />)
    await waitFor(() => expect(toJSON()).not.toBeNull())
  })
})
