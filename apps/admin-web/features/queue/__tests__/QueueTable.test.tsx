/**
 * QueueTable — displayStatus + claim cell + urgency + no action buttons.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
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

// ── displayStatus ─────────────────────────────────────────────────────────────

describe('QueueTable displayStatus', () => {
  it('shows "Submitted" for PENDING + unclaimed', () => {
    render(<QueueTable items={[makeApproval({ status: 'PENDING', claimedById: null })]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getByText('Submitted')).toBeInTheDocument()
  })

  it('shows "Under review" for PENDING + claimed (by someone else)', () => {
    render(
      <QueueTable
        items={[makeApproval({ status: 'PENDING', claimedById: 'admin-other', claimedAt: new Date().toISOString() })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Under review')).toBeInTheDocument()
  })

  it('shows "Changes requested" for CHANGES_REQUESTED status', () => {
    render(<QueueTable items={[makeApproval({ status: 'CHANGES_REQUESTED' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getByText('Changes requested')).toBeInTheDocument()
  })
})

// ── Claim cell ────────────────────────────────────────────────────────────────

describe('QueueTable claim cell', () => {
  it('shows "You" when claimedById matches currentAdminId', () => {
    render(
      <QueueTable
        items={[makeApproval({ status: 'PENDING', claimedById: CURRENT_ADMIN, claimedAt: new Date().toISOString() })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('shows "Unclaimed" when claimedById is null', () => {
    render(<QueueTable items={[makeApproval({ status: 'PENDING', claimedById: null })]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getByText('Unclaimed')).toBeInTheDocument()
  })

  it('shows "Waiting on merchant" for CHANGES_REQUESTED', () => {
    render(<QueueTable items={[makeApproval({ status: 'CHANGES_REQUESTED' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getByText('Waiting on merchant')).toBeInTheDocument()
  })

  it('shows "Claimed by <name>" when claimedById is another admin (not stale)', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'PENDING',
            claimedById: 'admin-other',
            claimedAt: new Date().toISOString(), // just now, not stale
            claimedBy: { id: 'admin-other', name: 'Jordan Lee' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Claimed by Jordan Lee')).toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })

  it('falls back to "Claimed by another admin" when claimedBy is null (name unresolved)', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'PENDING',
            claimedById: 'admin-other',
            claimedAt: new Date().toISOString(),
            claimedBy: null,
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Claimed by another admin')).toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })

  it('falls back to "Claimed by another admin" when claimedBy.name is null', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'PENDING',
            claimedById: 'admin-other',
            claimedAt: new Date().toISOString(),
            claimedBy: { id: 'admin-other', name: null },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Claimed by another admin')).toBeInTheDocument()
  })

  it('shows the claimer name + "Stale" when claimedAt is > 24h ago', () => {
    const staleAt = new Date(Date.now() - 25 * 3_600_000).toISOString() // 25h ago
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
    expect(screen.getByText('Claimed by Sam Casey')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()
  })

  it('CHANGES_REQUESTED takes precedence over a lingering claimedById (shows "Waiting on merchant", not "Claimed" or "Stale")', () => {
    // A row that has BOTH status=CHANGES_REQUESTED AND a non-stale claim set by
    // another admin. CHANGES_REQUESTED wins because it is checked first in ClaimCell.
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'CHANGES_REQUESTED',
            claimedById: 'admin-other',
            claimedAt: new Date().toISOString(),
            claimedBy: { id: 'admin-other', name: 'Jordan Lee' },
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Waiting on merchant')).toBeInTheDocument()
    expect(screen.queryByText(/^Claimed by/)).not.toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })
})

// ── Urgency ───────────────────────────────────────────────────────────────────

describe('QueueTable urgency', () => {
  it('renders an urgency badge for each row', () => {
    const items = [
      makeApproval({ id: 'a-1', submittedAt: new Date(Date.now() - 30 * 60_000).toISOString() }), // 30 min -> under an hour
      makeApproval({ id: 'a-2', submittedAt: new Date(Date.now() - 4 * 86_400_000).toISOString() }), // 4 days
    ]
    render(<QueueTable items={items} currentAdminId={CURRENT_ADMIN} />)
    // Both rows should render a waiting duration label.
    expect(screen.getByText('under an hour')).toBeInTheDocument()
    expect(screen.getByText('4 days')).toBeInTheDocument()
  })
})

// ── Navigation + no action buttons ───────────────────────────────────────────

describe('QueueTable navigation', () => {
  it('renders a review link per row pointing to /queue/<id>', () => {
    const approval = makeApproval({ id: 'a-nav-1' })
    render(<QueueTable items={[approval]} currentAdminId={CURRENT_ADMIN} />)
    const link = screen.getByRole('link', { name: /review acme coffee/i })
    expect(link).toHaveAttribute('href', '/queue/a-nav-1')
  })

  it('renders one review link per row (multiple rows)', () => {
    const items = [
      makeApproval({ id: 'a-r1' }),
      makeApproval({ id: 'a-r2', merchant: { id: 'm-2', businessName: 'Bean Scene', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMIT_FOR_REVIEW', verificationStatus: 'PENDING', contractStatus: 'SIGNED' } }),
    ]
    render(<QueueTable items={items} currentAdminId={CURRENT_ADMIN} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/queue/a-r1')
    expect(links[1]).toHaveAttribute('href', '/queue/a-r2')
  })

  it('does not render Approve, Reject, Claim, or Release action buttons', () => {
    render(<QueueTable items={[makeApproval()]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /claim/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument()
  })
})

// ── Day-2 Vouchers PR-C: VOUCHER row enrichment ───────────────────────────────

function makeVoucherApproval(overrides: Partial<AdminApproval> = {}): AdminApproval {
  return makeApproval({
    id: 'a-voucher-1',
    type: 'VOUCHER',
    referenceId: 'voucher-1',
    referenceType: 'voucher',
    // A VOUCHER-row merchant carries only { id, businessName, status }.
    merchant: { id: 'm-1', businessName: 'Acme Coffee', status: 'ACTIVE' } as AdminApproval['merchant'],
    voucher: { title: '20% off all mains', type: 'DISCOUNT', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
    goLiveHint: 'live-now',
    ...overrides,
  })
}

describe('QueueTable VOUCHER row', () => {
  it('renders the voucher title alongside the merchant business name', () => {
    render(<QueueTable items={[makeVoucherApproval()]} currentAdminId={CURRENT_ADMIN} />)
    const row = screen.getByTestId('queue-row-a-voucher-1')
    expect(row).toHaveTextContent('20% off all mains')
    expect(row).toHaveTextContent('Acme Coffee')
  })

  it('renders the voucher type label (Discount) and the "Voucher" type badge', () => {
    render(<QueueTable items={[makeVoucherApproval()]} currentAdminId={CURRENT_ADMIN} />)
    const row = screen.getByTestId('queue-row-a-voucher-1')
    expect(row).toHaveTextContent('Voucher')
    expect(row).toHaveTextContent('Discount')
  })

  it('renders the go-live-now hint', () => {
    render(<QueueTable items={[makeVoucherApproval({ goLiveHint: 'live-now' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getByTestId('queue-row-a-voucher-1')).toHaveTextContent(/go live now/i)
  })

  it('renders the waiting-for-go-live hint', () => {
    render(<QueueTable items={[makeVoucherApproval({ goLiveHint: 'waiting-for-go-live' })]} currentAdminId={CURRENT_ADMIN} />)
    expect(screen.getByTestId('queue-row-a-voucher-1')).toHaveTextContent(/waiting to go live/i)
  })

  it('does NOT render a verification badge for a VOUCHER row (no verificationStatus)', () => {
    render(<QueueTable items={[makeVoucherApproval()]} currentAdminId={CURRENT_ADMIN} />)
    // The onboarding-only verification labels must not appear on a voucher row.
    const row = screen.getByTestId('queue-row-a-voucher-1')
    expect(row).not.toHaveTextContent('Verified')
    expect(row).not.toHaveTextContent('Rejected')
  })

  it('links the VOUCHER row to its review screen at /queue/<id> (queue -> detail)', () => {
    render(<QueueTable items={[makeVoucherApproval()]} currentAdminId={CURRENT_ADMIN} />)
    const link = screen.getByRole('link', { name: /20% off all mains/i })
    expect(link).toHaveAttribute('href', '/queue/a-voucher-1')
  })

  it('degrades gracefully when the voucher summary is null (shows merchant name, no crash)', () => {
    render(
      <QueueTable
        items={[makeVoucherApproval({ voucher: null, goLiveHint: null })]}
        currentAdminId={CURRENT_ADMIN}
      />,
    )
    expect(screen.getByTestId('queue-row-a-voucher-1')).toHaveTextContent('Acme Coffee')
  })

  // Codex FIX 1 (PR-A): a stale VOUCHER approval (its referenceId points at a
  // missing/deleted voucher) now comes back as the safe shape voucher:null +
  // merchant:null + goLiveHint:null. The queue row must render it without crashing,
  // falling back to "Unknown merchant", and stay clickable to its review screen.
  it('renders a stale VOUCHER row (voucher + merchant both null) as "Unknown merchant", linked, no crash', () => {
    render(
      <QueueTable
        items={[makeVoucherApproval({ voucher: null, merchant: null, goLiveHint: null })]}
        currentAdminId={CURRENT_ADMIN}
      />,
    )
    const row = screen.getByTestId('queue-row-a-voucher-1')
    expect(row).toHaveTextContent('Unknown merchant')
    expect(screen.getByRole('link', { name: /Unknown merchant/i })).toHaveAttribute('href', '/queue/a-voucher-1')
  })

  it('renders a MERCHANT_ONBOARDING row unchanged alongside a VOUCHER row', () => {
    render(
      <QueueTable
        items={[makeApproval({ id: 'a-onb' }), makeVoucherApproval()]}
        currentAdminId={CURRENT_ADMIN}
      />,
    )
    // Onboarding row still shows its verification badge.
    const onbRow = screen.getByTestId('queue-row-a-onb')
    expect(onbRow).toHaveTextContent('Pending')
    expect(onbRow).toHaveTextContent('Onboarding')
  })
})
