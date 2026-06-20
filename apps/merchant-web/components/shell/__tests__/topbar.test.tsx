import { render, screen, fireEvent } from '@testing-library/react'
import { Topbar } from '../Topbar'

describe('Topbar', () => {
  it('renders the Validate-a-code CTA and the icon slots', () => {
    render(<Topbar onMenu={() => {}} />)
    expect(screen.getByRole('button', { name: /validate a code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quick actions/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument()
  })

  it('does NOT render the prototype-only View-as or Demo controls', () => {
    render(<Topbar onMenu={() => {}} />)
    expect(screen.queryByText(/view as/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^demo/i)).not.toBeInTheDocument()
  })

  it('does NOT render the hamburger toggle on wide viewports (isNarrow default false)', () => {
    render(<Topbar onMenu={() => {}} />)
    expect(screen.queryByRole('button', { name: /toggle navigation/i })).not.toBeInTheDocument()
  })

  it('renders the hamburger toggle and centred wordmark on narrow viewports', () => {
    render(<Topbar onMenu={() => {}} isNarrow />)
    expect(screen.getByRole('button', { name: /toggle navigation/i })).toBeInTheDocument()
    expect(screen.getByText('Redeemo for Business')).toBeInTheDocument()
  })

  it('opens the account menu and signs out (M1 Slice 5)', () => {
    const onSignOut = jest.fn()
    render(<Topbar onMenu={() => {}} businessName="Roe Cafe" onSignOut={onSignOut} />)
    // closed by default
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByText('Roe Cafe')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('closes the account menu on Escape and returns focus to the trigger (M1 Slice 5 a11y)', () => {
    render(<Topbar onMenu={() => {}} businessName="Roe Cafe" onSignOut={jest.fn()} />)
    const trigger = screen.getByRole('button', { name: /account menu/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
