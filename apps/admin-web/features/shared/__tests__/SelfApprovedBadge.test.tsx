/**
 * SelfApprovedBadge — Team & Roles S4 (spec §5.3).
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { SelfApprovedBadge } from '../SelfApprovedBadge'

describe('SelfApprovedBadge', () => {
  it('renders the locked "Self-approved" copy', () => {
    render(<SelfApprovedBadge />)
    expect(screen.getByTestId('self-approved-badge')).toHaveTextContent('Self-approved')
  })

  it('uses the shared Badge neutral tone (no new colour)', () => {
    render(<SelfApprovedBadge />)
    const badge = screen.getByText('Self-approved')
    // neutral tone class from features/shared/Badge.tsx TONE_CLASSES.neutral.
    expect(badge.className).toMatch(/bg-secondary/)
    expect(badge.className).not.toMatch(/red|amber|green|blue|cyan|violet/)
  })

  it('carries no emoji or em-dash in its copy', () => {
    render(<SelfApprovedBadge />)
    const text = screen.getByTestId('self-approved-badge').textContent ?? ''
    expect(text).toBe('Self-approved')
    expect(text).not.toMatch(/—/)
  })
})
