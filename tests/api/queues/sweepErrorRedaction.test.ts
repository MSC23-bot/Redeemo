import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  classifySweepError,
  defaultRecordSweepFailure,
} from '../../../src/api/queues/maintenanceScheduler'

// Neon CU-burn PR-A (Codex round-2 Finding 3): the maintenance failure log
// claims redaction, so it must be STRUCTURALLY incapable of leaking a driver
// error message — those can embed the connection string (credentials),
// hostnames, or SQL fragments. Only an allow-listed classification may pass.

afterEach(() => {
  vi.restoreAllMocks()
})

describe('classifySweepError — bounded allow-listed classification', () => {
  it('classifies Prisma known-error codes', () => {
    expect(classifySweepError({ code: 'P2028', message: 'anything' })).toBe('PRISMA_P2028')
  })
  it('classifies Postgres SQLSTATEs from meta.code', () => {
    expect(classifySweepError({ code: 'P2010', meta: { code: '57014' }, message: 'x' })).toBe('PG_57014')
  })
  it('classifies Node network errno codes', () => {
    expect(classifySweepError(Object.assign(new Error('boom'), { code: 'ECONNREFUSED' }))).toBe(
      'NET_ECONNREFUSED',
    )
  })
  it('falls back to the constructor name (letters only), never message text', () => {
    expect(classifySweepError(new TypeError('secret in message'))).toBe('ERR_TypeError')
  })
  it('anything unrecognised — including strings and errors with hostile names — is UNCLASSIFIED', () => {
    expect(classifySweepError('postgresql://user:pw@host/db')).toBe('UNCLASSIFIED')
    expect(classifySweepError(new Error('plain'))).toBe('UNCLASSIFIED') // bare Error name is not informative
    const hostileName = Object.assign(new Error('x'), { name: 'pw=hunter2 leak' })
    expect(classifySweepError(hostileName)).toBe('UNCLASSIFIED') // name must be letters-only to pass
  })
})

describe('defaultRecordSweepFailure — planted-secret proof', () => {
  it('a driver error carrying the connection string, password, and SQL NEVER reaches the log', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const planted = Object.assign(
      new Error(
        'connect to postgresql://redeemo:hunter2SECRET@ep-x.eu-neon.tech/db?password=hunter2SECRET failed while running SELECT * FROM "CommunicationLog" WHERE payload IS NOT NULL',
      ),
      { code: 'ECONNREFUSED' },
    )
    defaultRecordSweepFailure('outbox-reconcile', 'FAILURE', planted)
    expect(spy).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(spy.mock.calls[0])
    expect(logged).not.toContain('hunter2SECRET') // password fragments never logged
    expect(logged).not.toContain('postgresql://') // connection URL never logged
    expect(logged).not.toContain('neon.tech') // hostname never logged
    expect(logged).not.toContain('SELECT') // query fragments never logged
    expect(logged).toContain('NET_ECONNREFUSED') // …only the allow-listed class
    expect(logged).toContain('outbox-reconcile')
    expect(logged).toContain('FAILURE')
  })
})
