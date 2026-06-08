import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Enforcement guard for the legal launch gate (deploy-security-runbook §12).
//
// The static customer-web legal pages are the launch source of truth. This guard
// FAILS THE BUILD if they regress to placeholders, drift off the canonical domain,
// if the app legal links point at the wrong domain, or if the signup consent
// version drifts from the published legal version.
//
// It makes the gate ENFORCEABLE; it does NOT close it — only owner/legal sign-off
// on the actual content closes the gate (company number / registered office / ICO
// ref / solicitor review). See §12.

const root = process.cwd()
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

const CANONICAL = 'redeemo.co.uk'
const LEGAL_PAGES = [
  'apps/customer-web/app/terms/page.tsx',
  'apps/customer-web/app/privacy/page.tsx',
  'apps/customer-web/app/cookies/page.tsx',
]
// Markers that indicate unfinished / templated legal copy. The bracket pattern is
// scoped to known fill-in tokens so legitimate prose brackets do not false-trip.
const PLACEHOLDER_MARKERS: RegExp[] = [
  /to be filled by admin/i,
  /lorem ipsum/i,
  /TODO\(legal\)/i,
  /\bTBD\b/,
  /\[(?:insert|company\s*number|registered\s*office|address|placeholder)[^\]]*\]/i,
]

describe('legal-content enforcement guard (runbook §12)', () => {
  for (const page of LEGAL_PAGES) {
    it(`${page}: contains no placeholder/templated markers`, () => {
      const src = read(page)
      for (const re of PLACEHOLDER_MARKERS)
        expect(re.test(src), `${page} contains a placeholder marker (${re})`).toBe(false)
    })

    it(`${page}: uses the canonical domain (${CANONICAL}), never redeemo.com`, () => {
      const src = read(page)
      expect(src.includes(CANONICAL), `${page} must reference ${CANONICAL}`).toBe(true)
      expect(src.includes('redeemo.com'), `${page} must not reference redeemo.com`).toBe(false)
    })
  }

  it('customer-app legal links (terms/privacy/faq/about) use the canonical domain', () => {
    const src = read('apps/customer-app/src/lib/config/links.ts')
    for (const key of ['about', 'faq', 'terms', 'privacy']) {
      const m = new RegExp(`${key}:\\s*'([^']+)'`).exec(src)
      expect(m, `links.ts must define ${key}`).not.toBeNull()
      const url = m![1]
      expect(url.includes(CANONICAL), `links.ts ${key} must use ${CANONICAL} (was "${url}")`).toBe(true)
      expect(url.includes('redeemo.com'), `links.ts ${key} must NOT use redeemo.com (was "${url}")`).toBe(false)
    }
  })

  it('signup consent version is single-sourced from TERMS_VERSION (no hardcoded literal)', () => {
    const svc = read('src/api/auth/customer/service.ts')
    expect(/tcConsentVersion:\s*TERMS_VERSION\b/.test(svc), 'auth service must set tcConsentVersion from TERMS_VERSION').toBe(true)
    expect(/tcConsentVersion:\s*['"][0-9.]+['"]/.test(svc), 'auth service must not hardcode the consent version literal').toBe(false)
  })

  it('backend TERMS_VERSION and customer-web LEGAL_VERSION are in lock-step (no silent drift)', () => {
    const backend = /TERMS_VERSION\s*=\s*'([^']+)'/.exec(read('src/api/shared/legal.ts'))?.[1]
    const web = /LEGAL_VERSION\s*=\s*'([^']+)'/.exec(read('apps/customer-web/lib/legal.ts'))?.[1]
    expect(backend, 'TERMS_VERSION must be defined').toBeTruthy()
    expect(web, 'LEGAL_VERSION must be defined').toBeTruthy()
    expect(backend, `backend TERMS_VERSION ("${backend}") must equal web LEGAL_VERSION ("${web}")`).toBe(web)
  })

  it('CmsContent stays UNWIRED — the backend API never reads/writes it (placeholders cannot reach users)', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (e.name.endsWith('.ts')) files.push(full)
      }
    }
    walk(join(root, 'src/api'))
    const hits = files.filter((f) => /\bcmsContent\b/.test(readFileSync(f, 'utf8')))
    expect(hits, `no src/api file may reference cmsContent (it is an unwired, deferred future-CMS stub): ${hits.join(', ')}`).toEqual([])
  })
})
