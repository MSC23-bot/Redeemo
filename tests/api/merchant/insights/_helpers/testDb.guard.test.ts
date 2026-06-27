import { describe, it, expect, afterEach } from 'vitest'
import { makeTestPrisma } from './testDb'

// Insights PR-A harness: the loopback safety boundary (UNIT, no DB).
//
// makeTestPrisma() is the SOLE entry point every Insights integration test uses
// to obtain a PrismaClient. It MUST refuse to construct a client against
// anything other than a loopback host (127.0.0.1 / localhost), so a stray
// TEST_DATABASE_URL pointing at shared Neon staging / Railway / production can
// never be opened by the test suite. This pins that guard WITHOUT touching a DB:
// the throw happens BEFORE any connection, purely from URL parsing.

const ORIGINAL = process.env.TEST_DATABASE_URL

afterEach(() => {
  // Restore whatever the harness env supplied so we never leak a fake value
  // into a sibling suite.
  if (ORIGINAL === undefined) delete process.env.TEST_DATABASE_URL
  else process.env.TEST_DATABASE_URL = ORIGINAL
})

describe('makeTestPrisma — loopback safety guard', () => {
  it('throws when TEST_DATABASE_URL is unset', () => {
    delete process.env.TEST_DATABASE_URL
    expect(() => makeTestPrisma()).toThrow(/TEST_DATABASE_URL/)
  })

  it('throws when TEST_DATABASE_URL is an empty string', () => {
    process.env.TEST_DATABASE_URL = ''
    expect(() => makeTestPrisma()).toThrow(/TEST_DATABASE_URL/)
  })

  it('refuses a remote Neon host', () => {
    process.env.TEST_DATABASE_URL =
      'postgresql://user:pass@ep-cool-rain-123456.eu-west-2.aws.neon.tech/redeemo?sslmode=require'
    expect(() => makeTestPrisma()).toThrow(/loopback|127\.0\.0\.1|localhost/i)
  })

  it('refuses a remote Railway host', () => {
    process.env.TEST_DATABASE_URL =
      'postgresql://postgres:pass@containers-us-west-42.railway.app:5432/railway'
    expect(() => makeTestPrisma()).toThrow(/loopback|127\.0\.0\.1|localhost/i)
  })

  it('refuses an arbitrary remote host', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://u:p@some.neon.tech:5432/db'
    expect(() => makeTestPrisma()).toThrow(/loopback|127\.0\.0\.1|localhost/i)
  })

  it('refuses a malformed connection string (cannot prove loopback)', () => {
    process.env.TEST_DATABASE_URL = 'not a url at all'
    expect(() => makeTestPrisma()).toThrow()
  })

  it('accepts 127.0.0.1 (loopback IPv4) and returns a client with $disconnect', () => {
    process.env.TEST_DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:54329/redeemo_insights_test'
    const prisma = makeTestPrisma()
    expect(prisma).toBeTruthy()
    expect(typeof prisma.$disconnect).toBe('function')
  })

  it('accepts localhost (loopback hostname)', () => {
    process.env.TEST_DATABASE_URL =
      'postgresql://postgres:postgres@localhost:54329/redeemo_insights_test'
    const prisma = makeTestPrisma()
    expect(prisma).toBeTruthy()
    expect(typeof prisma.$disconnect).toBe('function')
  })
})
