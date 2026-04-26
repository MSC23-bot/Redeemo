import { create } from 'zustand'
import { authApi } from '@/lib/api/auth'
import { profileApi } from '@/lib/api/profile'
import { prefsStorage, secureStorage } from '@/lib/storage'
import { setHapticsEnabled } from '@/design-system/haptics'
import { setTokens as apiSetTokens } from '@/lib/api'
import { stepIndex, type ProfileStep } from '@/features/profile-completion/steps'

export type AuthStatus = 'bootstrapping' | 'unauthenticated' | 'authed'

export type ProfileCompletionStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed'

export type OnboardingState = {
  profileCompletion: ProfileCompletionStatus
  furthestStep: ProfileStep
  phoneVerifiedAtLeastOnce: boolean
}

// Routing-relevant subset of the customer Profile. Source of truth for resolveRedirect.
// Kept separate from full Profile to avoid oversharing PII everywhere a component reads `user`.
export type MinimalUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  emailVerified: boolean
  phoneVerified: boolean
  dateOfBirth: string | null
  gender: string | null
  postcode: string | null
  onboardingCompletedAt: string | null
  subscriptionPromptSeenAt: string | null
}

type SetTokensInput = {
  accessToken: string
  refreshToken: string
  /** Optional bootstrap snapshot used only if /profile fetch fails. */
  user?: MinimalUser
}

type State = {
  status: AuthStatus
  user: MinimalUser | null
  accessToken: string | null
  refreshToken: string | null
  onboarding: OnboardingState
  hapticsEnabled: boolean
  motionScale: 0 | 1

  bootstrap: () => Promise<void>
  signOut: () => Promise<void>
  clearLocalAuth: () => Promise<void>
  syncVerificationState: (patch: Partial<Pick<MinimalUser, 'emailVerified' | 'phoneVerified'>>) => Promise<void>
  /** Refetch /profile and replace the MinimalUser — call after any profile mutation that changes routing-relevant fields. */
  refreshUser: () => Promise<void>
  setTokens: (input: SetTokensInput) => Promise<void>
  updateOnboarding: (patch: Partial<OnboardingState>) => Promise<void>
  advanceProfileStep: (step: ProfileStep) => Promise<void>
  markProfileCompletion: (status: ProfileCompletionStatus) => Promise<void>
  markPhoneVerifiedOnce: () => Promise<void>
  setHaptics: (enabled: boolean) => void
  setMotionScale: (scale: 0 | 1) => void
  __resetForTests: () => Promise<void>
}

const HAPTICS_KEY = 'redeemo:haptics'
const REDUCE_MOTION_KEY = 'redeemo:reduceMotion'

const INITIAL_ONBOARDING: OnboardingState = {
  profileCompletion: 'not_started',
  furthestStep: 'pc1',
  phoneVerifiedAtLeastOnce: false,
}

const ONBOARDING_KEY = (userId: string) => `onboarding-state:${userId}`

async function loadOnboarding(userId: string): Promise<OnboardingState> {
  const saved = await prefsStorage.get<OnboardingState>(ONBOARDING_KEY(userId))
  return saved ?? INITIAL_ONBOARDING
}

async function persistOnboarding(userId: string | undefined, state: OnboardingState): Promise<void> {
  if (!userId) return
  await prefsStorage.set(ONBOARDING_KEY(userId), state)
}

