/**
 * Behavioural proof of the Next.js App Router error-boundary nesting rule this
 * polish batch fixed: an error.tsx wraps its OWN segment's `children` output,
 * not that segment's own layout.tsx. Next.js generates the real boundary at
 * build time, so a unit test cannot import "the wiring" directly - instead we
 * reconstruct the exact shape Next produces (a React error boundary class
 * component that renders {error, reset} into the error.tsx fallback) and mount
 * the REAL app/(app)/layout.tsx (AppLayout) inside it, with MerchantPortalShell
 * mocked to throw during its own render - the class of bug this batch targets
 * (a bad session/profile hook, a nav crash, anything before {children} runs).
 *
 * Two things are proven:
 *  1. A boundary placed the way app/(app)/error.tsx is placed (wrapping only
 *     AppLayout's `children` prop, i.e. INSIDE MerchantPortalShell) cannot
 *     catch a MerchantPortalShell render failure - the throw happens above/
 *     before that boundary ever mounts. This is why app/(app)/error.tsx alone
 *     left the shell crash unbranded.
 *  2. A boundary placed the way the new app/error.tsx is placed (wrapping the
 *     WHOLE <AppLayout> subtree, from the parent segment) DOES catch it, and
 *     recovers cleanly via `reset`.
 */
import React, { Component, type ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import AppLayout from '../(app)/layout'
import RootError from '../error'
import AppError from '../(app)/error'

// MerchantPortalShell carries heavy session/nav deps unrelated to this test;
// this mock is fully controllable so it can throw ONCE (simulating the crash)
// then render normally (simulating recovery after `reset`).
let shouldThrow = true
jest.mock('@/components/shell/MerchantPortalShell', () => ({
  MerchantPortalShell: ({ children }: { children: React.ReactNode }) => {
    if (shouldThrow) throw new Error('shell render failure')
    return <div data-testid="shell-ok">{children}</div>
  },
}))

type Fallback = React.ComponentType<{ error: Error & { digest?: string }; reset: () => void }>

// Mirrors the contract Next.js's generated boundary hands to every error.tsx:
// {error, reset} props, and a fallback that replaces `children` once caught.
class NextStyleErrorBoundary extends Component<
  { children: ReactNode; Fallback: Fallback },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      const { Fallback } = this.props
      return <Fallback error={this.state.error} reset={this.reset} />
    }
    return this.props.children
  }
}

describe('error-boundary segment nesting (app layout vs root)', () => {
  beforeEach(() => {
    shouldThrow = true
  })

  it('a boundary wrapping only {children} (mirroring app/(app)/error.tsx placement) does NOT catch a MerchantPortalShell render failure', () => {
    // Suppress React's noisy console.error for the expected, un-caught-by-this-
    // boundary throw so the test output stays readable.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    // AppLayout is `<ToastProvider><MerchantPortalShell>{children}</MerchantPortalShell></ToastProvider>`.
    // Placing the boundary around the `children` we pass in reproduces exactly
    // where Next attaches app/(app)/error.tsx: INSIDE MerchantPortalShell, not
    // around it. Because the mocked shell throws before it ever renders that
    // children argument, this boundary never gets a chance to intercept anything -
    // the error propagates straight past it.
    expect(() => {
      render(
        <AppLayout>
          <NextStyleErrorBoundary Fallback={AppError}>
            <div>page content</div>
          </NextStyleErrorBoundary>
        </AppLayout>,
      )
    }).toThrow('shell render failure')

    consoleSpy.mockRestore()
  })

  it('a boundary wrapping the whole (app) layout (mirroring the new root app/error.tsx placement) catches a MerchantPortalShell render failure and renders the branded fallback', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <NextStyleErrorBoundary Fallback={RootError}>
        <AppLayout>
          <div>page content</div>
        </AppLayout>
      </NextStyleErrorBoundary>,
    )

    // The shell crashed, so neither the shell chrome nor the page content it
    // would have wrapped ever reached the DOM...
    expect(screen.queryByTestId('shell-ok')).not.toBeInTheDocument()
    expect(screen.queryByText('page content')).not.toBeInTheDocument()
    // ...instead the outer, root-level fallback rendered, announced via
    // role="alert" (§ correction 2).
    const alert = screen.getByRole('alert')
    expect(alert).toContainElement(screen.getByText(/something went wrong/i))
    expect(alert).toHaveFocus()

    consoleSpy.mockRestore()
  })

  it('recovers via reset(): once the underlying failure clears, "Try again" re-renders the real (app) layout and its page content', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <NextStyleErrorBoundary Fallback={RootError}>
        <AppLayout>
          <div>page content</div>
        </AppLayout>
      </NextStyleErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Simulate the underlying condition clearing (e.g. a transient session/
    // profile fetch that failed once) before the user retries.
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('shell-ok')).toBeInTheDocument()
    expect(screen.getByText('page content')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})
