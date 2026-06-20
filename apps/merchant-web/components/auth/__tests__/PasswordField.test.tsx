import { render, screen, fireEvent } from '@testing-library/react'
import { PasswordField } from '@/components/auth/PasswordField'

describe('PasswordField (a11y: show/hide toggle)', () => {
  it('toggles aria-pressed and the accessible name when revealing the password', () => {
    render(<PasswordField id="pw" value="secret" onChange={() => {}} />)
    const toggle = screen.getByRole('button', { name: /show password/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    const hide = screen.getByRole('button', { name: /hide password/i })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
  })
})
