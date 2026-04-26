jest.mock('@/lib/storage', () => ({
  secureStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
  prefsStorage: { get: jest.fn(async () => null), set: jest.fn(async () => {}), remove: jest.fn(async () => {}) },
}))
jest.mock('@/lib/api', () => ({ api: { setTokens: jest.fn(), onSessionExpired: jest.fn() }, setTokens: jest.fn() }))
jest.mock('@/lib/api/auth', () => ({ authApi: { logout: jest.fn(async () => ({ success: true })) } }))
jest.mock('@/lib/api/profile', () => ({
  profileApi: {
    getMe: jest.fn(),
    markOnboardingComplete: jest.fn(async () => ({ onboardingCompletedAt: '2026-04-26T00:00:00.000Z' })),
    markSubscriptionPromptSeen: jest.fn(),
  },
}))
jest.mock('@/design-system/haptics', () => ({ setHapticsEnabled: jest.fn(), haptics: {} }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }))

import { renderHook, act } from '@testing-library/react-native'
import { useProfileCompletion } from '@/features/profile-completion/hooks/useProfileCompletion'
import { useAuthStore } from '@/stores/auth'
import { profileApi } from '@/lib/api/profile'
import { router } from 'expo-router'

describe('useProfileCompletion', () => {
  beforeEach(async () => {
    await useAuthStore.getState().__resetForTests()
    jest.clearAllMocks()
  })

  it('advances forward but never backward', async () => {
    const { result } = renderHook(() => useProfileCompletion())
    // markStepComplete(pc2) advances to the NEXT step (pc3)
    await act(async () => { await result.current.markStepComplete('pc2') })
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc3')
    // completing an earlier step (pc1→pc2) must not retreat from pc3
    await act(async () => { await result.current.markStepComplete('pc1') })
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc3')
  })

  it('completing PC4 stamps onboardingCompletedAt and routes to onboarding-success', async () => {
    // Seed an authed user so markOnboardingCompleteNow has a user to update.
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
    })
    const { result } = renderHook(() => useProfileCompletion())
    await act(async () => { await result.current.markStepComplete('pc4') })
    expect(profileApi.markOnboardingComplete).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().onboarding.profileCompletion).toBe('completed')
    expect(router.replace).toHaveBeenCalledWith('/(auth)/onboarding-success')
  })

  it('dismiss stamps onboardingCompletedAt and routes to onboarding-success', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
    })
    const { result } = renderHook(() => useProfileCompletion())
    await act(async () => { await result.current.dismiss() })
    expect(profileApi.markOnboardingComplete).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().onboarding.profileCompletion).toBe('completed')
    expect(router.replace).toHaveBeenCalledWith('/(auth)/onboarding-success')
  })
})