export const useAuthStore = create<State>((set, get) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  refreshToken: null,
  onboarding: INITIAL_ONBOARDING,
  hapticsEnabled: true,
  motionScale: 1,

  async bootstrap() {
    // Restore persisted prefs (haptics + motion) before the auth check
    try {
      const [savedHaptics, savedReduceMotion] = await Promise.all([
        prefsStorage.get<boolean>(HAPTICS_KEY),
        prefsStorage.get<boolean>(REDUCE_MOTION_KEY),
      ])
      const hapticsEnabled = savedHaptics ?? true
      const motionScale: 0 | 1 = savedReduceMotion === true ? 0 : 1
      setHapticsEnabled(hapticsEnabled)
      set({ hapticsEnabled, motionScale })
    } catch { /* best-effort */ }

    const [access, refresh] = await Promise.all([
      secureStorage.get('accessToken'),
      secureStorage.get('refreshToken'),
    ])
    if (!access || !refresh) {
      set({ status: 'unauthenticated' })
      return
    }
    apiSetTokens({ accessToken: access, refreshToken: refresh })
    try {
      const me = await profileApi.getMe()
      const minimal: MinimalUser = {
        id: me.id,
        email: me.email,
        firstName: me.firstName ?? '',
        lastName: me.lastName ?? '',
        phone: me.phone ?? '',
        emailVerified: me.emailVerified,
        phoneVerified: me.phoneVerified,
        dateOfBirth: me.dateOfBirth,
        gender: me.gender,
        postcode: me.postcode,
        onboardingCompletedAt: me.onboardingCompletedAt,
        subscriptionPromptSeenAt: me.subscriptionPromptSeenAt,
      }
      const onboarding = await loadOnboarding(me.id)
      set({ status: 'authed', user: minimal, accessToken: access, refreshToken: refresh, onboarding })
    } catch {
      apiSetTokens({ accessToken: null, refreshToken: null })
      await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
      set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null })
    }
  },

  async signOut() {
    const refresh = get().refreshToken
    if (refresh) {
      // Fire-and-forget: local state clears unconditionally even if the API call fails
      void authApi.logout({ refreshToken: refresh }).catch(() => {})
    }
    await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
    apiSetTokens({ accessToken: null, refreshToken: null })
    set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, onboarding: INITIAL_ONBOARDING })
  },

  async clearLocalAuth() {
    await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
    apiSetTokens({ accessToken: null, refreshToken: null })
    set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, onboarding: INITIAL_ONBOARDING })
  },

  async syncVerificationState(patch) {
    const current = get().user
    if (!current) return
    set({ user: { ...current, ...patch } })
  },

  async refreshUser() {
    if (get().status !== 'authed') return
    try {
      const me = await profileApi.getMe()
      const minimal: MinimalUser = {
        id: me.id,
        email: me.email,
        firstName: me.firstName ?? '',
        lastName: me.lastName ?? '',
        phone: me.phone ?? '',
        emailVerified: me.emailVerified,
        phoneVerified: me.phoneVerified,
        dateOfBirth: me.dateOfBirth,
        gender: me.gender,
        postcode: me.postcode,
        onboardingCompletedAt: me.onboardingCompletedAt,
        subscriptionPromptSeenAt: me.subscriptionPromptSeenAt,
      }
      set({ user: minimal })
    } catch { /* best-effort — stale user remains until next bootstrap */ }
  },

  async setTokens({ accessToken, refreshToken, user }) {
    await secureStorage.set('accessToken', accessToken)
    await secureStorage.set('refreshToken', refreshToken)
    apiSetTokens({ accessToken, refreshToken })
    // Fetch full profile so resolveRedirect has server-authoritative flags
    // (emailVerified / phoneVerified / onboardingCompletedAt / required profile fields).
    // Falls back to the snapshot from register/login response if /profile fails.
    let minimal: MinimalUser | null = null
    try {
      const me = await profileApi.getMe()
      minimal = {
        id: me.id,
        email: me.email,
        firstName: me.firstName ?? '',
        lastName: me.lastName ?? '',
        phone: me.phone ?? '',
        emailVerified: me.emailVerified,
        phoneVerified: me.phoneVerified,
        dateOfBirth: me.dateOfBirth,
        gender: me.gender,
        postcode: me.postcode,
        onboardingCompletedAt: me.onboardingCompletedAt,
        subscriptionPromptSeenAt: me.subscriptionPromptSeenAt,
      }
    } catch {
      if (user) minimal = user
    }
    if (!minimal) {
      throw new Error('Failed to load profile after authentication')
    }
    const onboarding = await loadOnboarding(minimal.id)
    set({ status: 'authed', user: minimal, accessToken, refreshToken, onboarding })
  },

  async updateOnboarding(patch) {
    const next = { ...get().onboarding, ...patch }
    set({ onboarding: next })
    await persistOnboarding(get().user?.id, next)
  },

  async advanceProfileStep(step) {
    const prev = get().onboarding
    const prevIdx = stepIndex(prev.furthestStep)
    const nextIdx = stepIndex(step)
    const furthestStep: ProfileStep = nextIdx > prevIdx ? step : prev.furthestStep
    const profileCompletion: ProfileCompletionStatus =
      prev.profileCompletion === 'completed' || prev.profileCompletion === 'dismissed'
        ? prev.profileCompletion
        : 'in_progress'
    await get().updateOnboarding({ furthestStep, profileCompletion })
  },

  async markProfileCompletion(status) {
    await get().updateOnboarding({ profileCompletion: status })
  },

  async markPhoneVerifiedOnce() {
    await get().updateOnboarding({ phoneVerifiedAtLeastOnce: true })
  },

  setHaptics(enabled) {
    setHapticsEnabled(enabled)
    set({ hapticsEnabled: enabled })
    void prefsStorage.set(HAPTICS_KEY, enabled).catch(() => {})
  },

  setMotionScale(scale) {
    set({ motionScale: scale })
    void prefsStorage.set(REDUCE_MOTION_KEY, scale === 0).catch(() => {})
  },

  async __resetForTests() {
    await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
    apiSetTokens({ accessToken: null, refreshToken: null })
    set({ status: 'bootstrapping', user: null, accessToken: null, refreshToken: null, onboarding: INITIAL_ONBOARDING, hapticsEnabled: true, motionScale: 1 })
  },
}))

export type { ProfileStep }
