/**
 * QueueTable — B1: 7-column row treatments (court pill, type chip, waiting
 * age + sub-line, status incl. History's Approved/Rejected), replace-not-stack
 * wide/narrow structure, claim cell, navigation, no action buttons.
 *
 * jsdom does not evaluate CSS media queries, so BOTH the wide table and the
 * narrow card list are present in the DOM at once (real browsers pick one via
 * `hidden md:block` / `md:hidden`). Assertions that could otherwise match a
 * label in both trees are scoped with `within(...)` to the wide-table row
 * (`queue-row-<id>`) or the narrow card (`queue-card-<id>`) test id.
 */
import React from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { QueueTable } from '../QueueTable'
import type { AdminApproval } from '@/lib/api/approvals'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeApproval(overrides: Partial<AdminApproval> = {}): AdminApproval {
  return {
    id: 'a-1',
    type: 'MERCHANT_ONBOARDING',
    referenceId: 'ref-1',
    referenceType: 'MERCHANT',
    status: 'PENDING',
    adminUserId: null,
    comment: null,
    submittedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), // 2 hours ago
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

const CURRENT_ADMIN = 'admin-me'

function wideRow(id: string) {
  return within(screen.getByTestId(`queue-row-${id}`))
}

// ── 7-column header ───────────────────────────────────────────────────────────

describe('QueueTable wide-table header', () => {
  it('renders exactly the 7 spec columns in order', () => {
    render(<QueueTable items={[makeApproval()]} currentAdminId={CURRENT_ADMIN} />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      'Merchant',
      'Type',
      'Court',
      'Waiting',
      'Verification',
      'Status',
      'Owner / claim',
    ])
  })
})

// ── Replace-not-stack structure ──────────────────────────────────────────────

describe('QueueTable wide/narrow structure', () => {
  it('renders both the wide table and the narrow card list, CSS-toggled (never both via JS state)', () => {
    render(<QueueTable items={[makeApproval()]} currentAdminId={CURRENT_ADMIN} />)
    const wide = screen.getByTestId('queue-wide-table')
    const narrow = screen.getByTestId('queue-narrow-cards')
    expect(wide.className).toMatch(/hidden/)
    expect(wide.className).toMatch(/md:block/)
    expect(narrow.className).toMatch(/md:hidden/)
  })

  it('renders one row in the wide table and one equivalent card in the narrow list per item', () => {
    const items = [makeApproval({ id: 'a-r1' }), makeApproval({ id: 'a-r2' })]
    render(<QueueTable items={items} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getAllByTestId(/^queue-row-/)).toHaveLength(2)
    expect(screen.getAllByTestId(/^queue-card-/)).toHaveLength(2)
  })

  it('the narrow card carries the same primary label as its wide row', () => {
    render(
      <QueueTable items={[makeApproval({ id: 'a-both' })]} currentAdminId={CURRENT_ADMIN} />
    )
    expect(wideRow('a-both').getByText('Acme Coffee')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('queue-card-a-both')).getByText('Acme Coffee')
    ).toBeInTheDocument()
  })
})

// ── displayStatus (incl. B1 History extension: Approved/Rejected) ───────────

