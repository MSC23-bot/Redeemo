// Insights PR-A Task A3: the eligible-redemption cleanliness predicate (spec 4.1,
// 4.4). A single shared expression of the canonical "eligible logged activity"
// rule, reused by every Insights aggregation query + the event export (Task A4
// onward). Enforced server-side; not toggleable in production (spec 4.1, 17).
//
// A `VoucherRedemption` row is eligible for a merchant iff ALL hold:
//   - branch.merchantId = <merchantId>            (tenant boundary; there is no
//                                                  merchantId column on the
//                                                  redemption - join via branch)
//   - redemption.isTestData = false
//   - branch.isTestData     = false
//   - merchant.isTestData   = false
//   - user.status <> 'DELETED'                     (spec 4.4)
//   - NOT isQaAccountEmail(user.email)             (spec 4.1; a code helper, not a
//                                                  column - resolved to a
//                                                  parameterised SQL predicate)
//   - branch-scope intersection: when the scope is a string[] -> branch.id IN
//                                  (...) ; when null -> no extra branch filter
//                                  (all of the merchant's branches). An empty []
//                                  fails closed (no rows; never widened).
//
// SQL-SAFETY: client-influenced values (merchantId, the branch id list) MUST be
// parameters, never string-interpolated. We use Prisma's tagged-template
// `Prisma.sql` / `Prisma.join` / `Prisma.empty` / `Prisma.raw` so Task A4 can
// compose the returned fragment into a `$queryRaw` (true parameterisation) and
// NOT `$queryRawUnsafe`. The QA constants (emails + domains) are compile-time
// constants audited in src/api/customer/discovery/qaAccountFilter.ts, so the
// emails are lowercased and passed as parameters and the domain suffixes are
// embedded as SQL literals (mirroring the homeRailBuilders precedent). Table /
// column identifiers and the 'DELETED' discriminator are compile-time literals
// embedded via Prisma.raw (identifiers cannot be SQL parameters).

import { Prisma } from '../../../../generated/prisma/client'
import {
  QA_ACCOUNT_EMAILS,
  QA_ACCOUNT_EMAIL_DOMAINS,
} from '../../customer/discovery/qaAccountFilter'

/**
 * The default table aliases the Insights raw queries bind:
 *   r = VoucherRedemption, b = Branch, u = User, m = Merchant.
 * Task A4 composes the eligibility fragment under these aliases. Exposed so the
 * service and its tests share one source of truth for the alias names.
 */
export const ELIGIBILITY_ALIASES = {
  redemption: 'r',
  branch: 'b',
  user: 'u',
  merchant: 'm',
} as const

export type EligibilityAliases = {
  redemption: string
  branch: string
  user: string
  merchant: string
}

/** The branch-scope shape returned by `insightsScope` (scope.ts). */
export type InsightsBranchScope = string[] | null

/**
 * The QA-account email exclusion as a parameterised SQL predicate over an email
 * column expression (e.g. "u.email"). Mirrors `isQaAccountEmail` (case-fold both
 * sides) and the homeRailBuilders precedent:
 *   - exact list: LOWER(<email>) NOT IN ($1, $2, ...) with the lowercased emails
 *     as PARAMETERS;
 *   - per domain: LOWER(<email>) NOT LIKE '%@<domain>' with the lowercased domain
 *     embedded as a SQL literal (compile-time constant; no user input);
 *   - EMPTY-LIST TRUE identity: an empty email list (or domain list) contributes
 *     a literal TRUE so the predicate neither narrows nor widens accidentally
 *     (never emits `NOT IN ()`).
 *
 * `emailExpr` is a SQL identifier expression, NOT user input, so it is embedded
 * via Prisma.raw (it is never pushed into the parameter array).
 */
