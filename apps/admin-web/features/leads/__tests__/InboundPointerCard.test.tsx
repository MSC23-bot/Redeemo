import React from 'react'
import { render, screen } from '@testing-library/react'
import { InboundPointerCard } from '../InboundPointerCard'

jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
})

describe('InboundPointerCard', () => {
  it('renders the LIVE badge and links to /queue', () => {
    render(<InboundPointerCard count={6} isLoading={false} isError={false} canReadApprovals />)

    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByTestId('leads-inbound-queue-link')).toHaveAttribute('href', '/queue')
  })

  it('shows the awaiting-review count when loaded', () => {
    render(<InboundPointerCard count={6} isLoading={false} isError={false} canReadApprovals />)

    const countBlock = screen.getByTestId('leads-inbound-count')
    expect(countBlock).toHaveTextContent('6')
    expect(countBlock).toHaveTextContent('awaiting review')
  })

  it('shows a loading spinner while the count is loading', () => {
    render(<InboundPointerCard count={undefined} isLoading isError={false} canReadApprovals />)

    expect(screen.getByLabelText(/loading awaiting-review count/i)).toBeInTheDocument()
    expect(screen.queryByTestId('leads-inbound-count')).not.toBeInTheDocument()
  })

  it('shows an honest error note when the count fetch fails', () => {
    render(<InboundPointerCard count={undefined} isLoading={false} isError canReadApprovals />)

    expect(screen.getByTestId('leads-inbound-count-error')).toHaveTextContent(/count unavailable/i)
  })

  it('shows a restricted note (not a fake 0) when the admin lacks approval:read', () => {
    render(<InboundPointerCard count={undefined} isLoading={false} isError={false} canReadApprovals={false} />)

    expect(screen.getByTestId('leads-inbound-count-restricted')).toHaveTextContent(/approval:read/i)
    expect(screen.queryByTestId('leads-inbound-count')).not.toBeInTheDocument()
    // The queue link stays reachable even without approval:read : /queue has its own gate.
    expect(screen.getByTestId('leads-inbound-queue-link')).toBeInTheDocument()
  })

  it('treats an undefined count as 0 once loaded (never blank)', () => {
    render(<InboundPointerCard count={undefined} isLoading={false} isError={false} canReadApprovals />)

    expect(screen.getByTestId('leads-inbound-count')).toHaveTextContent('0')
  })
})
