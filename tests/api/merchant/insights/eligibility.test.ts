import { describe, it, expect } from 'vitest'
import { Prisma } from '../../../../generated/prisma/client'
import {
  buildQaEmailExclusionSql,
  buildBranchScopeSql,
  buildEligibilityWhereSql,
  ELIGIBILITY_ALIASES,
} from '../../../../src/api/merchant/insights/eligibility'
import {
  QA_ACCOUNT_EMAILS,
  QA_ACCOUNT_EMAIL_DOMAINS,
} from '../../../../src/api/customer/discovery/qaAccountFilter'

// Foundation-stage unit tests (Insights PR-A Task A3; spec 4.1, 4.4). These
// assert the COMPOSED Prisma.Sql fragment text + params. NO DB, no routes, no
// query execution. The real-DB count/mutation test (neuter a clause -> a
// fixture-count test fails) is DEFERRED to the A4/A7 integration stage where the
// fragment is composed into a real $queryRaw against a seeded dataset.

// A small helper: a Prisma.Sql fragment exposes `.text` (with $1,$2... numbered
// placeholders) and `.values` (the parameter array). We compose the fragment
// into a tiny SELECT so the placeholder numbering is realised exactly as A4 will
// see it (Prisma.sql renumbers placeholders only at composition time).
function render(fragment: Prisma.Sql): { text: string; values: unknown[] } {
  const composed = Prisma.sql`SELECT 1 WHERE ${fragment}`
  return { text: composed.text, values: composed.values }
}

describe('buildQaEmailExclusionSql', () => {
  it('case-folds BOTH sides: LOWER(<email>) on the column and lowercased QA emails as params', () => {
    const { text, values } = render(buildQaEmailExclusionSql('u.email'))
    // Column side is case-folded.
    expect(text).toContain('LOWER(u.email) NOT IN')
    // Each configured QA email is a PARAMETER (lowercased), never an inlined literal.
    for (const email of QA_ACCOUNT_EMAILS) {
      expect(values).toContain(email.toLowerCase())
      // Defensive: the raw (cased) email must not appear inline in the SQL text.
      expect(text).not.toContain(email)
    }
    // The placeholder count for the NOT IN list matches the number of QA emails.
    const inListMatch = text.match(/NOT IN \(([^)]*)\)/)
    expect(inListMatch).not.toBeNull()
    const placeholders = (inListMatch![1].match(/\$\d+/g) ?? [])
    expect(placeholders.length).toBe(QA_ACCOUNT_EMAILS.length)
  })

  it('includes a domain NOT LIKE clause for each QA email domain, case-folded on both sides', () => {
    const { text } = render(buildQaEmailExclusionSql('u.email'))
    for (const domain of QA_ACCOUNT_EMAIL_DOMAINS) {
      // Domain suffix exclusion, case-folded column side, lowercased compile-time domain.
      expect(text).toContain(`LOWER(u.email) NOT LIKE '%@${domain.toLowerCase()}'`)
    }
  })

  it('does not interpolate the email column expression as a parameter (it is a SQL identifier, not user input)', () => {
    const { text, values } = render(buildQaEmailExclusionSql('redemption_user.email'))
    expect(text).toContain('LOWER(redemption_user.email) NOT IN')
    // The column expression is embedded as raw SQL, not pushed into the params array.
    expect(values).not.toContain('redemption_user.email')
  })

  it('empty exact-email list yields a TRUE identity (no accidental NOT IN () exclusion)', () => {
    const { text, values } = render(buildQaEmailExclusionSql('u.email', { emails: [], domains: ['redeemo.dev'] }))
    // No NOT IN clause at all when the email list is empty.
    expect(text).not.toContain('NOT IN')
    // A TRUE identity stands in for the absent exact-email clause.
    expect(text).toContain('TRUE')
    // Only the domain clause survives.
    expect(text).toContain(`LOWER(u.email) NOT LIKE '%@redeemo.dev'`)
    expect(values).toEqual([])
  })

  it('empty domain list yields a TRUE identity for the domain side (no accidental empty-AND)', () => {
    const { text, values } = render(buildQaEmailExclusionSql('u.email', { emails: ['qa@redeemo.com'], domains: [] }))
    expect(text).toContain('LOWER(u.email) NOT IN')
    expect(text).not.toContain('NOT LIKE')
    expect(text).toContain('TRUE')
    expect(values).toContain('qa@redeemo.com')
  })

  it('both lists empty -> a pure TRUE identity (predicate never narrows or widens)', () => {
    const { text, values } = render(buildQaEmailExclusionSql('u.email', { emails: [], domains: [] }))
    expect(text).not.toContain('NOT IN')
    expect(text).not.toContain('NOT LIKE')
    expect(text).toContain('TRUE')
    expect(values).toEqual([])
  })

  it('defaults to the real QA_ACCOUNT_EMAILS / QA_ACCOUNT_EMAIL_DOMAINS constants (no hardcoded duplicates)', () => {
    const { values } = render(buildQaEmailExclusionSql('u.email'))
    // Reuses the imported constants: every default value is one of the lowercased QA emails.
    const expected = QA_ACCOUNT_EMAILS.map((e) => e.toLowerCase())
    expect(values).toEqual(expected)
  })
})

