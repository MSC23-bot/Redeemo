// tests/api/customer/discovery/seed-data-exclusion.guard.test.ts
//
// SEC-C3 (Gate-PR-4b) — STATIC SOURCE GUARD.
//
// This test does NOT touch the database. It reads the customer-facing
// discovery + favourites SERVICE SOURCE and fails if any query that can
// return Merchant / Branch / Voucher supply omits an `isTestData` exclusion.
// It is the regression backstop: if someone adds a new customer-facing supply
// query (or a new rail) and forgets the seed/test filter, CI goes red here
// instead of silently leaking seeded/demo supply into a customer response.
//
// What it checks:
//   1. Every prisma.{merchant,branch,voucher}.{findMany,findFirst} in the
//      discovery service + home-rail builders excludes isTestData — either
//      inline in the call args, OR via the `const where = { … }` object the
//      call passes by reference.
//   2. Every supply-carrying join-table query (featuredMerchant /
//      campaignMerchant .findMany/.count) excludes isTestData (same rule).
//   3. No prisma.{merchant,branch,voucher}.findUnique in these files —
//      findUnique cannot filter the non-unique isTestData field, so a
//      findUnique would be an un-gateable hole. Detail reads use findFirst.
//   4. Both raw $queryRawUnsafe redemption-aggregation blocks carry the
//      branch-level `b."isTestData" = false` predicate.
//   5. Every favourite-supply query (favourite{Merchant,Branch,Voucher}
//      .findMany/.count) excludes isTestData (Discovery + Favourites scope;
//      Savings + Reviews are deferred, see the PR description).
//
// Mechanism reference: the implementation uses explicit per-query filters
// (not a Prisma extension) precisely so this static guard can see them — an
// extension would be invisible to source scanning AND would not cover raw
// SQL or nested includes.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const REPO_ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8')

const DISCOVERY = 'src/api/customer/discovery/service.ts'
const HOME_RAILS = 'src/api/customer/discovery/homeRailBuilders.ts'
const FAVOURITES = 'src/api/customer/favourites/service.ts'

// Brace-balanced slice starting at the first `{` at or after `fromIdx`.
function balancedObjectAfter(src: string, fromIdx: number): string {
  const start = src.indexOf('{', fromIdx)
  if (start === -1) return ''
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return src.slice(start)
}

type Call = { entity: string; method: string; idx: number; args: string }

function scanCalls(src: string, entityAlt: string, methodAlt: string): Call[] {
  // `\.` after the entity ensures exact entity match (so `merchant` does NOT
  // match inside `favouriteMerchant` / `voucherRedemption`).
  const re = new RegExp(`prisma\\.(${entityAlt})\\.(${methodAlt})\\(`, 'g')
  const out: Call[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    out.push({
      entity: m[1],
      method: m[2],
      idx: m.index,
      args: balancedObjectAfter(src, m.index + m[0].length),
    })
  }
  return out
}

// A call excludes isTestData if it appears inline in the call args, OR the
// call passes a `where` object by reference and the nearest preceding
// `const where = { … }` declaration carries isTestData.
function excludesTestData(src: string, call: Call): boolean {
  if (call.args.includes('isTestData')) return true
  // Otherwise the call passes a where object by reference. Resolve the
  // variable name (`where: merchantWhere,` or the `{ where }` shorthand) and
  // check the nearest preceding `const <name> = { … }` declaration.
  let varName: string | null = null
  const named = call.args.match(/where:\s*([A-Za-z_]\w*)\s*[,}]/)
  if (named) varName = named[1]
  else if (/\bwhere\s*[,}]/.test(call.args)) varName = 'where'
  if (!varName) return false
  const declIdx = src.slice(0, call.idx).lastIndexOf(`const ${varName}`)
  if (declIdx === -1) return false
  return balancedObjectAfter(src, declIdx).includes('isTestData')
}

describe('SEC-C3 guard — discovery service supply queries exclude seed/test data', () => {
  for (const file of [DISCOVERY, HOME_RAILS]) {
    it(`${file}: every {merchant,branch,voucher}.{findMany,findFirst} excludes isTestData`, () => {
      const src = read(file)
      const calls = scanCalls(src, 'merchant|branch|voucher', 'findMany|findFirst')
      expect(calls.length, `expected to find supply queries in ${file}`).toBeGreaterThan(0)
      for (const c of calls) {
        expect(
          excludesTestData(src, c),
          `${file}: prisma.${c.entity}.${c.method} at index ${c.idx} does NOT exclude isTestData ` +
            `(checked inline args + preceding \`const where\`). Args:\n${c.args.slice(0, 200)}`,
        ).toBe(true)
      }
    })

    it(`${file}: every supply-carrying join query (featured/campaign merchant) excludes isTestData`, () => {
      const src = read(file)
      const calls = scanCalls(src, 'featuredMerchant|campaignMerchant', 'findMany|count')
      for (const c of calls) {
        expect(
          excludesTestData(src, c),
          `${file}: prisma.${c.entity}.${c.method} at index ${c.idx} does NOT exclude isTestData. ` +
            `Args:\n${c.args.slice(0, 200)}`,
        ).toBe(true)
      }
    })

    it(`${file}: no findUnique on supply entities (cannot gate non-unique isTestData)`, () => {
      const src = read(file)
      expect(
        src,
        `${file} must use findFirst (not findUnique) for merchant/branch/voucher reads so isTestData can gate them`,
      ).not.toMatch(/prisma\.(merchant|branch|voucher)\.findUnique/)
    })
  }

  it('homeRailBuilders raw SQL: both redemption-aggregation blocks filter branch isTestData', () => {
    const src = read(HOME_RAILS)
    // Two $queryRawUnsafe blocks (Trending inclusion + Popular score). Both
    // already carry r."isTestData" (VoucherRedemption); PR-4b adds the branch
    // predicate so seed/demo branches cannot drive Trending/Popular.
    const rawBlocks = (src.match(/prisma\.\$queryRawUnsafe/g) ?? []).length
    expect(rawBlocks, 'expected exactly 2 raw redemption-aggregation queries').toBe(2)
    const branchPredicates = (src.match(/b\."isTestData" = false/g) ?? []).length
    expect(branchPredicates, 'both raw SQL blocks must carry AND b."isTestData" = false').toBe(2)
  })
})

describe('SEC-C3 guard — favourites supply queries exclude seed/test data', () => {
  it('every favourite{Merchant,Branch,Voucher}.{findMany,count} excludes isTestData', () => {
    const src = read(FAVOURITES)
    const re = /prisma\.favourite(Merchant|Branch|Voucher)\.(findMany|count)\(/g
    const found: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const args = balancedObjectAfter(src, m.index + m[0].length)
      found.push(`favourite${m[1]}.${m[2]}`)
      expect(
        args.includes('isTestData'),
        `favourite${m[1]}.${m[2]} at index ${m.index} must filter its supply relation on isTestData. ` +
          `Args:\n${args.slice(0, 200)}`,
      ).toBe(true)
    }
    // All three list queries + the two paginated counts (favouriteVoucher
    // derives total from rows, so no separate count).
    expect(found.length).toBeGreaterThanOrEqual(5)
  })
})
