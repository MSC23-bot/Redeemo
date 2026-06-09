import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CANONICAL_ORIGIN,
  PUBLIC_ROUTES,
  PRIVATE_ROUTES,
  MARKETPLACE_ROUTES,
  sitemapPaths,
  robotsDisallow,
} from '../../../apps/customer-web/lib/seoRoutes'

// §SEC.6 SEO foundation guard (fs-based, like canonical-url.guard.test.ts — dodges
// the customer-web test-infra gap §BW). Locks: apex metadataBase, robots/sitemap
// existence, marketplace-gated sitemap/robots, noindex on private/auth, and no
// em dash / no deal-site phrasing in metadata copy fields. seoRoutes.ts is pure,
// so its flag logic is imported and tested directly.

const root = process.cwd()
const WEB = 'apps/customer-web'
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

// Extract only metadata copy (title:/description: literals + the layout DEFAULT_*
// consts) so the legal/body copy of a page is never scanned (we do not guard body
// copy in this PR; that is a separate hygiene follow-up).
function metaStrings(src: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const field = /\b(?:title|description):\s*(['"`])([\s\S]*?)\1/g
  while ((m = field.exec(src))) out.push(m[2])
  const consts = /\b(?:DEFAULT_TITLE|DEFAULT_DESCRIPTION)\s*=\s*\n?\s*(['"`])([\s\S]*?)\1/g
  while ((m = consts.exec(src))) out.push(m[2])
  return out
}

const META_FILES = [
  'app/layout.tsx',
  'app/faq/layout.tsx',
  'app/terms/page.tsx',
  'app/merchants/page.tsx',
  'app/categories/[slug]/page.tsx',
  'app/for-businesses/page.tsx',
  'app/pricing/page.tsx',
  'app/login/page.tsx',
  'app/register/page.tsx',
  'app/account/layout.tsx',
]

describe('SEO metadata guard (§SEC.6)', () => {
  it('metadataBase is the apex redeemo.co.uk (not www, not .com)', () => {
    const layout = read(`${WEB}/app/layout.tsx`)
    expect(layout).toMatch(/metadataBase:\s*new URL\(\s*SITE_URL\s*\)/)
    expect(layout).toMatch(/SITE_URL\s*=\s*['"]https:\/\/redeemo\.co\.uk['"]/)
    expect(layout.includes('redeemo.com')).toBe(false)
    expect(layout.includes('www.redeemo.co.uk')).toBe(false)
  })

  it('root layout does NOT set a static/global canonical (would force every page to canonicalise to one URL)', () => {
    // A root-level alternates.canonical is inherited by every child route, so
    // /pricing, /faq, etc. would canonicalise to the homepage. Pages self-
    // canonicalise when no canonical tag is present; per-page canonicals (if ever
    // needed) belong in the page files, not the root layout.
    const layout = read(`${WEB}/app/layout.tsx`)
    const code = layout.replace(/\/\/[^\n]*/g, '') // strip line comments first
    expect(code).not.toMatch(/\bcanonical:/)
  })

  it('CANONICAL_ORIGIN is the apex', () => {
    expect(CANONICAL_ORIGIN).toBe('https://redeemo.co.uk')
  })

  it('robots.ts and sitemap.ts exist and resolve the apex host', () => {
    expect(existsSync(join(root, `${WEB}/app/robots.ts`))).toBe(true)
    expect(existsSync(join(root, `${WEB}/app/sitemap.ts`))).toBe(true)
    expect(read(`${WEB}/app/robots.ts`).includes('CANONICAL_ORIGIN')).toBe(true)
    expect(read(`${WEB}/app/sitemap.ts`).includes('CANONICAL_ORIGIN')).toBe(true)
  })

  it('sitemap excludes marketplace routes pre-launch, includes them once live', () => {
    const pre = sitemapPaths(false)
    for (const m of MARKETPLACE_ROUTES) expect(pre).not.toContain(m)
    for (const p of PUBLIC_ROUTES) expect(pre).toContain(p)
    const live = sitemapPaths(true)
    for (const m of MARKETPLACE_ROUTES) expect(live).toContain(m)
  })

  it('robots disallows private/auth always, and marketplace pre-launch only', () => {
    const pre = robotsDisallow(false)
    for (const p of PRIVATE_ROUTES) expect(pre).toContain(p)
    for (const m of MARKETPLACE_ROUTES) expect(pre).toContain(m)
    expect(pre).toContain('/api/')
    const live = robotsDisallow(true)
    for (const m of MARKETPLACE_ROUTES) expect(live).not.toContain(m)
    for (const p of PRIVATE_ROUTES) expect(live).toContain(p)
  })

  it('private/auth server pages carry robots noindex', () => {
    expect(read(`${WEB}/app/account/layout.tsx`)).toMatch(/index:\s*false/)
    expect(read(`${WEB}/app/login/page.tsx`)).toMatch(/index:\s*false/)
    expect(read(`${WEB}/app/register/page.tsx`)).toMatch(/index:\s*false/)
  })

  it('default title + description match the approved copy', () => {
    const layout = read(`${WEB}/app/layout.tsx`)
    expect(layout.includes('Redeemo: Save with Member Vouchers at Local Places')).toBe(true)
    expect(layout.includes('Find independent restaurants, cafés, gyms, and studios near you.')).toBe(true)
  })

  it('no em dash in any metadata copy field', () => {
    for (const f of META_FILES) {
      for (const s of metaStrings(read(`${WEB}/${f}`))) {
        expect(s.includes('—'), `em dash in metadata of ${f}: "${s}"`).toBe(false)
      }
    }
  })

  it('no deal-site phrasing in any metadata copy field', () => {
    const banned = [
      /looking for deals/i,
      /deal hunters/i,
      /cheap deals/i,
      /discount marketplace/i,
      /deal marketplace/i,
      /\bbuy vouchers?\b/i,
    ]
    for (const f of META_FILES) {
      for (const s of metaStrings(read(`${WEB}/${f}`))) {
        for (const re of banned) {
          expect(re.test(s), `banned phrase ${re} in metadata of ${f}: "${s}"`).toBe(false)
        }
      }
    }
  })

  it('merchant-facing metadata says "customers", not "subscribers", and does not lead with membership mechanics', () => {
    const MERCHANT_META = ['app/merchants/page.tsx', 'app/for-businesses/page.tsx']
    for (const f of MERCHANT_META) {
      for (const s of metaStrings(read(`${WEB}/${f}`))) {
        expect(/subscribers?/i.test(s), `merchant copy must say "customers", not "subscribers" in ${f}: "${s}"`).toBe(false)
        expect(/a membership that brings/i.test(s), `merchant copy must not lead with membership mechanics in ${f}: "${s}"`).toBe(false)
        expect(/\bthousands\b/i.test(s), `merchant copy must not overpromise scale in ${f}: "${s}"`).toBe(false)
      }
    }
  })
})
