/**
 * Polish batch: root-level error boundary. Unlike app/(app)/error.tsx (which
 * only wraps that segment's page content), this file lives next to the root
 * app/layout.tsx and is nested inside it - so it wraps everything root renders
 * as `children`, including app/(app)/layout.tsx (MerchantPortalShell) and
 * app/(auth)/layout.tsx. It exists specifically to catch a render failure in
 * one of those layouts, which no other error.tsx in this app can see.
 * See ../error-boundary-nesting.test.tsx for the behavioural proof of that claim.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import RootError from '../error'

describe('root error boundary', () => {
  it('renders a branded, calm fallback with a working Try again button', () => {
    const reset = jest.fn()
    render(<RootError error={new Error('boom')} reset={reset} />)

    expect(screen.getByText('Redeemo')).toBeInTheDocument()
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('links back to the merchant home', () => {
    const reset = jest.fn()
    render(<RootError error={new Error('boom')} reset={reset} />)

    const homeLink = screen.getByRole('link', { name: /back to dashboard/i })
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('announces the failure via role="alert" and moves keyboard/AT focus onto it', () => {
    const reset = jest.fn()
    render(<RootError error={new Error('boom')} reset={reset} />)

    const alert = screen.getByRole('alert')
    expect(alert).toContainElement(screen.getByText(/something went wrong/i))
    expect(alert).toHaveFocus()
  })
})
