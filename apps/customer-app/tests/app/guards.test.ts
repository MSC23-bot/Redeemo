import { resolveRedirect } from '@/lib/routing'

const completedOnboarding = {
  profileCompletion: 'completed' as const,
  furthestStep: 'done' as const,
  phoneVerifiedAtLeastOnce: true,
}

const verifiedUser = {
  emailVerified: true,
  phoneVerified: true,
  onboardingCompletedAt: '2026-04-26T00:00:00.000Z',
  subscriptionPromptSeenAt: '2026-04-26T00:00:00.000Z',
}

describe('resolveRedirect', () => {
  it('sends unauthed user on (app) route to welcome', () => {
    expect(
      resolveRedirect({ status: 'unauthenticated', onboarding: null, user: null, currentGroup: 'app' }),
    ).toBe('/(auth)/welcome')
  })

  it('sends fully onboarded user off (auth) to app', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: completedOnboarding,
        user: verifiedUser,
        currentGroup: 'auth',
        currentSegment: 'welcome',
      }),
    ).toBe('/(app)')
  })

  it('forces email-unverified user to verify-email', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: { profileCompletion: 'in_progress', furthestStep: 'pc1', phoneVerifiedAtLeastOnce: false },
        user: { ...verifiedUser, emailVerified: false, phoneVerified: false },
        currentGroup: 'auth',
        currentSegment: 'welcome',
      }),
    ).toBe('/(auth)/verify-email')
  })

  it('never redirects away from reset-password', () => {
    expect(
      resolveRedirect({
        status: 'unauthenticated',
        onboarding: null,
        user: null,
        currentGroup: 'auth',
        currentSegment: 'reset-password',
      }),
    ).toBeNull()
  })

  it('sends in-progress profile to correct step', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: { profileCompletion: 'in_progress', furthestStep: 'pc2', phoneVerifiedAtLeastOnce: true },
        user: { ...verifiedUser, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
        currentGroup: 'auth',
        currentSegment: 'welcome',
      }),
    ).toBe('/(auth)/profile-completion/address')
  })

  // ── Server-flag rules (locked spec §8 rules 6 + 7) ────────────────────────

  it('routes locally-completed user with null onboardingCompletedAt to onboarding-success', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: completedOnboarding,
        user: { ...verifiedUser, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
        currentGroup: 'auth',
        currentSegment: 'welcome',
      }),
    ).toBe('/(auth)/onboarding-success')
  })

  it('does NOT redirect away from onboarding-success when already there', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: completedOnboarding,
        user: { ...verifiedUser, onboardingCompletedAt: null, subscriptionPromptSeenAt: null },
        currentGroup: 'auth',
        currentSegment: 'onboarding-success',
      }),
    ).toBeNull()
  })

  it('routes onboarded user with null subscriptionPromptSeenAt to subscription-prompt', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: completedOnboarding,
        user: { ...verifiedUser, subscriptionPromptSeenAt: null },
        currentGroup: 'auth',
        currentSegment: 'welcome',
      }),
    ).toBe('/(auth)/subscription-prompt')
  })

  it('does NOT redirect away from subscription-prompt when already there', () => {
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: completedOnboarding,
        user: { ...verifiedUser, subscriptionPromptSeenAt: null },
        currentGroup: 'auth',
        currentSegment: 'subscription-prompt',
      }),
    ).toBeNull()
  })

  // ── Reinstall scenario (server profileCompleteness drives store rehydration) ─

  it('reinstall with empty local onboarding + verified user with stamped server flags lands on /(app)', () => {
    // Locked behaviour: useLoginFlow re-marks profileCompletion = "completed"
    // when /profile reports profileCompleteness >= 100. Once the store is
    // rehydrated, resolveRedirect should NOT bounce the user back through PC.
    expect(
      resolveRedirect({
        status: 'authed',
        onboarding: completedOnboarding, // hydrated post-login
        user: verifiedUser,
        currentGroup: 'auth',
        currentSegment: 'welcome',
      }),
    ).toBe('/(app)')
  })
})
