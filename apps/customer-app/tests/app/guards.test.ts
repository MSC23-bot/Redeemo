import { resolveRedirect } from '@/lib/routing'

type TestUser = Parameters<typeof resolveRedirect>[0]['user']

function user(overrides: Partial<NonNullable<TestUser>> = {}): NonNullable<TestUser> {
  return {
    emailVerified: true,
    phoneVerified: true,
    phone: '+447700900000',
    firstName: 'Ada',
    lastName: 'Lovelace',
    dateOfBirth: '1990-01-01',
    gender: 'female',
    postcode: 'SW1A 1AA',
    onboardingCompletedAt: '2026-04-23T00:00:00.000Z',
    subscriptionPromptSeenAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  }
}

describe('resolveRedirect', () => {
  it('sends unauthed user on (app) route to welcome', () => {
    expect(resolveRedirect({ status: 'unauthenticated', user: null, currentGroup: 'app' })).toBe('/(auth)/welcome')
  })

  it('sends fully onboarded user off (auth) to app', () => {
    expect(resolveRedirect({ status: 'authed', user: user(), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(app)')
  })

  it('forces email-unverified user to verify-email', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ emailVerified: false }), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/verify-email')
  })

  it('allows user to stay on verify-email when email is unverified', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ emailVerified: false }), currentGroup: 'auth', currentSegment: 'verify-email' })).toBeNull()
  })

  it('forces phone-unverified user to verify-phone', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ phoneVerified: false }), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/verify-phone')
  })

  it('routes user with missing phone to verify-phone (so they can enter a number)', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ phone: null, phoneVerified: false }), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/verify-phone')
  })

  // ── Regression: phone-unverified login flow ───────────────────────────────
  // Scenario: user registered, verified email, signed out before completing phone
  // OTP, then logged in again. Must land on verify-phone, not profile-completion.

  it('login screen: emailVerified=true + phoneVerified=false → verify-phone, not profile-completion', () => {
    // currentSegment is 'login' — this is where the user is right after the
    // login API call resolves and setTokens() sets status:'authed'.
    const target = resolveRedirect({
      status: 'authed',
      currentGroup: 'auth',
      currentSegment: 'login',
      user: user({
        phoneVerified: false,
        // Profile fields are incomplete (fresh registration, no onboarding done)
        dateOfBirth: null,
        gender: null,
        postcode: null,
        onboardingCompletedAt: null,
        subscriptionPromptSeenAt: null,
      }),
    })
    expect(target).toBe('/(auth)/verify-phone')
    expect(target).not.toBe('/(auth)/profile-completion/about')
  })

  it('phone check takes priority over profile-completion even when profile is incomplete', () => {
    // phoneVerified: false must short-circuit before the profile-completion check.
    const target = resolveRedirect({
      status: 'authed',
      currentGroup: 'auth',
      currentSegment: 'login',
      user: user({
        phoneVerified: false,
        dateOfBirth: null,    // would trigger profile-completion/about if phone were verified
        gender: null,
        postcode: null,
        onboardingCompletedAt: null,
        subscriptionPromptSeenAt: null,
      }),
    })
    expect(target).toBe('/(auth)/verify-phone')
  })

  it('once on verify-phone, phone-unverified user is allowed to stay (no redirect loop)', () => {
    expect(resolveRedirect({
      status: 'authed',
      currentGroup: 'auth',
      currentSegment: 'verify-phone',
      user: user({ phoneVerified: false }),
    })).toBeNull()
  })

  it('routes user missing PC1 required fields to profile-completion/about', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ dateOfBirth: null }), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/profile-completion/about')
  })

  it('routes user with PC1 complete but missing postcode to profile-completion/address', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ postcode: null }), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/profile-completion/address')
  })

  it('sends user who completed required fields but not onboarding-success to onboarding-success', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ onboardingCompletedAt: null }), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/onboarding-success')
  })

  it('sends user who completed onboarding but not subscription prompt to subscription-prompt', () => {
    expect(resolveRedirect({ status: 'authed', user: user({ subscriptionPromptSeenAt: null }), currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/subscription-prompt')
  })

  it('never redirects away from reset-password', () => {
    expect(resolveRedirect({ status: 'unauthenticated', user: null, currentGroup: 'auth', currentSegment: 'reset-password' })).toBeNull()
  })

  it('never redirects away from forgot-password', () => {
    expect(resolveRedirect({ status: 'unauthenticated', user: null, currentGroup: 'auth', currentSegment: 'forgot-password' })).toBeNull()
  })
})
