import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// We do NOT own redeemo.com — only redeemo.co.uk (owner decision D-A, 2026-06-08).
// Any user-visible / externally-sent redeemo.com link or email points at a domain
// we do not control (a launch/trust risk), so this guard fails the build if one is
// (re)introduced in customer-app source OR customer-web user-visible source
// (incl. `mailto:` contact links).
//
// D-C (merchant-portal subdomain) is RESOLVED → merchant.redeemo.co.uk, so links.ts
// is no longer allow-listed; the broad customer-app-src check now covers it too.
//
// Still NOT covered (PAUSED on owner decision D-D — a tracked holdout, not a
// regression; see deferred-followups §SEC.3): apps/customer-app/app.config.ts
// (universal links / Android intent host; DNS/app-store coupled, needs hosted
// AASA/assetlinks + an app rebuild). It lives at the app root, not under src/, so
// the src walk does not reach it — and it has no `merchant.redeemo.com`, so the
// merchant-portal check below does not flag it either.

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const SRC = 'apps/customer-app/src'
const CUSTOMER_WEB_ROOTS = ['apps/customer-web/app', 'apps/customer-web/components', 'apps/customer-web/lib']

// Walk .ts/.tsx under `rel`. By default skips test files, so seeded QA emails like
// customer@redeemo.com in tests do not false-trip the broad redeemo.com check.
// Pass includeTests=true for a targeted literal scan that must also cover mocks.
function walkTs(rel: string, includeTests = false): string[] {
  const out: string[] = []
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const child = `${rel}/${e.name}`
    if (e.isDirectory()) {
      if (['node_modules', '.expo', 'dist', 'ios', 'android', '.next'].includes(e.name)) continue
      if (!includeTests && (e.name === '__tests__' || e.name === 'tests')) continue
      out.push(...walkTs(child, includeTests))
    } else if (/\.(ts|tsx)$/.test(e.name) && (includeTests || !/\.test\.tsx?$/.test(e.name))) {
      out.push(child)
    }
  }
  return out
}

describe('canonical-url guard — no unowned redeemo.com in user-visible source', () => {
  it('merchant share URL uses redeemo.co.uk, not redeemo.com', () => {
    const src = read(`${SRC}/features/merchant/screens/MerchantProfileScreen.tsx`)
    expect(src.includes('redeemo.co.uk/merchants'), 'share URL must use redeemo.co.uk').toBe(true)
    expect(/redeemo\.com\/merchants/.test(src), 'share URL must NOT use redeemo.com').toBe(false)
  })

  it('no redeemo.com anywhere in customer-app src', () => {
    const offenders = walkTs(SRC).filter((f) => read(f).includes('redeemo.com'))
    expect(
      offenders,
      `redeemo.com is a domain Redeemo does NOT own — use redeemo.co.uk. Offending file(s): ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('no redeemo.com link or email in customer-web user-visible source (app / components / lib)', () => {
    const offenders = CUSTOMER_WEB_ROOTS
      .flatMap((rootDir) => walkTs(rootDir))
      .filter((f) => read(f).includes('redeemo.com'))
    expect(
      offenders,
      `redeemo.com (link or @email) is a domain Redeemo does NOT own — use redeemo.co.uk. Offending file(s): ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('no merchant.redeemo.com anywhere in customer-app, INCLUDING tests/mocks (D-C → merchant.redeemo.co.uk)', () => {
    const offenders = walkTs('apps/customer-app', true).filter((f) => read(f).includes('merchant.redeemo.com'))
    expect(
      offenders,
      `the Merchant Portal lives at merchant.redeemo.co.uk (Redeemo does not own .com). Offending file(s): ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
