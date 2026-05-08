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
    // Reset per-test so secureStorage.get / prefsStorage.get from prior
    // tests doesn't leak into the next.
    const { secureStorage, prefsStorage: prefs } = jest.requireMock('@/lib/storage') as {
      secureStorage: { get: jest.Mock; set: jest.Mock; remove: jest.Mock }
      prefsStorage:  { get: jest.Mock; set: jest.Mock; remove: jest.Mock }
    }
    secureStorage.get.mockImplementation(async () => null)
    prefs.get.mockImplementation(async () => null)
    await useAuthStore.getState().__resetForTests()
  })

  it('starts in bootstrapping state before bootstrap has run', () => {
    expect(useAuthStore.getState().status).toBe('bootstrapping')
  })

  it('setTokens transitions to authed and persists minimal user', async () => {
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r', sessionId: 'sess_a', entityId: 'u1' })
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
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r', sessionId: 'sess_a', entityId: 'u1' })
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
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r', sessionId: 'sess_a', entityId: 'u1' })
    expect(useAuthStore.getState().user?.phoneVerified).toBe(true)

    // Step 2: sign out — store must be fully cleared
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().status).toBe('unauthenticated')

    // Step 3: log in again with phoneVerified:false (phone was never completed)
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce(
      profileFixture({ emailVerified: true, phoneVerified: false }),
    )
    await useAuthStore.getState().setTokens({ accessToken: 'b', refreshToken: 'r2', sessionId: 'sess_b', entityId: 'u1' })
    expect(useAuthStore.getState().user?.phoneVerified).toBe(false)
  })

  it('syncVerificationState patches only provided fields', async () => {
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r', sessionId: 'sess_a', entityId: 'u1' })
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
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r', sessionId: 'sess_a', entityId: 'u1' })
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
    await useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r', sessionId: 'sess_a', entityId: 'u1' })
    await useAuthStore.getState().clearLocalAuth()
    expect(useAuthStore.getState().status).toBe('unauthenticated')
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
  })

  // Hotfix migration: pre-fix builds (≤ 2026-05-08) persisted only
  // accessToken + refreshToken to secureStorage. Existing-build users
  // upgrading to the fix have those two keys but no sessionId / entityId.
  // Bootstrap MUST treat that state as forced sign-out so the next sign-in
  // re-populates the full set, instead of attempting a refresh with a
  // partial body (which is the exact bug we're closing).
  it('bootstrap forces sign-out when sessionId is missing from secureStorage (pre-fix migration)', async () => {
    const { secureStorage } = jest.requireMock('@/lib/storage') as {
      secureStorage: { get: jest.Mock; remove: jest.Mock }
    }
    secureStorage.get.mockImplementation(async (key: string) => {
      if (key === 'accessToken')  return 'old_access'
      if (key === 'refreshToken') return 'old_refresh'
      // sessionId and entityId — pre-fix build never wrote these
      return null
    })

    await useAuthStore.getState().bootstrap()

    expect(useAuthStore.getState().status).toBe('unauthenticated')
    // The stale tokens must be wiped so they can't be reused mid-session
    expect(secureStorage.remove).toHaveBeenCalledWith('accessToken')
    expect(secureStorage.remove).toHaveBeenCalledWith('refreshToken')
    expect(secureStorage.remove).toHaveBeenCalledWith('sessionId')
    expect(secureStorage.remove).toHaveBeenCalledWith('entityId')
  })

  it('bootstrap restores authed state when all four tokens are present', async () => {
    const { secureStorage } = jest.requireMock('@/lib/storage') as {
      secureStorage: { get: jest.Mock; remove: jest.Mock }
    }
    secureStorage.get.mockImplementation(async (key: string) => {
      if (key === 'accessToken')  return 'a'
      if (key === 'refreshToken') return 'r'
      if (key === 'sessionId')    return 'sess_x'
      if (key === 'entityId')     return 'u1'
      return null
    })
    ;(profileApi.getMe as jest.Mock).mockResolvedValueOnce(profileFixture())

    await useAuthStore.getState().bootstrap()

    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user?.id).toBe('u1')
  })
})
