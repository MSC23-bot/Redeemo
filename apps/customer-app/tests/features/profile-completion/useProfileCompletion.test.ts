jest.mock('@/lib/storage', () => ({
  secureStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
  prefsStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
}))
jest.mock('@/lib/api', () => ({ api: { setTokens: jest.fn(), onSessionExpired: jest.fn() }, setTokens: jest.fn() }))
jest.mock('@/lib/api/auth', () => ({ authApi: { logout: jest.fn(async () => ({ success: true })) } }))
jest.mock('@/lib/api/profile', () => ({ profileApi: { getMe: jest.fn() } }))
jest.mock('@/design-system/haptics', () => ({ setHapticsEnabled: jest.fn(), haptics: {} }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }))

import { renderHook, act } from '@testing-library/react-native'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useAuthStore } from '@/stores/auth'

describe('useProfileCompletion', () => {
  beforeEach(async () => { await useAuthStore.getState().__resetForTests() })

  it('advances forward but never backward', async () => {
    const { result } = renderHook(() => useProfileCompletion())
    // markStepComplete records completion of the step — furthestStep tracks the
    // most-advanced step the user has finished.
    await act(async () => { await result.current.markStepComplete('pc2') })
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc2')
    // completing an earlier step must not retreat from the current furthest.
    await act(async () => { await result.current.markStepComplete('pc1') })
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc2')
  })

  it('dismiss sets profileCompletion to "dismissed"', async () => {
    const { result } = renderHook(() => useProfileCompletion())
    await act(async () => { await result.current.dismiss() })
    expect(useAuthStore.getState().onboarding.profileCompletion).toBe('dismissed')
  })
})
