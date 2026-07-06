/**
 * Polish batch: branded root-level 404 (previously there was no not-found.tsx
 * anywhere under app/, so an unmatched route fell through to Next's unbranded
 * default 404 screen).
 */
import { render, screen } from '@testing-library/react'
import NotFound from '../not-found'

describe('root not-found page', () => {
  it('renders a branded 404 with a link back to the merchant home', () => {
    render(<NotFound />)

    expect(screen.getByText('Redeemo')).toBeInTheDocument()
    expect(screen.getByText(/we could not find that page/i)).toBeInTheDocument()

    const homeLink = screen.getByRole('link', { name: /back to dashboard/i })
    expect(homeLink).toHaveAttribute('href', '/')
  })

  it('exposes a <main> landmark so assistive tech can jump straight to the 404 content', () => {
    render(<NotFound />)

    // getByRole('main') only matches an actual <main> element (or role="main") -
    // this fails if the page regresses back to a bare, unlandmarked <div>.
    const main = screen.getByRole('main')
    expect(main.tagName).toBe('MAIN')
    expect(main).toContainElement(screen.getByText(/we could not find that page/i))
  })
})
