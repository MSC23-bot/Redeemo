import { getQueryClient, clearAllQueries } from '@/lib/query-client'

// Regression for PR A round-5 cross-user data leak. The auth store's
// signOut / clearLocalAuth / setTokens paths must wipe the React Query
// cache so user-scoped flags baked into responses (`isOwnReview`,
// `isFavourited`, `selectedBranch.myReview`, etc.) can't leak across
// logins.
//
// We test the query-client module directly — the auth-store wiring is
// covered separately by the auth store tests; this module is the
// contract those tests rely on.

describe('query-client clearAllQueries', () => {
  it('removes every cached query from the client', () => {
    const qc = getQueryClient()

    // Seed several caches that resemble real user-scoped data.
    qc.setQueryData(['merchantReviews', 'm1'], {
      reviews: [{ id: 'r1', isOwnReview: true, helpfulCount: 3 }],
      total: 1,
    })
    qc.setQueryData(['favouriteMerchants'], { merchants: [{ id: 'm1' }] })
    qc.setQueryData(['merchantProfile', 'm1', null, null], { id: 'm1', isFavourited: true })
    qc.setQueryData(['profile'], { id: 'u1', email: 'a@example.com' })

    // Pre-condition: caches exist.
    expect(qc.getQueryData(['merchantReviews', 'm1'])).toBeDefined()
    expect(qc.getQueryData(['favouriteMerchants'])).toBeDefined()
    expect(qc.getQueryData(['merchantProfile', 'm1', null, null])).toBeDefined()
    expect(qc.getQueryData(['profile'])).toBeDefined()

    // Trigger the clear (this is what auth-store.signOut now calls).
    clearAllQueries()

    // Post-condition: every cache is gone. A subsequent user logging in
    // can't see any of the prior user's data.
    expect(qc.getQueryData(['merchantReviews', 'm1'])).toBeUndefined()
    expect(qc.getQueryData(['favouriteMerchants'])).toBeUndefined()
    expect(qc.getQueryData(['merchantProfile', 'm1', null, null])).toBeUndefined()
    expect(qc.getQueryData(['profile'])).toBeUndefined()
  })

  it('is safe to call when no client has been instantiated yet', () => {
    // Defensive: if signOut fires before the layout has mounted (shouldn't
    // happen but better not to throw), clearAllQueries should be a no-op.
    // We can't easily reset the singleton from a test, so this is a smoke
    // check that it doesn't throw on the existing instance either way.
    expect(() => clearAllQueries()).not.toThrow()
  })
})
