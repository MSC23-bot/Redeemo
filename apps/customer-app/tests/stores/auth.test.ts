jest.mock('@/lib/storage', () => ({
  secureStorage: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  },
  prefsStorage: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  },
}))
import { prefsStorage } from '@/lib/storage'
jest.mock('@/lib/api', () => ({
  api: { setTokens: jest.fn(), onSessionExpired: jest.fn() },
  setTokens: jest.fn(),
}))
jest.mock('@/lib/api/auth', () => ({
  authApi: { logout: jest.fn(async () => ({ success: true })) },
}))
jest.mock('@/lib/api/profile', () => ({
  profileApi: {
    getMe: jest.fn(),
    markOnboardingComplete: jest.fn(),
    markSubscriptionPromptSeen: jest.fn(),
  },
}))
jest.mock('@/design-system/haptics', () => ({
  setHapticsEnabled: jest.fn(),
  haptics: {},
}))

import { useAuthStore } from '@/stores/auth'
import { stepIndex } from '@/features/profile-completion/steps'
import { profileApi } from '@/lib/api/profile'

describe('auth store', () => {
  beforeEach(async () => {
    await useAuthStore.getState().__resetForTests()
  })

  it('starts in bootstrapping state before bootstrap has run', () => {
    expect(useAuthStore.getState().status).toBe('bootstrapping')
  })

  it('setTokens transitions to authed and persists minimal user', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: false, phoneVerified: false, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
    })
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user?.emailVerified).toBe(false)
  })

  it('syncVerificationState patches only provided fields', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: false, phoneVerified: false, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
    })
    await useAuthStore.getState().syncVerificationState({ emailVerified: true })
    expect(useAuthStore.getState().user?.emailVerified).toBe(true)
    expect(useAuthStore.getState().user?.phoneVerified).toBe(false)
  })

  it('advanceProfileStep only moves forward (monotonic)', async () => {
    await useAuthStore.getState().advanceProfileStep('pc3')
    await useAuthStore.getState().advanceProfileStep('pc1')
    expect(useAuthStore.getState().onboarding.furthestStep).toBe('pc3')
  })

  it('markProfileCompletion("dismissed") keeps user authed', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
    })
    await useAuthStore.getState().markProfileCompletion('dismissed')
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().onboarding.profileCompletion).toBe('dismissed')
  })

  it('stepIndex is used for comparison and orders pc1..done correctly', () => {
    expect(stepIndex('pc1')).toBeLessThan(stepIndex('pc3'))
    expect(stepIndex('pc4')).toBeLessThan(stepIndex('done'))
  })

  it('bootstrap restores hapticsEnabled from prefsStorage', async () => {
    ;(prefsStorage.get as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'redeemo:haptics') return false
      return null
    })
    await useAuthStore.getState().bootstrap()
    expect(useAuthStore.getState().hapticsEnabled).toBe(false)
    ;(prefsStorage.get as jest.Mock).mockImplementation(async () => null)
  })

  it('setHaptics persists to prefsStorage', () => {
    useAuthStore.getState().setHaptics(false)
    expect(prefsStorage.set).toHaveBeenCalledWith('redeemo:haptics', false)
  })

  it('markOnboardingCompleteNow stamps onboardingCompletedAt on the user', async () => {
    ;(profileApi.markOnboardingComplete as jest.Mock).mockResolvedValueOnce({
      onboardingCompletedAt: '2026-04-26T00:00:00.000Z',
    })
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
    })
    await useAuthStore.getState().markOnboardingCompleteNow()
    expect(profileApi.markOnboardingComplete).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user?.onboardingCompletedAt).toBe('2026-04-26T00:00:00.000Z')
  })

  it('markSubscriptionPromptSeenNow stamps subscriptionPromptSeenAt on the user', async () => {
    ;(profileApi.markSubscriptionPromptSeen as jest.Mock).mockResolvedValueOnce({
      subscriptionPromptSeenAt: '2026-04-26T00:05:00.000Z',
    })
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true, onboardingCompletedAt: '2026-04-26T00:00:00.000Z', subscriptionPromptSeenAt: null },
    })
    await useAuthStore.getState().markSubscriptionPromptSeenNow()
    expect(profileApi.markSubscriptionPromptSeen).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user?.subscriptionPromptSeenAt).toBe('2026-04-26T00:05:00.000Z')
  })

  it('clearLocalAuth transitions to unauthenticated and clears tokens without API call', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
    })
    await useAuthStore.getState().clearLocalAuth()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
