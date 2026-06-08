import { describe, it, expect } from 'vitest'
import {
  requireReferenceSeedOptIn,
  requireDatabaseUrl,
  redactedTarget,
  requireReferenceSeedConfirm,
  resolveReferenceStripePriceIds,
  validateStripePriceId,
} from '../../prisma/seed-data/referenceSeedSafety'

// PR2b: the reference-seed safety gates are pure + fail-closed. These unit tests
// pin opt-in, redacted target, target confirmation, and (critically) Stripe price
// id validation — without spawning the seed or touching a database.

const REAL_MONTHLY = 'price_1QabcdEfghIJklmnOPqrstUV'
const REAL_ANNUAL = 'price_1QzyxwVUtsrQPonmlKJihgfeD'

describe('referenceSeedSafety (PR2b) — fail-closed gates', () => {
  describe('requireReferenceSeedOptIn', () => {
    it('throws unless ALLOW_REFERENCE_SEED === "true"', () => {
      expect(() => requireReferenceSeedOptIn({})).toThrow(/ALLOW_REFERENCE_SEED/)
      expect(() => requireReferenceSeedOptIn({ ALLOW_REFERENCE_SEED: 'false' })).toThrow(/ALLOW_REFERENCE_SEED/)
      expect(() => requireReferenceSeedOptIn({ ALLOW_REFERENCE_SEED: '1' })).toThrow(/ALLOW_REFERENCE_SEED/)
      expect(() => requireReferenceSeedOptIn({ ALLOW_REFERENCE_SEED: 'TRUE' })).toThrow(/ALLOW_REFERENCE_SEED/)
      expect(() => requireReferenceSeedOptIn({ ALLOW_REFERENCE_SEED: 'true' })).not.toThrow()
    })
  })

  describe('requireDatabaseUrl', () => {
    it('throws on missing / blank DATABASE_URL', () => {
      expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL is not set/)
      expect(() => requireDatabaseUrl({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL is not set/)
    })
    it('throws on an unparseable DATABASE_URL', () => {
      expect(() => requireDatabaseUrl({ DATABASE_URL: 'not a url' })).toThrow(/not a valid connection URL/)
    })
    it('throws on a URL with no host', () => {
      expect(() => requireDatabaseUrl({ DATABASE_URL: 'postgresql:///neondb' })).toThrow(/no database host/)
    })
    it('does NOT echo the connection string (no credential leak) on failure', () => {
      try {
        requireDatabaseUrl({ DATABASE_URL: 'not a url' })
      } catch (e) {
        expect(String((e as Error).message)).not.toContain('not a url')
      }
    })
    it('returns the trimmed URL when valid', () => {
      const url = 'postgresql://user:secret@db.example.neon.tech/neondb?sslmode=require'
      expect(requireDatabaseUrl({ DATABASE_URL: `  ${url}  ` })).toBe(url)
    })
  })

  describe('redactedTarget', () => {
    it('returns host + db name with credentials stripped', () => {
      const t = redactedTarget('postgresql://user:secret@db.example.neon.tech/redeemo?sslmode=require')
      expect(t).toBe('db.example.neon.tech/redeemo')
      expect(t).not.toContain('secret')
      expect(t).not.toContain('user')
    })
    it('never throws on missing / unparseable', () => {
      expect(redactedTarget(undefined)).toMatch(/not set/)
      expect(redactedTarget('not a url')).toMatch(/unparseable/)
    })
  })

  describe('requireReferenceSeedConfirm', () => {
    const target = 'db.example.neon.tech/redeemo'
    it('throws when REFERENCE_SEED_CONFIRM is unset/blank', () => {
      expect(() => requireReferenceSeedConfirm({}, target)).toThrow(/REFERENCE_SEED_CONFIRM/)
      expect(() => requireReferenceSeedConfirm({ REFERENCE_SEED_CONFIRM: '   ' }, target)).toThrow(/REFERENCE_SEED_CONFIRM/)
    })
    it('throws when it does not match the target', () => {
      expect(() => requireReferenceSeedConfirm({ REFERENCE_SEED_CONFIRM: 'some-other-db' }, target)).toThrow(/does not match/)
    })
    it('passes when it matches the db name or host', () => {
      expect(() => requireReferenceSeedConfirm({ REFERENCE_SEED_CONFIRM: 'redeemo' }, target)).not.toThrow()
      expect(() => requireReferenceSeedConfirm({ REFERENCE_SEED_CONFIRM: 'db.example.neon.tech' }, target)).not.toThrow()
    })
  })

  describe('Stripe price ids — FAIL CLOSED', () => {
    it('rejects missing / blank', () => {
      expect(() => validateStripePriceId('X', undefined)).toThrow(/not set/)
      expect(() => validateStripePriceId('X', '   ')).toThrow(/not set/)
    })
    it('rejects the dev placeholders explicitly', () => {
      expect(() => validateStripePriceId('X', 'price_monthly_dev')).toThrow()
      expect(() => validateStripePriceId('X', 'price_annual_dev')).toThrow()
      expect(() => validateStripePriceId('X', 'price_placeholder')).toThrow()
    })
    it('rejects malformed (no price_ prefix, spaces, too short, extra underscores)', () => {
      for (const bad of ['sub_123456789012', 'price_', 'price_short', 'price_with space', 'price_has_underscore', 'random'])
        expect(() => validateStripePriceId('X', bad), bad).toThrow()
    })
    it('accepts a real Stripe price id (trimmed)', () => {
      expect(validateStripePriceId('X', REAL_MONTHLY)).toBe(REAL_MONTHLY)
      expect(validateStripePriceId('X', `  ${REAL_MONTHLY}  `)).toBe(REAL_MONTHLY)
    })
    it('resolveReferenceStripePriceIds returns both when valid', () => {
      expect(
        resolveReferenceStripePriceIds({ STRIPE_PRICE_ID_MONTHLY: REAL_MONTHLY, STRIPE_PRICE_ID_ANNUAL: REAL_ANNUAL }),
      ).toEqual({ monthlyPriceId: REAL_MONTHLY, annualPriceId: REAL_ANNUAL })
    })
    it('resolveReferenceStripePriceIds fails closed if EITHER is invalid', () => {
      expect(() =>
        resolveReferenceStripePriceIds({ STRIPE_PRICE_ID_MONTHLY: REAL_MONTHLY, STRIPE_PRICE_ID_ANNUAL: 'price_annual_dev' }),
      ).toThrow(/STRIPE_PRICE_ID_ANNUAL/)
      expect(() => resolveReferenceStripePriceIds({ STRIPE_PRICE_ID_ANNUAL: REAL_ANNUAL })).toThrow(/STRIPE_PRICE_ID_MONTHLY/)
    })
  })
})
