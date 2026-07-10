/**
 * rowHelpers — pure row-derivation unit tests.
 */
import {
  getDisplayStatus,
  getStatusBadgeTone,
  getTypeLabel,
  voucherTypeLabel,
  getVerificationLabel,
  getVerificationTone,
  waitingSubLine,
  deriveRow,
  deriveStatusPills,
  sortItems,
} from '../rowHelpers'
import type { AdminApproval } from '@/lib/api/approvals'

const CURRENT_ADMIN = 'admin-me'

function makeApproval(overrides: Partial<AdminApproval> = {}): AdminApproval {
  return {
    id: 'a-1',
    type: 'MERCHANT_ONBOARDING',
    referenceId: 'ref-1',
    referenceType: 'MERCHANT',
    status: 'PENDING',
    adminUserId: null,
    comment: null,
    submittedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    actionedAt: null,
    claimedById: null,
    claimedAt: null,
    claimedBy: null,
    merchant: {
      id: 'm-1',
      businessName: 'Acme Coffee',
      status: 'PENDING_APPROVAL',
      onboardingStep: 'SUBMIT_FOR_REVIEW',
      verificationStatus: 'PENDING',
      contractStatus: 'SIGNED',
    },
    ...overrides,
  }
}

// ── getDisplayStatus / getStatusBadgeTone ────────────────────────────────────

describe('getDisplayStatus', () => {
  it('maps every AdminApproval.status to its display label', () => {
    expect(getDisplayStatus(makeApproval({ status: 'PENDING', claimedById: null }))).toBe(
      'Submitted'
    )
    expect(getDisplayStatus(makeApproval({ status: 'PENDING', claimedById: 'x' }))).toBe(
      'Under review'
    )
    expect(getDisplayStatus(makeApproval({ status: 'CHANGES_REQUESTED' }))).toBe(
      'Changes requested'
    )
    expect(getDisplayStatus(makeApproval({ status: 'APPROVED' }))).toBe('Approved')
    expect(getDisplayStatus(makeApproval({ status: 'REJECTED' }))).toBe('Rejected')
    expect(getDisplayStatus(makeApproval({ status: 'WITHDRAWN' }))).toBe('Withdrawn')
  })
})

describe('getStatusBadgeTone', () => {
  it('gives Approved a success tone and Rejected a danger tone (B1 History extension)', () => {
    expect(getStatusBadgeTone('Approved')).toBe('success')
    expect(getStatusBadgeTone('Rejected')).toBe('danger')
  })

  it('keeps the pre-existing M4 tones intact', () => {
    expect(getStatusBadgeTone('Submitted')).toBe('warn')
    expect(getStatusBadgeTone('Under review')).toBe('info')
    expect(getStatusBadgeTone('Changes requested')).toBe('danger')
    expect(getStatusBadgeTone('Withdrawn')).toBe('neutral')
  })
})

// ── getTypeLabel ──────────────────────────────────────────────────────────

describe('getTypeLabel', () => {
  it('labels a VOUCHER_EDIT row by its voucherEditKind, with a generic fallback', () => {
    expect(
      getTypeLabel(makeApproval({ type: 'VOUCHER_EDIT', voucherEditKind: 'CHANGE' }))
    ).toBe('Voucher change request')
    expect(getTypeLabel(makeApproval({ type: 'VOUCHER_EDIT', voucherEditKind: 'END' }))).toBe(
      'Voucher end request'
    )
    expect(getTypeLabel(makeApproval({ type: 'VOUCHER_EDIT' }))).toBe('Voucher edit request')
  })

  it('labels every other type', () => {
    expect(getTypeLabel(makeApproval({ type: 'MERCHANT_ONBOARDING' }))).toBe('Onboarding')
    expect(getTypeLabel(makeApproval({ type: 'VOUCHER' }))).toBe('Voucher')
    expect(getTypeLabel(makeApproval({ type: 'BRANCH_CREATE' }))).toBe('Branch: add')
    expect(getTypeLabel(makeApproval({ type: 'BRANCH_CLOSE' }))).toBe('Branch: close')
  })
})

