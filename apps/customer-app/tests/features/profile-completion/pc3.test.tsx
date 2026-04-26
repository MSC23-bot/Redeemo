jest.mock('@/lib/api/profile')
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }))
jest.mock('@/lib/storage', () => ({
  secureStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
  prefsStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
}))
jest.mock('@/lib/api', () => ({ api: { setTokens: jest.fn(), onSessionExpired: jest.fn() }, setTokens: jest.fn() }))
jest.mock('@/lib/api/auth', () => ({ authApi: { logout: jest.fn(async () => ({})) } }))
jest.mock('@/design-system/haptics', () => ({ setHapticsEnabled: jest.fn(), haptics: { selection: jest.fn() } }))
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useQuery: ({ queryFn }: any) => ({ data: { interests: [{ id: 'i1', name: 'Coffee' }] }, isLoading: false }),
  useMutation: ({ mutationFn }: any) => ({ mutateAsync: mutationFn, isPending: false }),
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }))

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PC3InterestsScreen } from '@/features/profile-completion/screens/PC3InterestsScreen'
import { profileApi } from '@/lib/api/profile'

describe('PC3InterestsScreen', () => {
  it('sends selected interestIds on continue', async () => {
    ;(profileApi.updateInterests as jest.Mock).mockResolvedValue({ interests: [] })
    const { findByText, getByText } = render(<PC3InterestsScreen />)
    fireEvent.press(await findByText('Coffee'))
    fireEvent.press(getByText('Continue'))
    await waitFor(() => expect(profileApi.updateInterests).toHaveBeenCalledWith(['i1']))
  })
})
