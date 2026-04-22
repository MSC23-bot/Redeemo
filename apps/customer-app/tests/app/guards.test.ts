import { resolveRedirect } from '@/lib/routing'

describe('resolveRedirect', () => {
  it('sends unauthed user on (app) route to welcome', () => {
    expect(resolveRedirect({ status: 'unauthenticated', onboarding: null, user: null, currentGroup: 'app' })).toBe('/(auth)/welcome')
  })
  it('sends authed+completed user off (auth) to app', () => {
    expect(resolveRedirect({ status: 'authed', onboarding: { profileCompletion: 'completed', furthestStep: 'done', phoneVerifiedAtLeastOnce: true }, user: { emailVerified: true, phoneVerified: true }, currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(app)')
  })
  it('forces email-unverified user to verify-email', () => {
    expect(resolveRedirect({ status: 'authed', onboarding: { profileCompletion: 'in_progress', furthestStep: 'pc1', phoneVerifiedAtLeastOnce: false }, user: { emailVerified: false, phoneVerified: false }, currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/verify-email')
  })
  it('never redirects away from reset-password', () => {
    expect(resolveRedirect({ status: 'unauthenticated', onboarding: null, user: null, currentGroup: 'auth', currentSegment: 'reset-password' })).toBeNull()
  })
  it('sends in-progress profile to correct step', () => {
    expect(resolveRedirect({ status: 'authed', onboarding: { profileCompletion: 'in_progress', furthestStep: 'pc2', phoneVerifiedAtLeastOnce: true }, user: { emailVerified: true, phoneVerified: true }, currentGroup: 'auth', currentSegment: 'welcome' })).toBe('/(auth)/profile-completion/address')
  })
})
