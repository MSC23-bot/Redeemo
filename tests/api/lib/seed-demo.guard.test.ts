// Structural guard for prisma/seed-demo.ts (PR #400 review blockers).
//
// Source-scan style (same approach as tests/api/legal/*.guard.test.ts and the
// discovery seed-data-exclusion guard): these assertions pin the safety
// contract of the demo seed without touching a database.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(__dirname, '../../../prisma/seed-demo.ts'), 'utf8')

const seedStart = src.indexOf('async function seedDemo')
const clearStart = src.indexOf('async function clearDemo')
const seedBody = src.slice(seedStart, clearStart)
const clearBody = src.slice(clearStart)
const beforeFunctions = src.slice(0, seedStart)

describe('seed-demo structural safety contract', () => {
  it('has both seedDemo and clearDemo', () => {
    expect(seedStart).toBeGreaterThan(-1)
    expect(clearStart).toBeGreaterThan(seedStart)
  })

  it('fail-closed target guard runs at module level, before either mode', () => {
    expect(beforeFunctions).toContain('assertConfirmedSeedTarget(')
  })

  it('ENCRYPTION_KEY is required only on the seeding path, never at module level or in clear', () => {
    expect(beforeFunctions).not.toMatch(/^\s*requireSeedEncryptionKey\(\)/m)
    expect(seedBody).toContain('requireSeedEncryptionKey()')
    expect(clearBody).not.toContain('requireSeedEncryptionKey()')
  })

  it('teardown deletes redemptions BEFORE vouchers/branches/users (RESTRICT FKs)', () => {
    const redemptionDel = clearBody.indexOf('voucherRedemption.deleteMany')
    expect(redemptionDel).toBeGreaterThan(-1)
    for (const later of ['voucher.deleteMany', 'branch.deleteMany', 'user.deleteMany']) {
      const idx = clearBody.indexOf(later)
      expect(idx, `${later} present`).toBeGreaterThan(-1)
      expect(redemptionDel, `redemptions delete before ${later}`).toBeLessThan(idx)
    }
  })

  it('every table seedDemo writes has a teardown delete in clearDemo', () => {
    const writes = [...seedBody.matchAll(/prisma\.(\w+)\.(?:create|createMany|upsert)/g)].map(m => m[1])
    const written = [...new Set(writes)]
    expect(written.length).toBeGreaterThan(0)
    for (const model of written) {
      expect(clearBody, `clearDemo deletes from ${model}`).toContain(`prisma.${model}.deleteMany`)
    }
  })

  it('teardown is truthful: failures are collected and produce a non-zero exit, success line is unreachable after failure', () => {
    expect(clearBody).toContain('failures.push')
    expect(clearBody).toContain('process.exitCode = 1')
    const failureExit = clearBody.indexOf('process.exitCode = 1')
    const successLine = clearBody.indexOf('Demo records cleared')
    expect(failureExit).toBeGreaterThan(-1)
    expect(successLine).toBeGreaterThan(failureExit)
    // the failure branch returns before the success line
    const between = clearBody.slice(failureExit, successLine)
    expect(between).toContain('return')
  })

  it('demo campaigns are real journeys: banner imagery and CampaignMerchant links are seeded', () => {
    expect(seedBody).toContain('bannerImageUrl')
    expect(seedBody).toContain('campaignMerchant.create')
    expect(clearBody).toContain('campaignMerchant.deleteMany')
    expect(clearBody).toContain('campaign.deleteMany')
  })

  it('demo rows stay prefix-classifiable for audits and sweeps', () => {
    for (const prefix of ["'demo-red-'", "'demo-campaign-'", "'demo-cm-'", "'RMV-demo-'", "'RCV-demo-'"]) {
      expect(clearBody, `clear filters on ${prefix}`).toContain(prefix)
    }
  })

  it('demo branches are rankable (locationConfidence MANUALLY_CONFIRMED on create and update)', () => {
    const occurrences = seedBody.match(/locationConfidence: 'MANUALLY_CONFIRMED'/g) ?? []
    expect(occurrences.length).toBeGreaterThanOrEqual(2)
  })

  it('never touches isTestData semantics (the display tier relies on schema defaults, filters stay in the API)', () => {
    expect(src).not.toContain('isTestData')
  })
})
