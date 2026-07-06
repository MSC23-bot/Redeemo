import { describe, it, expect } from 'vitest'
import {
  assertConfirmedSeedTarget,
  dbIdentity,
  SEED_TARGET_ENV_VAR,
} from '../../../prisma/seed-data/seedTargetGuard'

const URL_A = 'postgresql://user:secret@ep-example-123.eu-west-2.aws.neon.tech/redeemo_dev?sslmode=require'
const ID_A = 'ep-example-123.eu-west-2.aws.neon.tech/redeemo_dev'

describe('dbIdentity', () => {
  it('extracts credential-free host/dbname', () => {
    expect(dbIdentity(URL_A)).toBe(ID_A)
  })

  it('never includes credentials in the identity', () => {
    expect(dbIdentity(URL_A)).not.toContain('secret')
    expect(dbIdentity(URL_A)).not.toContain('user')
  })

  it('throws on a URL without a database name', () => {
    expect(() => dbIdentity('postgresql://host.example.com/')).toThrow()
  })
})

describe('assertConfirmedSeedTarget (fail-closed)', () => {
  const base = { databaseUrl: URL_A, confirm: ID_A, deployEnv: undefined, nodeEnv: undefined }

  it('passes only on an exact identity match', () => {
    expect(assertConfirmedSeedTarget(base)).toBe(ID_A)
  })

  it('refuses when confirmation is unset', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, confirm: undefined })).toThrow(SEED_TARGET_ENV_VAR)
  })

  it('refuses when confirmation is empty', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, confirm: '' })).toThrow(/not confirmed/i)
  })

  it('refuses a mismatched confirmation (different db)', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, confirm: 'ep-example-123.eu-west-2.aws.neon.tech/other_db' })).toThrow(/not confirmed/i)
  })

  it('refuses partial/substring confirmations', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, confirm: 'redeemo_dev' })).toThrow(/not confirmed/i)
  })

  it('refuses production via REDEEMO_DEPLOY_ENV even when confirmed', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, deployEnv: 'production' })).toThrow(/production/i)
  })

  it('refuses production via NODE_ENV even when confirmed', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, nodeEnv: 'production' })).toThrow(/production/i)
  })

  it('refuses when DATABASE_URL is missing', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, databaseUrl: undefined })).toThrow(/DATABASE_URL/i)
  })

  it('refuses an unparseable DATABASE_URL', () => {
    expect(() => assertConfirmedSeedTarget({ ...base, databaseUrl: 'not a url' })).toThrow(/parsed/i)
  })
})
