import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// /merchants route-decision guard (fs-based, like the other tests/api/legal guards —
// dodges the customer-web test-infra gap §BW). Option A, locked 2026-06-09:
//
//   The bare /merchants route renders merchant-pitch content that duplicates
//   /for-businesses, so middleware 307-redirects it to /for-businesses until
//   /merchants is rebuilt as the customer directory. /merchants/<id> (the real
//   customer merchant-profile route) must NOT be caught — it falls through to the
//   marketplace gate. The redirect must sit BEFORE that gate.
//
// This pins the four owner-required invariants (redirect exists, exact-match-only
// not prefix, target /for-businesses, before the marketplace gate) plus the locked
// 307-not-308 decision and the structural guarantee that /merchants/<id> stays gated.

const root = process.cwd()
const mw = readFileSync(join(root, 'apps/customer-web/middleware.ts'), 'utf8')

const exactIdx = mw.indexOf("pathname === '/merchants'")
const forBizIdx = mw.indexOf("'/for-businesses'")
// Anchor on the actual gate CONDITION (process.env.…), not the first textual
// mention of the flag — it also appears in the top-of-file comment.
const gateIdx = mw.indexOf('process.env.NEXT_PUBLIC_MARKETPLACE_LIVE')

// The slice that controls the /for-businesses redirect: from the exact-match
// condition to the redirect target. Used to prove the redirect is driven by an
// exact match and nothing prefix-y leaks into its guard.
const redirectBlock = exactIdx > -1 && forBizIdx > -1 ? mw.slice(exactIdx, forBizIdx) : ''

describe('/merchants → /for-businesses temporary redirect guard (Option A, locked 2026-06-09)', () => {
  it('the redirect exists and targets /for-businesses', () => {
    expect(forBizIdx).toBeGreaterThan(-1)
    expect(mw).toMatch(
      /NextResponse\.redirect\(\s*new URL\(\s*'\/for-businesses',\s*request\.url\s*\)/,
    )
  })

  it('is gated on an EXACT match (pathname === \'/merchants\'), not a prefix', () => {
    expect(exactIdx).toBeGreaterThan(-1)
    // The /for-businesses redirect must be controlled by the exact-match condition…
    expect(exactIdx).toBeLessThan(forBizIdx)
    expect(redirectBlock).toContain("pathname === '/merchants'")
    // …and its guard must not use any prefix/startsWith form for /merchants.
    expect(redirectBlock).not.toMatch(/startsWith/)
    expect(redirectBlock).not.toMatch(/matchesPrefix/)
    expect(redirectBlock).not.toContain('/merchants/')
    // There must be no literal startsWith('/merchants') anywhere — the only prefix
    // matching is the generic matchesPrefix helper (startsWith(`${p}/`)) used by the
    // marketplace gate, which is a different, legitimate concern.
    expect(mw).not.toContain("startsWith('/merchants')")
  })

  it('uses a 307 temporary redirect, not 308 (the path will be reclaimed)', () => {
    expect(mw).toMatch(
      /NextResponse\.redirect\(\s*new URL\(\s*'\/for-businesses',\s*request\.url\s*\),\s*307\s*\)/,
    )
    // No redirect uses a 308 (permanent) status argument.
    expect(mw).not.toMatch(/,\s*308\s*\)/)
  })

  it('appears BEFORE the marketplace flag-gate', () => {
    expect(gateIdx).toBeGreaterThan(-1)
    expect(exactIdx).toBeLessThan(gateIdx)
    expect(forBizIdx).toBeLessThan(gateIdx)
  })

  it('leaves /merchants/<id> gated (not redirected): exact match cannot catch a subpath, and the subpath stays in the matcher + MARKETPLACE list', () => {
    // The customer merchant-profile route still passes through middleware…
    expect(mw).toContain("'/merchants/:path*'")
    // …and is still inside the marketplace gate's prefix list, so it redirects to
    // '/' pre-launch (NOT to /for-businesses).
    expect(mw).toMatch(/const MARKETPLACE = \[[^\]]*'\/merchants'[^\]]*\]/)
    // Structural proof the redirect can't catch a subpath: it is an === comparison,
    // so '/merchants/123' !== '/merchants' and falls through.
    expect(redirectBlock).toContain('===')
  })
})
