/**
 * adminTones.ts — semantic -> tone mapping unit tests.
 *
 * Covers court derivation (incl. the "closed" History case), the type-group
 * fold from the real 8-value ApprovalType enum to the spec's 4 chip groups,
 * and the age-tint boundaries at 12h/36h (B1 required test coverage).
 */
import {
  courtOf,
  COURT_LABEL,
  COURT_TONE,
  inNeedsYouTab,
  inAwaitingMerchantTab,
  typeGroupOf,
  typeChipTone,
  TYPE_GROUP_LABEL,
  ageToneForHours,
  approvalStatusLabel,
  approvalStatusTone,
  merchantLifecycle,
  voucherLifecycle,
} from '../adminTones'
import type { AdminApproval } from '@/lib/api/approvals'

const CURRENT_ADMIN = 'admin-me'

function approval(overrides: Partial<Pick<AdminApproval, 'status' | 'claimedById'>>) {
  return { status: 'PENDING' as const, claimedById: null, ...overrides }
}

// ── courtOf ───────────────────────────────────────────────────────────────

describe('courtOf', () => {
  it('is "you" for PENDING + unclaimed', () => {
    expect(courtOf(approval({ status: 'PENDING', claimedById: null }), CURRENT_ADMIN)).toBe('you')
  })

  it('is "you" for PENDING + claimed by the current admin', () => {
    expect(
      courtOf(approval({ status: 'PENDING', claimedById: CURRENT_ADMIN }), CURRENT_ADMIN)
    ).toBe('you')
  })

  it('is "other" for PENDING + claimed by a different admin', () => {
    expect(
      courtOf(approval({ status: 'PENDING', claimedById: 'admin-other' }), CURRENT_ADMIN)
    ).toBe('other')
  })

  it('is "merchant" for CHANGES_REQUESTED, regardless of claim owner', () => {
    expect(
      courtOf(approval({ status: 'CHANGES_REQUESTED', claimedById: null }), CURRENT_ADMIN)
    ).toBe('merchant')
    expect(
      courtOf(approval({ status: 'CHANGES_REQUESTED', claimedById: 'admin-other' }), CURRENT_ADMIN)
    ).toBe('merchant')
    expect(
      courtOf(approval({ status: 'CHANGES_REQUESTED', claimedById: CURRENT_ADMIN }), CURRENT_ADMIN)
    ).toBe('merchant')
  })

  it('is "closed" for every terminal status, regardless of claim owner', () => {
    for (const status of ['APPROVED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(courtOf(approval({ status, claimedById: null }), CURRENT_ADMIN)).toBe('closed')
      expect(courtOf(approval({ status, claimedById: 'admin-other' }), CURRENT_ADMIN)).toBe(
        'closed'
      )
    }
  })

  it('has a label + tone for every Court value', () => {
    const courts: Array<keyof typeof COURT_LABEL> = ['you', 'other', 'merchant', 'closed']
    for (const c of courts) {
      expect(COURT_LABEL[c]).toEqual(expect.any(String))
      expect(COURT_TONE[c]).toEqual(expect.any(String))
    }
  })
})

// ── Court tab membership ─────────────────────────────────────────────────────

describe('court tab membership', () => {
  it('inNeedsYouTab is true for PENDING regardless of claim (incl. claimed rows)', () => {
    expect(inNeedsYouTab({ status: 'PENDING' })).toBe(true)
  })

  it('inNeedsYouTab is false for every other status', () => {
    for (const status of ['CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(inNeedsYouTab({ status })).toBe(false)
    }
  })

  it('inAwaitingMerchantTab is true only for CHANGES_REQUESTED', () => {
    expect(inAwaitingMerchantTab({ status: 'CHANGES_REQUESTED' })).toBe(true)
    expect(inAwaitingMerchantTab({ status: 'PENDING' })).toBe(false)
    expect(inAwaitingMerchantTab({ status: 'APPROVED' })).toBe(false)
  })
})

// ── Type group / chip tone ───────────────────────────────────────────────────

describe('typeGroupOf + typeChipTone', () => {
  it('folds the 8 real ApprovalType values into the 4 spec groups', () => {
    expect(typeGroupOf('MERCHANT_ONBOARDING')).toBe('onboarding')
    expect(typeGroupOf('VOUCHER')).toBe('voucher')
    expect(typeGroupOf('VOUCHER_EDIT')).toBe('voucher')
    expect(typeGroupOf('MERCHANT_PROFILE_EDIT')).toBe('merchantEdit')
    expect(typeGroupOf('MERCHANT_IDENTITY_EDIT')).toBe('merchantEdit')
    expect(typeGroupOf('BRANCH_IDENTITY_EDIT')).toBe('merchantEdit')
    expect(typeGroupOf('BRANCH_CREATE')).toBe('branchLifecycle')
    expect(typeGroupOf('BRANCH_CLOSE')).toBe('branchLifecycle')
  })

  it('assigns the 4 spec-mandated distinct tones (cyan/violet/info/success)', () => {
    expect(typeChipTone('MERCHANT_ONBOARDING')).toBe('cyan')
    expect(typeChipTone('VOUCHER')).toBe('violet')
    expect(typeChipTone('MERCHANT_PROFILE_EDIT')).toBe('info')
    expect(typeChipTone('BRANCH_CREATE')).toBe('success')
  })

  it('has a label for every type group', () => {
    expect(TYPE_GROUP_LABEL.onboarding).toBe('Onboarding')
    expect(TYPE_GROUP_LABEL.voucher).toBe('Voucher')
    expect(TYPE_GROUP_LABEL.merchantEdit).toBe('Merchant edit')
    expect(TYPE_GROUP_LABEL.branchLifecycle).toBe('Branch lifecycle')
  })
})

// ── Age tint boundaries (B1 required coverage: 12h / 36h) ───────────────────

describe('ageToneForHours', () => {
  it('is neutral below 12h', () => {
    expect(ageToneForHours(0)).toBe('neutral')
    expect(ageToneForHours(11)).toBe('neutral')
  })

  it('is warn (amber) at exactly 12h and up to 35h', () => {
    expect(ageToneForHours(12)).toBe('warn')
    expect(ageToneForHours(24)).toBe('warn')
    expect(ageToneForHours(35)).toBe('warn')
  })

  it('is danger (red) at exactly 36h and beyond', () => {
    expect(ageToneForHours(36)).toBe('danger')
    expect(ageToneForHours(100)).toBe('danger')
  })
})

// ── Two-pill Status (B2) ──────────────────────────────────────────────────

describe('approvalStatusLabel + approvalStatusTone', () => {
  it('maps every ApprovalStatus value to its spec-aligned label + tone', () => {
    expect(approvalStatusLabel('PENDING')).toBe('Pending')
    expect(approvalStatusTone('PENDING')).toBe('neutral')

    expect(approvalStatusLabel('APPROVED')).toBe('Approved')
    expect(approvalStatusTone('APPROVED')).toBe('success')

    expect(approvalStatusLabel('REJECTED')).toBe('Rejected')
    expect(approvalStatusTone('REJECTED')).toBe('danger')

    expect(approvalStatusLabel('CHANGES_REQUESTED')).toBe('Changes requested')
    expect(approvalStatusTone('CHANGES_REQUESTED')).toBe('warn')

    expect(approvalStatusLabel('WITHDRAWN')).toBe('Withdrawn')
    expect(approvalStatusTone('WITHDRAWN')).toBe('neutral')
  })

  it('passes an unknown status through as the label, neutral tone', () => {
    expect(approvalStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(approvalStatusTone('SOMETHING_NEW')).toBe('neutral')
  })
})

describe('merchantLifecycle', () => {
  it('is "Live" (success) for an ACTIVE merchant, regardless of this approval\'s own status', () => {
    expect(merchantLifecycle('ACTIVE', 'PENDING', null)).toEqual({ label: 'Live', tone: 'success' })
    expect(merchantLifecycle('ACTIVE', 'APPROVED', 'admin-1')).toEqual({ label: 'Live', tone: 'success' })
  })

  it('is "Suspended" (danger) for a SUSPENDED merchant', () => {
    expect(merchantLifecycle('SUSPENDED', 'PENDING', null)).toEqual({ label: 'Suspended', tone: 'danger' })
  })

  it('is "Inactive" (neutral) for an INACTIVE merchant', () => {
    expect(merchantLifecycle('INACTIVE', 'PENDING', null)).toEqual({ label: 'Inactive', tone: 'neutral' })
  })

  it('is "Deleted" (neutral) for a DELETED merchant', () => {
    expect(merchantLifecycle('DELETED', 'PENDING', null)).toEqual({ label: 'Deleted', tone: 'neutral' })
  })

  it('is "Submitted" (cyan) for a not-yet-live merchant with an unclaimed PENDING approval', () => {
    expect(merchantLifecycle('PENDING_APPROVAL', 'PENDING', null)).toEqual({ label: 'Submitted', tone: 'cyan' })
    expect(merchantLifecycle('REGISTERED', 'PENDING', null)).toEqual({ label: 'Submitted', tone: 'cyan' })
  })

  it('is "In review" (warn) for a not-yet-live merchant whose approval is claimed', () => {
    expect(merchantLifecycle('PENDING_APPROVAL', 'PENDING', 'admin-1')).toEqual({ label: 'In review', tone: 'warn' })
  })

  it('is "Changes needed" (warn) for a not-yet-live merchant awaiting merchant changes', () => {
    expect(merchantLifecycle('PENDING_APPROVAL', 'CHANGES_REQUESTED', null)).toEqual({
      label: 'Changes needed',
      tone: 'warn',
    })
    // Claim state does not override the changes-needed signal.
    expect(merchantLifecycle('PENDING_APPROVAL', 'CHANGES_REQUESTED', 'admin-1')).toEqual({
      label: 'Changes needed',
      tone: 'warn',
    })
  })
})

describe('voucherLifecycle', () => {
  it('is "Live" (success) for an ACTIVE voucher', () => {
    expect(voucherLifecycle('ACTIVE', 'APPROVED', null)).toEqual({ label: 'Live', tone: 'success' })
  })

  it('is "Inactive" / "Expired" / "Draft" (neutral) for the other settled lifecycles', () => {
    expect(voucherLifecycle('INACTIVE', 'APPROVED', null)).toEqual({ label: 'Inactive', tone: 'neutral' })
    expect(voucherLifecycle('EXPIRED', 'APPROVED', null)).toEqual({ label: 'Expired', tone: 'neutral' })
    expect(voucherLifecycle('DRAFT', 'PENDING', null)).toEqual({ label: 'Draft', tone: 'neutral' })
  })

  it('shares the claim-aware pending sub-state with merchantLifecycle for PENDING_APPROVAL', () => {
    expect(voucherLifecycle('PENDING_APPROVAL', 'PENDING', null)).toEqual({ label: 'Submitted', tone: 'cyan' })
    expect(voucherLifecycle('PENDING_APPROVAL', 'PENDING', 'admin-1')).toEqual({ label: 'In review', tone: 'warn' })
    expect(voucherLifecycle('PENDING_APPROVAL', 'CHANGES_REQUESTED', null)).toEqual({
      label: 'Changes needed',
      tone: 'warn',
    })
  })
})
