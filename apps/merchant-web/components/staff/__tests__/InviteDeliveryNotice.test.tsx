/**
 * PR-C C5 tests for the invite-delivery confirmation (spec §5.1.2).
 *
 * Pins: EMAIL_DARK shows generic operator copy and NEVER says "email sent" /
 * "delivered"; QUEUED says "queued for {email}" and differs from the dark copy;
 * neither variant ever renders a token / claim link (the API does not return one).
 */
import { render, screen } from '@testing-library/react'
import { InviteDeliveryNotice } from '@/components/staff/InviteDeliveryNotice'

describe('InviteDeliveryNotice (invite-delivery UX, §5.1.2)', () => {
  it('EMAIL_DARK: shows generic operator copy and NEVER claims an email was sent', () => {
    const { container } = render(
      <InviteDeliveryNotice result={{ inviteDelivery: 'EMAIL_DARK', email: 'new@shop.test' }} />,
    )
    expect(screen.getByText(/invite created/i)).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/email sent|email delivered|delivered/i)
  })

  it('QUEUED: shows queued-for-{email} copy that differs from the dark copy', () => {
    const dark = render(
      <InviteDeliveryNotice result={{ inviteDelivery: 'EMAIL_DARK', email: 'new@shop.test' }} />,
    )
    const darkText = dark.container.textContent ?? ''
    dark.unmount()

    const queued = render(
      <InviteDeliveryNotice result={{ inviteDelivery: 'QUEUED', email: 'new@shop.test' }} />,
    )
    expect(screen.getByText(/invite email queued for new@shop.test/i)).toBeInTheDocument()
    expect(queued.container.textContent).not.toEqual(darkText)
  })

  it('never renders a token or claim-link string', () => {
    const { container } = render(
      <InviteDeliveryNotice result={{ inviteDelivery: 'EMAIL_DARK', email: 'new@shop.test' }} />,
    )
    const text = container.textContent ?? ''
    // No URL / token-looking string in the confirmation copy.
    expect(text).not.toMatch(/https?:\/\/|claim|token|[A-Za-z0-9]{24,}/)
  })
})
