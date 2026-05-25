import { create } from 'zustand'
import { authApi } from '@/lib/api/auth'
import { profileApi } from '@/lib/api/profile'
import { prefsStorage, secureStorage } from '@/lib/storage'
import { setHapticsEnabled } from '@/design-system/haptics'
import { api as apiClient, setTokens as apiSetTokens } from '@/lib/api'
import { clearAllQueries } from '@/lib/query-client'
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
  // §DF — saved-postcode coordinates + richer
  // locality block, mirrored into the auth-store snapshot so surfaces
  // that read `useAuthStore((s) => s.user)` (Profile, Map locate-me
  // fallback) see them without an extra /profile fetch.
  latitude: number | null
  longitude: number | null
  locality: { id: string; name: string; postTown: string | null; region: string | null } | null
  onboardingCompletedAt: string | null
  subscriptionPromptSeenAt: string | null
}

type SetTokensInput = {
  accessToken:  string
  refreshToken: string
  // Required as of 2026-05-08 — the customer-app's /auth/refresh client
  // posts `{ refreshToken, sessionId, entityId }` per the backend
  // contract. `sessionId` comes from the auth response;
  // `entityId === user.id`.
  sessionId:    string
  entityId:     string
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

    const [access, refresh, sessionId, entityId] = await Promise.all([
      secureStorage.get('accessToken'),
      secureStorage.get('refreshToken'),
      secureStorage.get('sessionId'),
      secureStorage.get('entityId'),
    ])
    // Hotfix migration (2026-05-08): pre-fix builds persisted only
    // accessToken + refreshToken. Any user upgrading from such a build
    // will be missing sessionId / entityId — treat as forced sign-out
    // so the next sign-in re-populates the full set. One-time UX cost.
    if (!access || !refresh || !sessionId || !entityId) {
      await Promise.all([
        secureStorage.remove('accessToken'),
        secureStorage.remove('refreshToken'),
        secureStorage.remove('sessionId'),
        secureStorage.remove('entityId'),
      ])
      set({ status: 'unauthenticated' })
      return
    }
    apiSetTokens({ accessToken: access, refreshToken: refresh, sessionId, entityId })
    // Populate the store-level token fields BEFORE the profile fetch so
    // a rotation that fires inside `profileApi.getMe()` (a 401 → refresh
    // round-trip when the access token has expired across an extended
    // close) can update them via the module-init persistence handler.
    // The final `set(...)` after profile success deliberately omits
    // accessToken/refreshToken so it cannot clobber a fresh rotation
    // that happened mid-flight. The api module is the source of truth
    // for outgoing-request bearer tokens; the store-level fields are
    // mirrored state for any UI that reads them.
    set({ accessToken: access, refreshToken: refresh })
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
        latitude: me.latitude,
        longitude: me.longitude,
        locality: me.locality,
        onboardingCompletedAt: me.onboardingCompletedAt,
        subscriptionPromptSeenAt: me.subscriptionPromptSeenAt,
      }
      const onboarding = await loadOnboarding(me.id)
      set({ status: 'authed', user: minimal, onboarding })
    } catch {
      // Bootstrap failure → treat as a forced sign-out so any cached data
      // from a prior session can't leak. See `clearAllQueries` doc comment.
      apiSetTokens({ accessToken: null, refreshToken: null, sessionId: null, entityId: null })
      await Promise.all([
        secureStorage.remove('accessToken'),
        secureStorage.remove('refreshToken'),
        secureStorage.remove('sessionId'),
        secureStorage.remove('entityId'),
      ])
      clearAllQueries()
      set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null })
    }
  },

  async signOut() {
    const refresh = get().refreshToken
    if (refresh) {
      // Fire-and-forget: local state clears unconditionally even if the API call fails
      void authApi.logout({ refreshToken: refresh }).catch(() => {})
    }
    await Promise.all([
      secureStorage.remove('accessToken'),
      secureStorage.remove('refreshToken'),
      secureStorage.remove('sessionId'),
      secureStorage.remove('entityId'),
    ])
    apiSetTokens({ accessToken: null, refreshToken: null, sessionId: null, entityId: null })
    // CRITICAL: wipe the React Query cache before flipping auth state. Reviews,
    // favourites, profile, savings and any other user-scoped resources bake the
    // current user's identity into their payload (`isOwnReview`, `isFavourited`,
    // `myReview`, etc.). Without clearing, the next user briefly sees the
    // previous user's cached data — including their own-review flag, which
    // makes someone else's review look editable. (Discovered 2026-05-02 QA.)
    clearAllQueries()
    set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, onboarding: INITIAL_ONBOARDING })
  },

  async clearLocalAuth() {
    await Promise.all([
      secureStorage.remove('accessToken'),
      secureStorage.remove('refreshToken'),
      secureStorage.remove('sessionId'),
      secureStorage.remove('entityId'),
    ])
    apiSetTokens({ accessToken: null, refreshToken: null, sessionId: null, entityId: null })
    // Same reasoning as signOut — see comment there. This path runs when the
    // API client gets a 401 it couldn't refresh (forced session expiry).
    clearAllQueries()
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
        latitude: me.latitude,
        longitude: me.longitude,
        locality: me.locality,
        onboardingCompletedAt: me.onboardingCompletedAt,
        subscriptionPromptSeenAt: me.subscriptionPromptSeenAt,
      }
      set({ user: minimal })
    } catch { /* best-effort — stale user remains until next bootstrap */ }
  },

  async setTokens({ accessToken, refreshToken, sessionId, entityId, user }) {
    // Clear any cached query data BEFORE installing the new session. This is
    // belt-and-braces — signOut + clearLocalAuth already clear, and the
    // normal login flow goes through one of those first. But if a fresh
    // login is somehow triggered without an explicit sign-out (e.g. a deep
    // link that lands on auth-success), this guarantees the new user starts
    // with an empty cache. Cost: zero — the cache is already meant to be
    // empty at this point in any well-formed flow.
    clearAllQueries()
    await Promise.all([
      secureStorage.set('accessToken',  accessToken),
      secureStorage.set('refreshToken', refreshToken),
      secureStorage.set('sessionId',    sessionId),
      secureStorage.set('entityId',     entityId),
    ])
    apiSetTokens({ accessToken, refreshToken, sessionId, entityId })
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
        latitude: me.latitude,
        longitude: me.longitude,
        locality: me.locality,
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
    await Promise.all([
      secureStorage.remove('accessToken'),
      secureStorage.remove('refreshToken'),
      secureStorage.remove('sessionId'),
      secureStorage.remove('entityId'),
    ])
    apiSetTokens({ accessToken: null, refreshToken: null, sessionId: null, entityId: null })
    set({ status: 'bootstrapping', user: null, accessToken: null, refreshToken: null, onboarding: INITIAL_ONBOARDING, hapticsEnabled: true, motionScale: 1 })
  },
}))