describe('buildBranchScopeSql', () => {
  it('null scope -> no extra branch filter (empty fragment, no params, all merchant branches)', () => {
    const fragment = buildBranchScopeSql('b', null)
    expect(fragment.values).toEqual([])
    expect(fragment.strings.join('')).toBe('')
  })

  it('non-empty scope -> branch id IN (...) with the ids as PARAMETERS, not interpolated literals', () => {
    const ids = ['branch-aaa', 'branch-bbb']
    const { text, values } = render(buildBranchScopeSql('b', ids))
    expect(text).toContain('b.id IN')
    // Each branch id is a parameter, not inlined in the SQL text.
    for (const id of ids) {
      expect(values).toContain(id)
      expect(text).not.toContain(id)
    }
    // Exactly one placeholder per id.
    const inListMatch = text.match(/IN \(([^)]*)\)/)
    expect(inListMatch).not.toBeNull()
    const placeholders = (inListMatch![1].match(/\$\d+/g) ?? [])
    expect(placeholders.length).toBe(ids.length)
  })

  it('empty scope ([]) -> a fail-closed FALSE clause (no rows), never an absent filter', () => {
    const { text, values } = render(buildBranchScopeSql('b', []))
    expect(text).toContain('FALSE')
    // Fail-closed must NOT degrade to an absent filter or a TRUE identity.
    expect(text).not.toContain('TRUE')
    expect(text).not.toContain('IN (')
    expect(values).toEqual([])
  })

  it('honours the branch alias (uses the passed table alias for the id column)', () => {
    const { text } = render(buildBranchScopeSql('redemption_branch', ['x']))
    expect(text).toContain('redemption_branch.id IN')
  })
})

describe('buildEligibilityWhereSql', () => {
  it('exports the default aliases used across the module', () => {
    expect(ELIGIBILITY_ALIASES.redemption).toBe('r')
    expect(ELIGIBILITY_ALIASES.branch).toBe('b')
    expect(ELIGIBILITY_ALIASES.user).toBe('u')
    expect(ELIGIBILITY_ALIASES.merchant).toBe('m')
  })

  it('includes ALL eligible-row conditions from spec 4.1 / 4.4', () => {
    const { text } = render(buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: null }))
    // branch.merchantId = <param>
    expect(text).toContain('b."merchantId" =')
    // isTestData = false x3 (redemption, branch, merchant)
    expect(text).toContain('r."isTestData" = false')
    expect(text).toContain('b."isTestData" = false')
    expect(text).toContain('m."isTestData" = false')
    // user.status <> 'DELETED'
    expect(text).toContain(`u."status" <> 'DELETED'`)
    // QA-email predicate is present (case-folded column side)
    expect(text).toContain('LOWER(u.email) NOT IN')
    for (const domain of QA_ACCOUNT_EMAIL_DOMAINS) {
      expect(text).toContain(`LOWER(u.email) NOT LIKE '%@${domain.toLowerCase()}'`)
    }
  })

  it('merchantId is a PARAMETER, not an interpolated literal', () => {
    const { text, values } = render(buildEligibilityWhereSql({ merchantId: 'merchant-secret', branchScope: null }))
    expect(values).toContain('merchant-secret')
    expect(text).not.toContain('merchant-secret')
  })

  it('the DELETED status discriminator is embedded as a SQL literal, not a parameter (compile-time constant)', () => {
    const { text, values } = render(buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: null }))
    expect(text).toContain(`<> 'DELETED'`)
    expect(values).not.toContain('DELETED')
  })

  it('null branch scope -> no extra branch filter beyond the merchant tenant boundary', () => {
    const { text } = render(buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: null }))
    // The tenant boundary (merchantId) is always present...
    expect(text).toContain('b."merchantId" =')
    // ...but there is no per-branch id IN filter when scope is null.
    expect(text).not.toContain('b.id IN')
    // And no fail-closed FALSE leaked in from the scope helper.
    expect(text).not.toMatch(/\bFALSE\b/)
  })

  it('non-empty branch scope -> a parameterised branch id IN (...) intersected with the merchant boundary', () => {
    const ids = ['branch-1', 'branch-2', 'branch-3']
    const { text, values } = render(buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: ids }))
    expect(text).toContain('b.id IN')
    expect(text).toContain('b."merchantId" =')
    for (const id of ids) {
      expect(values).toContain(id)
      expect(text).not.toContain(id)
    }
  })

  it('empty branch scope ([]) -> a fail-closed FALSE clause (allBranches=false + [] yields no data, never widened)', () => {
    const { text } = render(buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: [] }))
    // Fail-closed: a FALSE clause is present so the query returns no rows.
    expect(text).toContain('FALSE')
    // The tenant boundary is still present (defence in depth).
    expect(text).toContain('b."merchantId" =')
    // It must NOT degrade to an absent branch filter (which would widen to all branches).
    expect(text).not.toContain('b.id IN')
  })

  it('every clause is joined by AND so the conditions are conjunctive (all must hold)', () => {
    const { text } = render(buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: ['b1'] }))
    // A conjunction across the relational predicates + cleanliness + scope.
    expect(text).toContain(' AND ')
    // No accidental OR widening anywhere in the eligible-row predicate.
    expect(text).not.toMatch(/\bOR\b/)
  })

  it('honours custom aliases when supplied (forward-compat for A4 query composition)', () => {
    const { text } = render(
      buildEligibilityWhereSql({
        merchantId: 'merchant-1',
        branchScope: ['b1'],
        aliases: { redemption: 'vr', branch: 'br', user: 'usr', merchant: 'mer' },
      }),
    )
    expect(text).toContain('vr."isTestData" = false')
    expect(text).toContain('br."isTestData" = false')
    expect(text).toContain('mer."isTestData" = false')
    expect(text).toContain('br."merchantId" =')
    expect(text).toContain('br.id IN')
    expect(text).toContain('LOWER(usr.email) NOT IN')
    expect(text).toContain(`usr."status" <> 'DELETED'`)
  })
})

