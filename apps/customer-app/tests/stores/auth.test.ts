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
  profileApi: { getMe: jest.fn() },
}))
jest.mock('@/design-system/haptics', () => ({
  setHapticsEnabled: jest.fn(),
  haptics: {},
}))

import { useAuthStore } from '@/stores/auth'
import { profileApi } from '@/lib/api/profile'
import { stepIndex } from '@/features/profile-completion/steps'

function profileFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'u1',
    email: 'a@x.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+44',
    profileImageUrl: null,
    dateOfBirth: null,
    gender: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postcode: null,
    newsletterConsent: false,
    emailVerified: false,
    phoneVerified: false,
    onboardingCompletedAt: null,
    subscriptionPromptSeenAt: null,
    interests: [],
    profileCompleteness: 0,
    createdAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  }
}

describe('auth store', () => {
  beforeEach(async () => {
    ;(profileApi.getMe as jest.Mock).mockResolvedValue(profileFixture())
    await useAuthStore.getState().__resetForTests()
  })

  it('starts in bootstrapping state before bootstrap has run', () => {
    expect(useAuthStore.getState().status).toBe('bootstrapping')
  })

  it('setTokens transitions to authed and persists minimal user', async () => {
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' })
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user?.emailVerified).toBe(false)
  })

  // Regression: after login, phoneVerified must come from /profile (server truth),
  // not from any cached local state. Verifies the setTokens → getMe() → store
  // hydration path that resolveRedirect depends on for the verify-phone redirect.
  it('setTokens hydrates phoneVerified:false from /profile — no local cache can override', async () => {
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce(
      profileFixture({ emailVerified: true, phoneVerified: false }),
    )
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' })
    const { status, user } = useAuthStore.getState()
    expect(status).toBe('authed')
    expect(user?.emailVerified).toBe(true)
    expect(user?.phoneVerified).toBe(false)   // must NOT be coerced to true
  })

  it('signOut clears user so a subsequent setTokens always re-hydrates from /profile', async () => {
    // Step 1: log in with phoneVerified:true (simulates a previous verified session)
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce(
      profileFixture({ emailVerified: true, phoneVerified: true }),
    )
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' })
    expect(useAuthStore.getState().user?.phoneVerified).toBe(true)

    // Step 2: sign out — store must be fully cleared
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')

    // Step 3: log in again with phoneVerified:false (phone was never completed)
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce(
      profileFixture({ emailVerified: true, phoneVerified: false }),
    )
    await useAuthStore.getState().setTokens({ accessToken: 'b', refreshToken: 'r2' })
    expect(useAuthStore.getState().user?.phoneVerified).toBe(false)
  })

  it('syncVerificationState patches only provided fields', async () => {
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' })
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
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce(profileFixture({ emailVerified: true, phoneVerified: true }))
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' })
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

  it('clearLocalAuth transitions to unauthenticated and clears tokens without API call', async () => {
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce(profileFixture({ emailVerified: true, phoneVerified: true }))
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' })
    await useAuthStore.getState().clearLocalAuth()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })
})
