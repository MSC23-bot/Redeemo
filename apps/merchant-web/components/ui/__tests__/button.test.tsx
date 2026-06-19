import { render, screen } from '@testing-library/react'
import { Button } from '../button'

describe('Button', () => {
  it('renders the gradient (signature) variant with the brand glow', () => {
    render(<Button variant="gradient">Save voucher</Button>)
    const btn = screen.getByRole('button', { name: 'Save voucher' })
    expect(btn).toHaveAttribute('data-variant', 'gradient')
    expect(btn.className).toMatch(/E20C04/) // brand-red gradient stop present
  })

  it('renders the navy CTA variant', () => {
    render(<Button variant="navy">Validate a code</Button>)
    expect(screen.getByRole('button', { name: 'Validate a code' })).toHaveAttribute('data-variant', 'navy')
  })

  it('exposes secondary, ghost, and destructive variants', () => {
    const { rerender } = render(<Button variant="secondary">a</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'secondary')
    rerender(<Button variant="ghost">a</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'ghost')
    rerender(<Button variant="destructive">a</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'destructive')
  })
})