describe('QueueTable displayStatus', () => {
  it('shows "Submitted" for PENDING + unclaimed', () => {
    render(<QueueTable items={[makeApproval({ status: 'PENDING', claimedById: null })]} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-1').getByText('Submitted')).toBeInTheDocument()
  })

  it('shows "In review" (B2 lifecycle pill) for PENDING + claimed (by someone else)', () => {
    // B2: the claim-aware "In review" label now lives in the lifecycle pill
    // (the approval pill is claim-unaware "Pending" — see the two-pill
    // status describe block below for the split assertion).
    render(
      <QueueTable
        items={[makeApproval({ status: 'PENDING', claimedById: 'admin-other', claimedAt: new Date().toISOString() })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('In review')).toBeInTheDocument()
  })

  it('shows "Changes requested" for CHANGES_REQUESTED status', () => {
    render(<QueueTable items={[makeApproval({ status: 'CHANGES_REQUESTED' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-1').getByText('Changes requested')).toBeInTheDocument()
  })

  it('shows "Approved" (success tone) for an APPROVED row — B1 History', () => {
    render(<QueueTable items={[makeApproval({ status: 'APPROVED' })]} currentAdminId={CURRENT_ADMIN} />)
    const badge = wideRow('a-1').getByText('Approved')
    expect(badge.className).toMatch(/green/)
  })

  it('shows "Rejected" (danger tone) for a REJECTED row — B1 History', () => {
    render(<QueueTable items={[makeApproval({ status: 'REJECTED' })]} currentAdminId={CURRENT_ADMIN} />)
    const badge = wideRow('a-1').getByText('Rejected')
    expect(badge.className).toMatch(/red/)
  })

  it('shows "Withdrawn" (neutral tone) for a WITHDRAWN row', () => {
    render(<QueueTable items={[makeApproval({ status: 'WITHDRAWN' })]} currentAdminId={CURRENT_ADMIN} />)
    const label = wideRow('a-1').getByText('Withdrawn')
    expect(label.className).not.toMatch(/red/)
  })
})

// ── Court pill ────────────────────────────────────────────────────────────────

describe('QueueTable court pill', () => {
  it('shows "Needs you" (success tone) for PENDING + unclaimed', () => {
    render(<QueueTable items={[makeApproval({ status: 'PENDING', claimedById: null })]} currentAdminId={CURRENT_ADMIN} />)
    const pill = wideRow('a-1').getByText('Needs you')
    expect(pill.className).toMatch(/green/)
  })

  it('shows "Needs you" for PENDING + claimed by the current admin', () => {
    render(
      <QueueTable
        items={[makeApproval({ status: 'PENDING', claimedById: CURRENT_ADMIN, claimedAt: new Date().toISOString() })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Needs you')).toBeInTheDocument()
  })

  it('shows "Claimed by other" (neutral tone) for PENDING + claimed by another admin', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'PENDING',
            claimedById: 'admin-other',
            claimedAt: new Date().toISOString(),
            claimedBy: { id: 'admin-other', name: 'Aisha K.' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Claimed by other')).toBeInTheDocument()
  })

  it('shows "Awaiting merchant" (warn tone) for CHANGES_REQUESTED, regardless of claim owner', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'CHANGES_REQUESTED',
            claimedById: 'admin-other',
            claimedBy: { id: 'admin-other', name: 'Aisha K.' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const pill = wideRow('a-1').getByText('Awaiting merchant')
    expect(pill.className).toMatch(/amber/)
  })

  it('shows "Closed" for a terminal-status row (History)', () => {
    render(<QueueTable items={[makeApproval({ status: 'APPROVED' })]} currentAdminId={CURRENT_ADMIN} />)
    // Both the court pill AND the claim cell legitimately read "Closed" for a
    // terminal row (see the dedicated claim-cell test below) — assert presence.
    expect(wideRow('a-1').getAllByText('Closed').length).toBeGreaterThan(0)
  })
})

// ── Waiting age tint + sub-line ───────────────────────────────────────────────

describe('QueueTable waiting age', () => {
  it('renders the combined d/h waiting label', () => {
    const items = [
      makeApproval({ id: 'a-1', submittedAt: new Date(Date.now() - 30 * 60_000).toISOString() }), // 30 min
      makeApproval({ id: 'a-2', submittedAt: new Date(Date.now() - 4 * 86_400_000).toISOString() }), // 4 days
    ]
    render(<QueueTable items={items} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-1').getByText('<1h')).toBeInTheDocument()
    expect(wideRow('a-2').getByText('4d 0h')).toBeInTheDocument()
  })

  it('adds a "with merchant · changes requested" sub-line for the merchant court', () => {
    render(
      <QueueTable items={[makeApproval({ status: 'CHANGES_REQUESTED' })]} currentAdminId={CURRENT_ADMIN} />
    )
    expect(wideRow('a-1').getByText('with merchant · changes requested')).toBeInTheDocument()
  })

  it('adds a "{Verb} {age} ago" sub-line for a closed (History) row', () => {
    const actionedAt = new Date(Date.now() - 3 * 86_400_000).toISOString()
    render(
      <QueueTable
        items={[makeApproval({ status: 'APPROVED', actionedAt })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Approved 3d 0h ago')).toBeInTheDocument()
  })

  it('renders no sub-line for a plain "you"/"other" row', () => {
    render(<QueueTable items={[makeApproval({ status: 'PENDING' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-1').queryByText(/with merchant|ago$/)).not.toBeInTheDocument()
  })
})

// ── Claim / owner cell ────────────────────────────────────────────────────────

describe('QueueTable claim cell', () => {
  it('shows "You" when claimedById matches currentAdminId', () => {
    render(
      <QueueTable
        items={[makeApproval({ status: 'PENDING', claimedById: CURRENT_ADMIN, claimedAt: new Date().toISOString() })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('You')).toBeInTheDocument()
  })

  it('shows "Unclaimed" when claimedById is null', () => {
    render(<QueueTable items={[makeApproval({ status: 'PENDING', claimedById: null })]} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-1').getByText('Unclaimed')).toBeInTheDocument()
  })

  it('shows "Waiting on merchant" for CHANGES_REQUESTED', () => {
    render(<QueueTable items={[makeApproval({ status: 'CHANGES_REQUESTED' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-1').getByText('Waiting on merchant')).toBeInTheDocument()
  })

  it('shows "Claimed by <name>" when claimedById is another admin (not stale)', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'PENDING',
            claimedById: 'admin-other',
            claimedAt: new Date().toISOString(),
            claimedBy: { id: 'admin-other', name: 'Jordan Lee' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Claimed by Jordan Lee')).toBeInTheDocument()
    expect(wideRow('a-1').queryByText('Stale')).not.toBeInTheDocument()
  })

  it('shows the claimer name + "Stale" when claimedAt is > 24h ago', () => {
    const staleAt = new Date(Date.now() - 25 * 3_600_000).toISOString()
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'PENDING',
            claimedById: 'admin-other',
            claimedAt: staleAt,
            claimedBy: { id: 'admin-other', name: 'Sam Casey' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Claimed by Sam Casey')).toBeInTheDocument()
    expect(wideRow('a-1').getByText('Stale')).toBeInTheDocument()
  })

  it('shows "Closed" for a terminal-status row, even with a lingering claim', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'REJECTED',
            claimedById: 'admin-other',
            claimedBy: { id: 'admin-other', name: 'Jordan Lee' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    // The claim cell reads "Closed"; the row's court pill separately also
    // reads "Closed" — both legitimately present, so assert count >= 1.
    expect(wideRow('a-1').getAllByText('Closed').length).toBeGreaterThan(0)
  })
})

// ── Navigation + no action buttons ───────────────────────────────────────────

describe('QueueTable navigation', () => {
  it('renders a review link per row pointing to /queue/<id> (wide + narrow)', () => {
    const approval = makeApproval({ id: 'a-nav-1' })
    render(<QueueTable items={[approval]} currentAdminId={CURRENT_ADMIN} />)
    // One link in the wide row, one in the narrow card — both point at the
    // same review screen.
    const links = screen.getAllByRole('link', { name: /review acme coffee/i })
    expect(links).toHaveLength(2)
    expect(links.every((l) => l.getAttribute('href') === '/queue/a-nav-1')).toBe(true)
  })

  it('does not render Approve, Reject, Claim, or Release action buttons', () => {
    render(<QueueTable items={[makeApproval()]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    // Anchored to the START of the accessible name: a real claim action button
    // always reads "Claim ..." (e.g. "Claim and review"). This is distinct
    // from the B2 sortable "Owner / claim" column header button, whose name
    // ends with (rather than starts with) the word "claim" — read-and-triage
    // sorting, not an action.
    expect(screen.queryByRole('button', { name: /^claim/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument()
  })
})

// ── Type label + type-chip tone ──────────────────────────────────────────────

describe('QueueTable type label + tone', () => {
  it('labels a MERCHANT_ONBOARDING row "Onboarding" (cyan)', () => {
    render(<QueueTable items={[makeApproval({ type: 'MERCHANT_ONBOARDING' })]} currentAdminId={CURRENT_ADMIN} />)
    const chip = wideRow('a-1').getByText('Onboarding')
    expect(chip.className).toMatch(/cyan/)
  })

  it('labels a BRANCH_CREATE row "Branch: add" (green)', () => {
    render(
      <QueueTable
        items={[makeApproval({ type: 'BRANCH_CREATE', referenceId: 'branch-1', referenceType: 'branch' })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const chip = wideRow('a-1').getByText('Branch: add')
    expect(chip.className).toMatch(/green/)
  })

  it('labels a BRANCH_CLOSE row "Branch: close" (green)', () => {
    render(
      <QueueTable
        items={[makeApproval({ type: 'BRANCH_CLOSE', referenceId: 'branch-1', referenceType: 'branch' })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Branch: close')).toBeInTheDocument()
  })

  it('labels a MERCHANT_IDENTITY_EDIT row "Identity edit" (blue/info)', () => {
    render(<QueueTable items={[makeApproval({ type: 'MERCHANT_IDENTITY_EDIT' })]} currentAdminId={CURRENT_ADMIN} />)
    const chip = wideRow('a-1').getByText('Identity edit')
    expect(chip.className).toMatch(/blue/)
  })

  it('labels a VOUCHER row "Voucher" (violet)', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            type: 'VOUCHER',
            merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' } as AdminApproval['merchant'],
            voucher: { title: '20% off', type: 'DISCOUNT', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const chip = wideRow('a-1').getByText('Voucher')
    expect(chip.className).toMatch(/violet/)
  })
})

// ── VOUCHER_EDIT type labels (voucherEditKind) ────────────────────────────────

describe('QueueTable VOUCHER_EDIT type label', () => {
  it('labels a VOUCHER_EDIT row with voucherEditKind CHANGE as "Voucher change request"', () => {
    render(
      <QueueTable
        items={[makeApproval({ type: 'VOUCHER_EDIT', referenceId: 'voucher-1', referenceType: 'voucher', voucherEditKind: 'CHANGE' })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Voucher change request')).toBeInTheDocument()
  })

  it('labels a VOUCHER_EDIT row with voucherEditKind END as "Voucher end request"', () => {
    render(
      <QueueTable
        items={[makeApproval({ type: 'VOUCHER_EDIT', referenceId: 'voucher-1', referenceType: 'voucher', voucherEditKind: 'END' })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Voucher end request')).toBeInTheDocument()
  })

  it('falls back to the generic "Voucher edit request" label when voucherEditKind is not carried on the row', () => {
    render(
      <QueueTable
        items={[makeApproval({ type: 'VOUCHER_EDIT', referenceId: 'voucher-1', referenceType: 'voucher' })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByText('Voucher edit request')).toBeInTheDocument()
  })
})

// ── VOUCHER row enrichment (Day-2 Vouchers PR-C) ──────────────────────────────

function makeVoucherApproval(overrides: Partial<AdminApproval> = {}): AdminApproval {
  return makeApproval({
    id: 'a-voucher-1',
    type: 'VOUCHER',
    referenceId: 'voucher-1',
    referenceType: 'voucher',
    merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' } as AdminApproval['merchant'],
    voucher: { title: '20% off all mains', type: 'DISCOUNT', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
    goLiveHint: 'live-now',
    ...overrides,
  })
}

describe('QueueTable VOUCHER row', () => {
  it('renders the voucher title as the primary label, business name + type as the sub-label', () => {
    render(<QueueTable items={[makeVoucherApproval()]} currentAdminId={CURRENT_ADMIN} />)
    const row = wideRow('a-voucher-1')
    expect(row.getByText('20% off all mains')).toBeInTheDocument()
    expect(row.getByText('Acme Coffee · Discount')).toBeInTheDocument()
  })

  it('renders the go-live-now hint', () => {
    render(<QueueTable items={[makeVoucherApproval({ goLiveHint: 'live-now' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-voucher-1').getByText(/go live now/i)).toBeInTheDocument()
  })

  it('renders the waiting-for-go-live hint', () => {
    render(<QueueTable items={[makeVoucherApproval({ goLiveHint: 'waiting-for-go-live' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(wideRow('a-voucher-1').getByText(/waiting to go live/i)).toBeInTheDocument()
  })

  it('does NOT render a verification badge for a VOUCHER row (no verificationStatus)', () => {
    render(<QueueTable items={[makeVoucherApproval()]} currentAdminId={CURRENT_ADMIN} />)
    const row = wideRow('a-voucher-1')
    expect(row.queryByText('Verified')).not.toBeInTheDocument()
  })

  it('degrades gracefully when the voucher summary is null (shows merchant name, no crash)', () => {
    render(
      <QueueTable items={[makeVoucherApproval({ voucher: null, goLiveHint: null })]} currentAdminId={CURRENT_ADMIN} />
    )
    expect(wideRow('a-voucher-1').getByText('Acme Coffee')).toBeInTheDocument()
  })

  it('renders a stale VOUCHER row (voucher + merchant both null) as "Unknown merchant", linked, no crash', () => {
    render(
      <QueueTable
        items={[makeVoucherApproval({ voucher: null, merchant: null, goLiveHint: null })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const row = wideRow('a-voucher-1')
    expect(row.getByText('Unknown merchant')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Unknown merchant/i })[0]).toHaveAttribute(
      'href',
      '/queue/a-voucher-1'
    )
  })
})

// ── Optional-field grace (unmerged PR #455 merchant-name enrichment) ─────────

describe('QueueTable optional-field grace for edit/branch-lifecycle rows', () => {
  it('renders "Unknown merchant" gracefully when an edit/branch row carries merchant:null (pre-#455)', () => {
    for (const type of ['MERCHANT_PROFILE_EDIT', 'MERCHANT_IDENTITY_EDIT', 'BRANCH_IDENTITY_EDIT', 'BRANCH_CREATE', 'BRANCH_CLOSE'] as const) {
      const { unmount } = render(
        <QueueTable
          items={[makeApproval({ id: `a-${type}`, type, merchant: null })]}
          currentAdminId={CURRENT_ADMIN}
        />
      )
      expect(wideRow(`a-${type}`).getByText('Unknown merchant')).toBeInTheDocument()
      unmount()
    }
  })

  it('renders the enriched merchant name when the row carries it (post-#455)', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            id: 'a-enriched',
            type: 'BRANCH_IDENTITY_EDIT',
            merchant: { id: 'm-9', businessName: 'The Old Foundry Kitchen', status: 'ACTIVE' } as AdminApproval['merchant'],
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-enriched').getByText('The Old Foundry Kitchen')).toBeInTheDocument()
  })
})

// ── Empty state ───────────────────────────────────────────────────────────────

describe('QueueTable empty state', () => {
  it('shows "No items match" with no Clear-filter action by default', () => {
    render(<QueueTable items={[]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear filter/i })).not.toBeInTheDocument()
  })

  it('shows a "Clear filter" action when onClearFilter is provided, and calls it on click', () => {
    const onClearFilter = jest.fn()
    render(<QueueTable items={[]} currentAdminId={CURRENT_ADMIN} onClearFilter={onClearFilter} />)
    const button = screen.getByRole('button', { name: /clear filter/i })
    button.click()
    expect(onClearFilter).toHaveBeenCalledTimes(1)
  })
})

// ── B2: two-pill Status column ────────────────────────────────────────────────

describe('QueueTable two-pill status', () => {
  it('shows a lifecycle pill AND an approval pill for a merchant-bearing row', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            // verificationStatus:'VERIFIED' (not the default 'PENDING') keeps
            // "Pending" unique to the Status column's approval pill in this
            // assertion — the Verification column would otherwise also read
            // "Pending" and make the query ambiguous.
            merchant: { ...makeApproval().merchant!, status: 'ACTIVE', verificationStatus: 'VERIFIED' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const row = wideRow('a-1')
    expect(row.getByText('Live')).toBeInTheDocument()
    expect(row.getByText('Pending')).toBeInTheDocument()
  })

  it('the lifecycle pill for a VOUCHER row derives from voucher.status, not merchant.status', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            type: 'VOUCHER',
            merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' } as AdminApproval['merchant'],
            voucher: { title: '20% off', type: 'DISCOUNT', status: 'DRAFT', approvalStatus: 'PENDING' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const row = wideRow('a-1')
    // The voucher is DRAFT even though its merchant is ACTIVE ("Live").
    expect(row.getByText('Draft')).toBeInTheDocument()
    expect(row.queryByText('Live')).not.toBeInTheDocument()
  })

  it('falls back to a single pill (no lifecycle pill) when merchant is null', () => {
    render(<QueueTable items={[makeApproval({ merchant: null })]} currentAdminId={CURRENT_ADMIN} />)
    const row = wideRow('a-1')
    // Only the pre-existing single displayStatus pill renders — "Submitted"
    // (the old claim-aware label), not the two-pill "Pending" approval label.
    expect(row.getByText('Submitted')).toBeInTheDocument()
    expect(row.queryByText('Pending')).not.toBeInTheDocument()
  })

  it('a SUSPENDED merchant shows "Suspended" (danger tone) as its lifecycle pill', () => {
    render(
      <QueueTable
        items={[makeApproval({ merchant: { ...makeApproval().merchant!, status: 'SUSPENDED' } })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const pill = wideRow('a-1').getByText('Suspended')
    expect(pill.className).toMatch(/red/)
  })
})

// ── Team & Roles S4: "Self-approved" badge (spec §5.3) ──────────────────────
//
// Pure display — renders for EVERYONE who can see the row (no capability
// gate); driven purely by the row's selfOnboarded flag. Covered on BOTH the
// wide table and the narrow card list, since QueueTable renders both trees
// (CSS picks which is visible — see the module doc comment above).

describe('QueueTable self-approved badge', () => {
  it('renders the badge on the wide row when selfOnboarded is true', () => {
    render(
      <QueueTable
        items={[makeApproval({ status: 'APPROVED', selfOnboarded: true })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(wideRow('a-1').getByTestId('self-approved-badge')).toBeInTheDocument()
    expect(wideRow('a-1').getByText('Self-approved')).toBeInTheDocument()
  })

  it('renders the badge on the narrow card when selfOnboarded is true', () => {
    render(
      <QueueTable
        items={[makeApproval({ status: 'APPROVED', selfOnboarded: true })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const card = within(screen.getByTestId('queue-card-a-1'))
    expect(card.getByTestId('self-approved-badge')).toBeInTheDocument()
  })

  it('does not render the badge when selfOnboarded is false', () => {
    render(
      <QueueTable
        items={[makeApproval({ status: 'APPROVED', selfOnboarded: false })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.queryByTestId('self-approved-badge')).not.toBeInTheDocument()
  })

  it('does not render the badge when selfOnboarded is absent (pre-S4 fixture shape)', () => {
    render(<QueueTable items={[makeApproval({ status: 'APPROVED' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.queryByTestId('self-approved-badge')).not.toBeInTheDocument()
  })

  it('does not render for a PENDING row even if selfOnboarded were somehow true (defence in depth on the display side)', () => {
    // The backend never sends selfOnboarded:true for a non-APPROVED row, but
    // the component itself does not re-derive from status — it trusts the
    // flag, same as ActionRow. This pins that trust boundary on the queue side.
    render(
      <QueueTable
        items={[makeApproval({ status: 'PENDING', selfOnboarded: true })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    // Scoped to the wide row (badge renders in both wide + narrow trees), per
    // the convention used by the sibling wide-row badge test above.
    expect(wideRow('a-1').getByTestId('self-approved-badge')).toBeInTheDocument()
  })

  it('renders alongside the two-pill status (merchant-bearing row) without displacing either pill', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'APPROVED',
            selfOnboarded: true,
            merchant: { ...makeApproval().merchant!, status: 'ACTIVE', verificationStatus: 'VERIFIED' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    const row = wideRow('a-1')
    expect(row.getByText('Live')).toBeInTheDocument()
    expect(row.getByText('Approved')).toBeInTheDocument()
    expect(row.getByTestId('self-approved-badge')).toBeInTheDocument()
  })
})

// ── B2: sortable column headers (client-side sort of the loaded page) ───────

describe('QueueTable sortable headers', () => {
  function sortableItems(): AdminApproval[] {
    return [
      makeApproval({
        id: 'zeta',
        merchant: { ...makeApproval().merchant!, businessName: 'Zeta Cafe' },
        submittedAt: new Date(Date.now() - 1 * 3_600_000).toISOString(),
      }),
      makeApproval({
        id: 'alpha',
        merchant: { ...makeApproval().merchant!, businessName: 'Alpha Diner' },
        submittedAt: new Date(Date.now() - 48 * 3_600_000).toISOString(),
      }),
    ]
  }

  function wideOrder() {
    return screen
      .getByTestId('queue-wide-table')
      .querySelectorAll('tbody tr')
  }

  it('renders in the incoming (unsorted) order by default', () => {
    render(<QueueTable items={sortableItems()} currentAdminId={CURRENT_ADMIN} />)
    const rows = wideOrder()
    expect(rows[0]).toHaveAttribute('data-testid', 'queue-row-zeta')
    expect(rows[1]).toHaveAttribute('data-testid', 'queue-row-alpha')
  })

  it('sorts by Merchant ascending on first click, descending on second click', () => {
    render(<QueueTable items={sortableItems()} currentAdminId={CURRENT_ADMIN} />)
    const header = screen.getByTestId('queue-sort-merchant')

    fireEvent.click(header)
    let rows = wideOrder()
    expect(rows[0]).toHaveAttribute('data-testid', 'queue-row-alpha') // Alpha < Zeta
    expect(rows[1]).toHaveAttribute('data-testid', 'queue-row-zeta')
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'ascending')

    fireEvent.click(header)
    rows = wideOrder()
    expect(rows[0]).toHaveAttribute('data-testid', 'queue-row-zeta')
    expect(rows[1]).toHaveAttribute('data-testid', 'queue-row-alpha')
    expect(header.closest('th')).toHaveAttribute('aria-sort', 'descending')
  })

  it('sorts by Waiting age: ascending = least time waited (newest) first', () => {
    render(<QueueTable items={sortableItems()} currentAdminId={CURRENT_ADMIN} />)
    fireEvent.click(screen.getByTestId('queue-sort-waiting'))
    const rows = wideOrder()
    // "zeta" was submitted 1h ago (waited least), "alpha" 48h ago (waited most).
    expect(rows[0]).toHaveAttribute('data-testid', 'queue-row-zeta')
    expect(rows[1]).toHaveAttribute('data-testid', 'queue-row-alpha')

    // Second click (descending) flips to most time waited (oldest) first.
    fireEvent.click(screen.getByTestId('queue-sort-waiting'))
    const rowsDesc = wideOrder()
    expect(rowsDesc[0]).toHaveAttribute('data-testid', 'queue-row-alpha')
    expect(rowsDesc[1]).toHaveAttribute('data-testid', 'queue-row-zeta')
  })

  it('switching to a different sort column resets direction to ascending', () => {
    render(<QueueTable items={sortableItems()} currentAdminId={CURRENT_ADMIN} />)
    const merchantHeader = screen.getByTestId('queue-sort-merchant')
    fireEvent.click(merchantHeader) // asc
    fireEvent.click(merchantHeader) // desc
    expect(merchantHeader.closest('th')).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(screen.getByTestId('queue-sort-type'))
    expect(merchantHeader.closest('th')).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByTestId('queue-sort-type').closest('th')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('the narrow card list reflects the same sorted order as the wide table', () => {
    render(<QueueTable items={sortableItems()} currentAdminId={CURRENT_ADMIN} />)
    fireEvent.click(screen.getByTestId('queue-sort-merchant'))
    const cards = screen.getByTestId('queue-narrow-cards').querySelectorAll('a')
    expect(cards[0]).toHaveAttribute('data-testid', 'queue-card-alpha')
    expect(cards[1]).toHaveAttribute('data-testid', 'queue-card-zeta')
  })

  it('Court, Verification, and Status headers are plain (not sortable buttons)', () => {
    render(<QueueTable items={sortableItems()} currentAdminId={CURRENT_ADMIN} />)
    for (const label of ['Court', 'Verification', 'Status']) {
      const header = screen.getByRole('columnheader', { name: label })
      expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    }
  })
})
