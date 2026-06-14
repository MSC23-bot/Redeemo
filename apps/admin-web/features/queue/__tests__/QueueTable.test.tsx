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

  it('shows "Claimed" when claimedById is another admin (not stale)', () => {
    render(
      <QueueTable
        items={[
          makeApproval({
            status: 'PENDING',
            claimedById: 'admin-other',
            claimedAt: new Date().toISOString(), // just now, not stale
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Claimed')).toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
  })

  it('shows "Claimed" + "Stale" when claimedAt is > 24h ago', () => {
    const staleAt = new Date(Date.now() - 25 * 3_600_000).toISOString() // 25h ago
    render(
      <QueueTable
        items={[makeApproval({ status: 'PENDING', claimedById: 'admin-other', claimedAt: staleAt })]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Claimed')).toBeInTheDocument()
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
          }),
        ]}
        currentAdminId={CURRENT_ADMIN}
      />
    )
    expect(screen.getByText('Waiting on merchant')).toBeInTheDocument()
    expect(screen.queryByText('Claimed')).not.toBeInTheDocument()
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
