jest.mock('@/lib/storage', () => ({
  secureStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
  prefsStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
}))
jest.mock('@/lib/api', () => ({ api: { setTokens: jest.fn(), onSessionExpired: jest.fn() }, setTokens: jest.fn() }))
jest.mock('@/lib/api/auth', () => ({ authApi: { logout: jest.fn(async () => ({})) } }))
jest.mock('@/design-system/haptics', () => ({ setHapticsEnabled: jest.fn(), haptics: {} }))
jest.mock('@/lib/api/profile')
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }))
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: ({ mutationFn }: any) => ({
    mutateAsync: mutationFn,
    isPending: false,
  }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}))

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PC1AboutScreen } from '@/features/profile-completion/screens/PC1AboutScreen'
import { profileApi } from '@/lib/api/profile'
import { useAuthStore } from '@/stores/auth'

describe('PC1AboutScreen', () => {
  it('advances furthestStep to pc1 after successful save', async () => {
    ;(profileApi.updateProfile as jest.Mock).mockResolvedValue({ firstName: 'Ada' })
    const { getByText, getByLabelText } = render(<PC1AboutScreen />)
    fireEvent.changeText(getByLabelText('First name'), 'Ada')
    fireEvent.press(getByText('Continue'))
    await waitFor(() => expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc1'))
  })
})
