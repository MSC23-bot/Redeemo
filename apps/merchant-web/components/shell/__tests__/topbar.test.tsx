import { render, screen } from '@testing-library/react'
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
})
