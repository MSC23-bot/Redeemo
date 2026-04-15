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
import { stepIndex } from '@/features/profile-completion/steps'

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
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: false, phoneVerified: false },
    })
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().user?.emailVerified).toBe(false)
  })

  it('syncVerificationState patches only provided fields', async () => {
    await useAuthStore.getState().setTokens({
      accessToken: 'a', refreshToken: 'r',
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: false, phoneVerified: false },
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
      user: { id: 'u1', email: 'a@x.com', firstName: 'Ada', phone: '+44', emailVerified: true, phoneVerified: true },
    })
    await useAuthStore.getState().markProfileCompletion('dismissed')
    expect(useAuthStore.getState().status).toBe('authed')
    expect(useAuthStore.getState().onboarding.profileCompletion).toBe('dismissed')
  })

  it('stepIndex is used for comparison and orders pc1..done correctly', () => {
    expect(stepIndex('pc1')).toBeLessThan(stepIndex('pc3'))
    expect(stepIndex('pc4')).toBeLessThan(stepIndex('done'))
  })
})