describe('buildEligibilityWhereSql - demo carve-out (Task A10, spec 2.6)', () => {
  it('DEFAULT (no includeTestDataForMerchantId): all three isTestData=false predicates present', () => {
    const { text } = render(buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: null }))
    expect(text).toContain('r."isTestData" = false')
    expect(text).toContain('b."isTestData" = false')
    expect(text).toContain('m."isTestData" = false')
  })

  it('omitting the param is identical to never passing it (default cleanliness preserved)', () => {
    const withUndefined = render(
      buildEligibilityWhereSql({ merchantId: 'merchant-1', branchScope: null, includeTestDataForMerchantId: undefined }),
    )
    expect(withUndefined.text).toContain('r."isTestData" = false')
    expect(withUndefined.text).toContain('b."isTestData" = false')
    expect(withUndefined.text).toContain('m."isTestData" = false')
  })

  it('param MATCHING merchantId: the three isTestData predicates are RELAXED (gone) but branch.merchantId still parameterised + present', () => {
    const { text, values } = render(
      buildEligibilityWhereSql({
        merchantId: 'demo-merchant',
        branchScope: null,
        includeTestDataForMerchantId: 'demo-merchant',
      }),
    )
    // The three cleanliness predicates are relaxed for this same-merchant demo path.
    expect(text).not.toContain('isTestData')
    // The tenant boundary is UNCHANGED: still present and still a parameter (never inlined).
    expect(text).toContain('b."merchantId" =')
    expect(values).toContain('demo-merchant')
    expect(text).not.toContain('demo-merchant')
    // The other eligible-rule predicates remain (deleted-customer + QA exclusion).
    expect(text).toContain(`u."status" <> 'DELETED'`)
    expect(text).toContain('LOWER(u.email) NOT IN')
  })

  it('param NOT matching merchantId: NO relaxation - the three isTestData=false predicates remain', () => {
    const { text, values } = render(
      buildEligibilityWhereSql({
        merchantId: 'real-merchant',
        branchScope: null,
        includeTestDataForMerchantId: 'a-DIFFERENT-demo-merchant',
      }),
    )
    // A non-matching demo id can NEVER relax cleanliness for this merchant.
    expect(text).toContain('r."isTestData" = false')
    expect(text).toContain('b."isTestData" = false')
    expect(text).toContain('m."isTestData" = false')
    // Tenant boundary still scoped to the REAL merchant (the demo id is never used as a tenant param).
    expect(text).toContain('b."merchantId" =')
    expect(values).toContain('real-merchant')
    expect(values).not.toContain('a-DIFFERENT-demo-merchant')
  })

  it('relaxation never widens the tenant boundary: the demo id is NOT added as a second merchant parameter', () => {
    const { values } = render(
      buildEligibilityWhereSql({
        merchantId: 'demo-merchant',
        branchScope: null,
        includeTestDataForMerchantId: 'demo-merchant',
      }),
    )
    // The merchant id appears exactly once as a parameter (the single tenant clause),
    // never duplicated or joined with an OR for the demo path.
    const occurrences = values.filter((v) => v === 'demo-merchant').length
    expect(occurrences).toBe(1)
  })

  it('demo carve-out keeps the branch-scope intersection (an empty scope still fails closed)', () => {
    const { text } = render(
      buildEligibilityWhereSql({
        merchantId: 'demo-merchant',
        branchScope: [],
        includeTestDataForMerchantId: 'demo-merchant',
      }),
    )
    // Even on the demo path, an empty branch scope fails closed.
    expect(text).toContain('FALSE')
    expect(text).toContain('b."merchantId" =')
  })
})
