jest.mock('@/lib/location', () => ({
  useLocationAssist: jest.fn(() => ({ status: 'denied', address: null, request: jest.fn(), loading: false })),
}))
jest.mock('@/lib/api/profile')
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }))
jest.mock('@/lib/storage', () => ({
  secureStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
  prefsStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
}))
jest.mock('@/lib/api', () => ({ api: { setTokens: jest.fn(), onSessionExpired: jest.fn() }, setTokens: jest.fn() }))
jest.mock('@/lib/api/auth', () => ({ authApi: { logout: jest.fn(async () => ({})) } }))
jest.mock('@/design-system/haptics', () => ({ setHapticsEnabled: jest.fn(), haptics: {} }))
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useMutation: ({ mutationFn }: any) => ({ mutateAsync: mutationFn, isPending: false }),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))

import React from 'react'
import { render } from '@testing-library/react-native'
import { PC2AddressScreen } from '@/features/profile-completion/screens/PC2AddressScreen'

describe('PC2AddressScreen', () => {
  it('shows no permission-denied toast when location is denied', () => {
    const { queryByText } = render(<PC2AddressScreen />)
    expect(queryByText(/permission denied/i)).toBeNull()
  })
})
