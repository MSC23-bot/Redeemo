/**
 * Polish batch: branded route-level error boundary for the authenticated (app)
 * shell (previously there was no error.tsx anywhere under app/, so an uncaught
 * render throw fell through to Next's unbranded default error screen).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import AppError from '../error'

describe('(app) error boundary', () => {
  it('renders a branded, calm fallback with a working Try again button', () => {
    const reset = jest.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)

    expect(screen.getByText('Redeemo')).toBeInTheDocument()
    expect(screen.getByText(/something went wrong on our side/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('links back to the merchant home', () => {
    const reset = jest.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)

    const homeLink = screen.getByRole('link', { name: /back to dashboard/i })
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('announces the failure via role="alert" and moves keyboard/AT focus onto it', () => {
    const reset = jest.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)

    // role="alert" gives an implicit assertive live region, so screen readers
    // announce it the moment it mounts - not only if/when a sighted user notices
    // and tabs to it.
    const alert = screen.getByRole('alert')
    expect(alert).toContainElement(screen.getByText(/something went wrong on our side/i))
    // Focus must land ON the alert itself (not silently stay on <body>), so a
    // keyboard/AT user's next action (e.g. Tab) reaches the recovery controls
    // instead of wherever focus happened to be when the crash occurred.
    expect(alert).toHaveFocus()
  })
})
