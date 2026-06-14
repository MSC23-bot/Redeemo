/**
 * DeliveryBadge — delivery-status -> label + tone mapping.
 *
 * The shared Badge applies tone classes; we assert the label text and the
 * tone-driven class signature so a future remapping is caught.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { DeliveryBadge } from '../DeliveryBadge'

describe('DeliveryBadge', () => {
  it('QUEUED renders "Queued" with the neutral tone', () => {
    render(<DeliveryBadge status="QUEUED" />)
    const badge = screen.getByText('Queued')
    expect(badge).toBeInTheDocument()
    // neutral tone -> secondary background
    expect(badge.className).toContain('bg-secondary')
  })

  it('SENT renders "Sent" with the success tone', () => {
    render(<DeliveryBadge status="SENT" />)
    const badge = screen.getByText('Sent')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('green')
  })

  it('FAILED renders "Failed" with the danger tone', () => {
    render(<DeliveryBadge status="FAILED" />)
    const badge = screen.getByText('Failed')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('red')
  })

  it('BOUNCED renders "Bounced" with the warn tone', () => {
    render(<DeliveryBadge status="BOUNCED" />)
    const badge = screen.getByText('Bounced')
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain('amber')
  })
})