export function buildQaEmailExclusionSql(
  emailExpr: string,
  opts?: { emails?: readonly string[]; domains?: readonly string[] },
): Prisma.Sql {
  const emails = (opts?.emails ?? QA_ACCOUNT_EMAILS).map((e) => e.toLowerCase())
  const domains = (opts?.domains ?? QA_ACCOUNT_EMAIL_DOMAINS).map((d) => d.toLowerCase())

  const col = Prisma.raw(`LOWER(${emailExpr})`)

  // Exact-email exclusion. Empty -> TRUE identity (never `NOT IN ()`).
  const exactClause =
    emails.length > 0
      ? Prisma.sql`${col} NOT IN (${Prisma.join(emails)})`
      : Prisma.sql`TRUE`

  // Domain-suffix exclusion. Empty -> TRUE identity. Each domain is a
  // compile-time constant embedded as a SQL literal (audited; no user input).
  const domainClause =
    domains.length > 0
      ? Prisma.join(
          domains.map((d) => Prisma.sql`${col} NOT LIKE ${Prisma.raw(`'%@${d}'`)}`),
          ' AND ',
        )
      : Prisma.sql`TRUE`

  return Prisma.sql`(${exactClause} AND ${domainClause})`
}

/**
 * The branch-scope intersection clause:
 *   - null            -> Prisma.empty (no extra branch filter; all of the
 *                        merchant's branches, the tenant boundary still applies);
 *   - non-empty []    -> <branch>.id IN ($1, ...) with the ids as PARAMETERS;
 *   - empty []        -> a fail-closed FALSE clause (allBranches=false + no
 *                        allowed branches => no rows; never widened).
 *
 * `branchAlias` is a SQL identifier (not user input) embedded via Prisma.raw.
 */
export function buildBranchScopeSql(branchAlias: string, scope: InsightsBranchScope): Prisma.Sql {
  if (scope === null) return Prisma.empty
  if (scope.length === 0) return Prisma.sql`FALSE`
  const idCol = Prisma.raw(`${branchAlias}.id`)
  return Prisma.sql`${idCol} IN (${Prisma.join(scope)})`
}

/**
 * The full eligible-row WHERE fragment (spec 4.1 / 4.4), AND-joined and ready for
 * Task A4 to compose into a `$queryRaw`. Returns a `Prisma.Sql` so client-
 * influenced values (merchantId, branch id list) stay parameterised.
 */
export function buildEligibilityWhereSql(args: {
  merchantId: string
  branchScope: InsightsBranchScope
  aliases?: EligibilityAliases
}): Prisma.Sql {
  const a = args.aliases ?? ELIGIBILITY_ALIASES

  const merchantIdCol = Prisma.raw(`${a.branch}."merchantId"`)
  const redemptionTestCol = Prisma.raw(`${a.redemption}."isTestData"`)
  const branchTestCol = Prisma.raw(`${a.branch}."isTestData"`)
  const merchantTestCol = Prisma.raw(`${a.merchant}."isTestData"`)
  const userStatusCol = Prisma.raw(`${a.user}."status"`)
  const emailExpr = `${a.user}.email`

  const clauses: Prisma.Sql[] = [
    // Tenant boundary: the merchant id is a PARAMETER (client-influenced).
    Prisma.sql`${merchantIdCol} = ${args.merchantId}`,
    // Cleanliness: three isTestData=false predicates (literal false).
    Prisma.sql`${redemptionTestCol} = false`,
    Prisma.sql`${branchTestCol} = false`,
    Prisma.sql`${merchantTestCol} = false`,
    // Deleted-customer exclusion (spec 4.4). 'DELETED' is a compile-time literal.
    Prisma.sql`${userStatusCol} <> ${Prisma.raw(`'DELETED'`)}`,
    // QA-account exclusion (spec 4.1) over the email column.
    buildQaEmailExclusionSql(emailExpr),
  ]

  // Branch-scope intersection (null -> no extra filter; [] -> fail-closed FALSE).
  const scopeClause = buildBranchScopeSql(a.branch, args.branchScope)
  if (scopeClause.strings.join('') !== '' || scopeClause.values.length > 0) {
    clauses.push(scopeClause)
  }

  return Prisma.sql`(${Prisma.join(clauses, ' AND ')})`
}
