import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// We do NOT own redeemo.com — only redeemo.co.uk (owner decision D-A, 2026-06-08).
// Any user-visible / externally-sent redeemo.com link or email points at a domain
// we do not control (a launch/trust risk), so this guard fails the build if one is
// (re)introduced in customer-app source OR customer-web user-visible source
// (incl. `mailto:` contact links — the merchant-pitch emails were a missed surface).
//
// Intentionally NOT covered here (PAUSED on owner decisions — these are tracked
// holdouts, not regressions; see deferred-followups §SEC.3):
//   - apps/customer-app/src/lib/config/links.ts  → `merchantPortal` subdomain (D-C); allow-listed below.
//   - apps/customer-app/app.config.ts            → universal links / Android intent host (D-D, DNS/app-store
//       coupled: needs hosted AASA/assetlinks + an app rebuild). It lives at the app root, not under src/,
//       so the walk below does not reach it.
// Remove links.ts from the allow-list once the merchant-portal subdomain (D-C) is decided and aligned.

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const SRC = 'apps/customer-app/src'
const ALLOWLIST: ReadonlySet<string> = new Set([
  `${SRC}/lib/config/links.ts`, // merchantPortal — decision-blocked (D-C)
])

// Customer-web user-visible source. No allow-list: customer-web has no
// decision-blocked redeemo.com (merchantPortal is customer-app only). The walk
// skips tests; scripts/ (dev tooling) is intentionally not user-visible source.
const CUSTOMER_WEB_ROOTS = ['apps/customer-web/app', 'apps/customer-web/components', 'apps/customer-web/lib']

function walkTs(rel: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const child = `${rel}/${e.name}`
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'tests') continue // test mocks may mirror the blocked merchantPortal
      out.push(...walkTs(child))
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(child)
    }
  }
  return out
}

describe('canonical-url guard — no user-visible redeemo.com in customer-app src (Redeemo does not own it)', () => {
  it('merchant share URL uses redeemo.co.uk, not redeemo.com', () => {
    const src = read(`${SRC}/features/merchant/screens/MerchantProfileScreen.tsx`)
    expect(src.includes('redeemo.co.uk/merchants'), 'share URL must use redeemo.co.uk').toBe(true)
    expect(/redeemo\.com\/merchants/.test(src), 'share URL must NOT use redeemo.com').toBe(false)
  })

  it('no redeemo.com anywhere else in customer-app src (except the decision-blocked allow-list)', () => {
    const offenders = walkTs(SRC)
      .filter((f) => !ALLOWLIST.has(f))
      .filter((f) => read(f).includes('redeemo.com'))
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
})