// Persist rotated access + refresh tokens at module-init time so the
// handler is registered BEFORE `bootstrap()` runs and BEFORE any React
// tree mounts. Bootstrap calls `profileApi.getMe()` immediately after
// installing the stored tokens; if the access token has expired (e.g.
// the user closed the app for >15 minutes) that call triggers a 401 →
// refresh round-trip → token rotation. The rotation must be captured
// even though the splash screen is still rendering — i.e. before any
// React-mounted bridge could exist. Earlier shipped a
// `TokensPersistenceBridge` component, but its useEffect only ran once
// the auth status flipped off `'bootstrapping'`, leaving a window
// where bootstrap-time rotations were not persisted. PR #50 second-
// review fix: shape #3 — auth store owns the path directly.
//
// The handler runs synchronously to mirror state into zustand, then
// schedules secureStorage writes asynchronously. Persistence errors
// are swallowed (best-effort) so they cannot wedge any caller. Single-
// subscriber by api-module design — calling `apiClient.onTokensRefreshed`
// again replaces this handler, which is fine for tests that swap it.
apiClient.onTokensRefreshed(({ accessToken, refreshToken }) => {
  useAuthStore.setState({ accessToken, refreshToken })
  void Promise.all([
    secureStorage.set('accessToken',  accessToken),
    secureStorage.set('refreshToken', refreshToken),
  ]).catch(() => {
    /* swallow — best-effort persistence */
  })
})

export type { ProfileStep }
