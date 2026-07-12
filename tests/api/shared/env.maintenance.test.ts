import { describe, it, expect } from 'vitest'
import { resolveMaintenanceConfig, MAINTENANCE_IDLE_FLOOR_MIN_MS } from '../../../src/api/shared/env'

// Neon CU-burn PR-A Task A4: the fail-safe maintenance startup policy (spec §14).
// Canonical order: MAINTENANCE_MODE resolved FIRST; `disabled` is the ONLY
// intentional off-path; enabled/defaulted requires every value present + valid;
// an unsupported mode fails startup; a validation failure NEVER silently
// becomes disabled mode.

const VALID: NodeJS.ProcessEnv = {
  MAINTENANCE_FLOOR_IDLE_MS: '1800000',
  MAINTENANCE_FLOOR_ACTIVE_MS: '5000',
  MAINTENANCE_PHASE_B_MAX_ITEMS: '200',
  MAINTENANCE_PHASE_B_BUDGET_MS: '10000',
  MAINTENANCE_STATEMENT_TIMEOUT_MS: '4000',
  MAINTENANCE_TX_TIMEOUT_MS: '8000',
  MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'true',
  MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'true',
  MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'true',
  MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED: 'true',
}

describe('resolveMaintenanceConfig — canonical MAINTENANCE_MODE startup policy', () => {
  it('MAINTENANCE_MODE=disabled boots without the scheduler and does NOT require the scheduler values', () => {
    expect(resolveMaintenanceConfig({ MAINTENANCE_MODE: 'disabled' })).toEqual({ mode: 'disabled' })
  })

  it('mode unset defaults to enabled and parses every value', () => {
    const cfg = resolveMaintenanceConfig({ ...VALID })
    expect(cfg).toEqual({
      mode: 'enabled',
      floorIdleMs: 1_800_000,
      floorActiveMs: 5000,
      phaseBMaxItems: 200,
      phaseBBudgetMs: 10_000,
      statementTimeoutMs: 4000,
      txTimeoutMs: 8000,
      sweepOutboxEnabled: true,
      sweepPendingHoursEnabled: true,
      sweepClaimStaleEnabled: true,
      sweepLeadAnonymiseEnabled: true,
    })
  })

  it('the lead-anonymise enable flag is a REQUIRED bool when enabled (its own rollback switch)', () => {
    const noLead = { ...VALID }
    delete noLead.MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED
    expect(() => resolveMaintenanceConfig(noLead)).toThrow(/MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED/)
    expect(() =>
      resolveMaintenanceConfig({ ...VALID, MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED: 'yes' }),
    ).toThrow(/exactly "true" or "false"/)
    // Independent of the siblings (each flag is that sweep's rollback switch).
    const cfg = resolveMaintenanceConfig({ ...VALID, MAINTENANCE_SWEEP_LEAD_ANONYMISE_ENABLED: 'false' })
    expect(cfg).toMatchObject({ sweepLeadAnonymiseEnabled: false, sweepClaimStaleEnabled: true })
  })

  it('PR-B: the pending-hours + claim-stale enable flags are REQUIRED bools when enabled, and parse independently', () => {
    // Missing either flag fails startup with the flag named.
    const noPending = { ...VALID }
    delete noPending.MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED
    expect(() => resolveMaintenanceConfig(noPending)).toThrow(/MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED/)
    const noStale = { ...VALID }
    delete noStale.MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED
    expect(() => resolveMaintenanceConfig(noStale)).toThrow(/MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED/)
    // Strict booleans only.
    expect(() =>
      resolveMaintenanceConfig({ ...VALID, MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'yes' }),
    ).toThrow(/exactly "true" or "false"/)
    // The flags map independently (each is that sweep's rollback switch).
    const cfg = resolveMaintenanceConfig({
      ...VALID,
      MAINTENANCE_SWEEP_PENDING_HOURS_ENABLED: 'false',
      MAINTENANCE_SWEEP_CLAIM_STALE_ENABLED: 'true',
    })
    expect(cfg).toMatchObject({ sweepPendingHoursEnabled: false, sweepClaimStaleEnabled: true, sweepOutboxEnabled: true })
  })

  it('MAINTENANCE_MODE=enabled behaves identically to unset', () => {
    const cfg = resolveMaintenanceConfig({ ...VALID, MAINTENANCE_MODE: 'enabled' })
    expect(cfg.mode).toBe('enabled')
  })

  it('an unsupported MAINTENANCE_MODE value fails startup — never coerced to disabled or enabled', () => {
    // Even with a fully VALID value set, an unrecognised mode must throw.
    expect(() => resolveMaintenanceConfig({ ...VALID, MAINTENANCE_MODE: 'off' })).toThrow(/unsupported MAINTENANCE_MODE/)
    expect(() => resolveMaintenanceConfig({ ...VALID, MAINTENANCE_MODE: 'DISABLED' })).toThrow(/unsupported/)
  })

  it('missing config with mode unset THROWS (fail-startup), listing EVERY problem — it never resolves to disabled', () => {
    let threw: Error | null = null
    try {
      resolveMaintenanceConfig({})
    } catch (err) {
      threw = err as Error
    }
    expect(threw).not.toBeNull() // asserts a throw, NOT a disabled-boot
    expect(threw!.message).toContain('MAINTENANCE_FLOOR_IDLE_MS')
    expect(threw!.message).toContain('MAINTENANCE_TX_TIMEOUT_MS')
    expect(threw!.message).toContain('MAINTENANCE_SWEEP_OUTBOX_ENABLED')
    expect(threw!.message).toContain('MAINTENANCE_MODE=disabled') // points at the ONLY legitimate off-path
  })

  it(`rejects IDLE_MS=${MAINTENANCE_IDLE_FLOOR_MIN_MS} (must EXCEED the 5-minute scale-to-zero window)`, () => {
    expect(() =>
      resolveMaintenanceConfig({ ...VALID, MAINTENANCE_FLOOR_IDLE_MS: String(MAINTENANCE_IDLE_FLOOR_MIN_MS) }),
    ).toThrow(/MAINTENANCE_FLOOR_IDLE_MS/)
    expect(
      resolveMaintenanceConfig({
        ...VALID,
        MAINTENANCE_FLOOR_IDLE_MS: String(MAINTENANCE_IDLE_FLOOR_MIN_MS + 1),
      }).mode,
    ).toBe('enabled')
  })

  it('rejects STATEMENT >= TX (the statement bound must sit inside the tx bound)', () => {
    expect(() =>
      resolveMaintenanceConfig({
        ...VALID,
        MAINTENANCE_STATEMENT_TIMEOUT_MS: '8000',
        MAINTENANCE_TX_TIMEOUT_MS: '8000',
      }),
    ).toThrow(/must be < MAINTENANCE_TX_TIMEOUT_MS/)
  })

  it('rejects non-integer values and a non-boolean sweep flag', () => {
    expect(() => resolveMaintenanceConfig({ ...VALID, MAINTENANCE_FLOOR_ACTIVE_MS: 'fast' })).toThrow(/integer/)
    expect(() => resolveMaintenanceConfig({ ...VALID, MAINTENANCE_SWEEP_OUTBOX_ENABLED: 'yes' })).toThrow(
      /exactly "true" or "false"/,
    )
  })
})