describe('voucherTypeLabel', () => {
  it('maps known voucher types to friendly labels, unknown types pass through', () => {
    expect(voucherTypeLabel('DISCOUNT')).toBe('Discount')
    expect(voucherTypeLabel('SPEND_AND_SAVE')).toBe('Spend and save')
    expect(voucherTypeLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
})

// ── Verification ──────────────────────────────────────────────────────────

describe('getVerificationLabel / getVerificationTone', () => {
  it('sentence-cases the label and tones it', () => {
    expect(getVerificationLabel('VERIFIED')).toBe('Verified')
    expect(getVerificationTone('VERIFIED')).toBe('success')
    expect(getVerificationLabel('PENDING')).toBe('Pending')
    expect(getVerificationTone('PENDING')).toBe('warn')
    expect(getVerificationLabel('REJECTED')).toBe('Rejected')
    expect(getVerificationTone('REJECTED')).toBe('danger')
  })
})

// ── waitingSubLine ────────────────────────────────────────────────────────

describe('waitingSubLine', () => {
  it('is null for a live "you"/"other" row', () => {
    expect(waitingSubLine(makeApproval({ status: 'PENDING' }), 'you')).toBeNull()
    expect(waitingSubLine(makeApproval({ status: 'PENDING' }), 'other')).toBeNull()
  })

  it('reads "with merchant · changes requested" for the merchant court', () => {
    expect(waitingSubLine(makeApproval({ status: 'CHANGES_REQUESTED' }), 'merchant')).toBe(
      'with merchant · changes requested'
    )
  })

  it('reads "{Verb} {age} ago" for a closed row, using actionedAt', () => {
    const actionedAt = new Date(Date.now() - 3 * 86_400_000).toISOString() // 3 days ago
    const line = waitingSubLine(
      makeApproval({ status: 'APPROVED', actionedAt }),
      'closed'
    )
    expect(line).toBe(`Approved ${'3d 0h'} ago`)
  })

  it('falls back to submittedAt when a closed row has no actionedAt (e.g. WITHDRAWN)', () => {
    const submittedAt = new Date(Date.now() - 86_400_000).toISOString() // 1 day ago
    const line = waitingSubLine(
      makeApproval({ status: 'WITHDRAWN', actionedAt: null, submittedAt }),
      'closed'
    )
    expect(line).toBe('Withdrawn 1d 0h ago')
  })
})

// ── deriveRow (combined) ─────────────────────────────────────────────────────

describe('deriveRow', () => {
  it('derives court/type/status/waiting consistently for a plain onboarding row', () => {
    const row = deriveRow(
      makeApproval({ status: 'PENDING', claimedById: null, type: 'MERCHANT_ONBOARDING' }),
      CURRENT_ADMIN
    )
    expect(row.court).toBe('you')
    expect(row.courtLabel).toBe('Needs you')
    expect(row.courtTone).toBe('success')
    expect(row.displayStatus).toBe('Submitted')
    expect(row.typeLabel).toBe('Onboarding')
    expect(row.typeTone).toBe('cyan')
    expect(row.businessName).toBe('Acme Coffee')
    expect(row.isVoucherRow).toBe(false)
    expect(row.primaryLabel).toBe('Acme Coffee')
  })

  it('leads with the voucher title for a VOUCHER row and tones it violet', () => {
    const row = deriveRow(
      makeApproval({
        type: 'VOUCHER',
        merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' } as AdminApproval['merchant'],
        voucher: { title: '20% off all mains', type: 'DISCOUNT', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
      }),
      CURRENT_ADMIN
    )
    expect(row.isVoucherRow).toBe(true)
    expect(row.primaryLabel).toBe('20% off all mains')
    expect(row.primarySubLabel).toBe('Acme Coffee · Discount')
    expect(row.typeTone).toBe('violet')
  })

  it('falls back to "Unknown merchant" when merchant is null (optional-field grace)', () => {
    const row = deriveRow(makeApproval({ merchant: null }), CURRENT_ADMIN)
    expect(row.businessName).toBe('Unknown merchant')
    expect(row.primaryLabel).toBe('Unknown merchant')
  })

  it('is "closed" court + neutral waiting tone + success status for an APPROVED row', () => {
    const row = deriveRow(makeApproval({ status: 'APPROVED' }), CURRENT_ADMIN)
    expect(row.court).toBe('closed')
    expect(row.waitingTone).toBe('neutral')
    expect(row.statusTone).toBe('success')
  })
})

// ── deriveStatusPills (B2 two-pill Status) ───────────────────────────────────

describe('deriveStatusPills', () => {
  it('derives a lifecycle pill from merchant.status for a merchant-bearing row', () => {
    const { lifecyclePill, approvalPill } = deriveStatusPills(
      makeApproval({ status: 'PENDING', claimedById: null, merchant: { ...makeApproval().merchant!, status: 'ACTIVE' } })
    )
    expect(lifecyclePill).toEqual({ label: 'Live', tone: 'success' })
    expect(approvalPill).toEqual({ label: 'Pending', tone: 'neutral' })
  })

  it('the approval pill is claim-unaware (PENDING+claimed still reads "Pending")', () => {
    const { approvalPill } = deriveStatusPills(makeApproval({ status: 'PENDING', claimedById: 'admin-other' }))
    expect(approvalPill).toEqual({ label: 'Pending', tone: 'neutral' })
  })

  it('derives a lifecycle pill from voucher.status (not merchant.status) for a VOUCHER row', () => {
    const { lifecyclePill } = deriveStatusPills(
      makeApproval({
        type: 'VOUCHER',
        status: 'PENDING',
        merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' } as AdminApproval['merchant'],
        voucher: { title: '20% off', type: 'DISCOUNT', status: 'DRAFT', approvalStatus: 'PENDING' },
      })
    )
    // The voucher is DRAFT even though the merchant is ACTIVE — the voucher's
    // own lifecycle wins for a VOUCHER-type row.
    expect(lifecyclePill).toEqual({ label: 'Draft', tone: 'neutral' })
  })

  it('has no lifecycle pill (honest single-pill fallback) when merchant is null', () => {
    const { lifecyclePill, approvalPill } = deriveStatusPills(makeApproval({ merchant: null }))
    expect(lifecyclePill).toBeNull()
    expect(approvalPill.label).toBe('Pending')
  })

  it('lifecycle pill reflects CHANGES_REQUESTED as "Changes needed", approval pill as "Changes requested"', () => {
    const { lifecyclePill, approvalPill } = deriveStatusPills(makeApproval({ status: 'CHANGES_REQUESTED' }))
    expect(lifecyclePill).toEqual({ label: 'Changes needed', tone: 'warn' })
    expect(approvalPill).toEqual({ label: 'Changes requested', tone: 'warn' })
  })
})

// ── sortItems (B2 client-side sort) ───────────────────────────────────────────

describe('sortItems', () => {
  it('returns the items unchanged (same order) when column is null', () => {
    const items = [makeApproval({ id: 'b' }), makeApproval({ id: 'a' })]
    expect(sortItems(items, CURRENT_ADMIN, null, 'asc')).toEqual(items)
  })

  it('sorts by merchant name (primaryLabel) ascending and descending', () => {
    const items = [
      makeApproval({ id: '1', merchant: { ...makeApproval().merchant!, businessName: 'Zeta Cafe' } }),
      makeApproval({ id: '2', merchant: { ...makeApproval().merchant!, businessName: 'Alpha Diner' } }),
    ]
    const asc = sortItems(items, CURRENT_ADMIN, 'merchant', 'asc')
    expect(asc.map((i) => i.id)).toEqual(['2', '1'])
    const desc = sortItems(items, CURRENT_ADMIN, 'merchant', 'desc')
    expect(desc.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('sorts by type label', () => {
    const items = [
      makeApproval({ id: '1', type: 'VOUCHER', voucher: { title: 'x', type: 'DISCOUNT', status: 'ACTIVE', approvalStatus: 'PENDING' } }),
      makeApproval({ id: '2', type: 'MERCHANT_ONBOARDING' }),
    ]
    const asc = sortItems(items, CURRENT_ADMIN, 'type', 'asc')
    // "Onboarding" < "Voucher" alphabetically.
    expect(asc.map((i) => i.id)).toEqual(['2', '1'])
  })

  it('sorts by waiting age (oldest first ascending, newest first descending)', () => {
    const items = [
      makeApproval({ id: 'new', submittedAt: new Date(Date.now() - 1 * 3_600_000).toISOString() }),
      makeApproval({ id: 'old', submittedAt: new Date(Date.now() - 48 * 3_600_000).toISOString() }),
    ]
    const asc = sortItems(items, CURRENT_ADMIN, 'waiting', 'asc')
    expect(asc.map((i) => i.id)).toEqual(['new', 'old'])
    const desc = sortItems(items, CURRENT_ADMIN, 'waiting', 'desc')
    expect(desc.map((i) => i.id)).toEqual(['old', 'new'])
  })

  it('sorts by owner/claim: unclaimed first, then claimer name alphabetically', () => {
    const items = [
      makeApproval({ id: 'zed', claimedById: 'a2', claimedBy: { id: 'a2', name: 'Zed Reviewer' } }),
      makeApproval({ id: 'unclaimed', claimedById: null, claimedBy: null }),
      makeApproval({ id: 'amy', claimedById: 'a1', claimedBy: { id: 'a1', name: 'Amy Reviewer' } }),
    ]
    const asc = sortItems(items, CURRENT_ADMIN, 'owner', 'asc')
    expect(asc.map((i) => i.id)).toEqual(['unclaimed', 'amy', 'zed'])
  })

  it('does not mutate the input array', () => {
    const items = [makeApproval({ id: 'b' }), makeApproval({ id: 'a' })]
    const original = [...items]
    sortItems(items, CURRENT_ADMIN, 'merchant', 'asc')
    expect(items).toEqual(original)
  })
})
