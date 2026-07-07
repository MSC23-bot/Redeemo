import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChangePasswordModal } from '@/components/account/ChangePasswordModal'
import { ApiError } from '@/lib/api/client'

const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/account/useChangePassword', () => ({
  useChangePassword: () => ({ mutateAsync, isPending }),
}))

const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

const STRONG_NEW_PASSWORD = 'NewStrong1!'

function fillAndSubmit(overrides: { current?: string; next?: string; confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/current password/i), {
    target: { value: overrides.current ?? 'OldPassword1!' },
  })
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: overrides.next ?? STRONG_NEW_PASSWORD },
  })
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: overrides.confirm ?? STRONG_NEW_PASSWORD },
  })
  fireEvent.click(screen.getByRole('button', { name: /update password/i }))
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ message: 'Password updated.' })
  toast.mockReset()
  isPending = false
})

describe('ChangePasswordModal validation (never calls the API on bad input)', () => {
  it('rejects an empty current password', () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fillAndSubmit({ current: '' })
    expect(screen.getByText(/enter your current password/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a new password that fails the policy', () => {
    render(<ChangePasswordModal onClose={jest.fn()} />)
    fillAndSubmit({ next: 'weak', confirm: 'weak' })
    expect(screen.getByText(/does not yet meet all the requirements/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a confirm mismatch', () => {
    render(<ChangePasswordModal onClose={jest.fn()} />)
    fillAndSubmit({ confirm: 'SomethingElse1!' })
    expect(screen.getByText(/do not match/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('rejects a new password identical to the current one', () => {
    render(<ChangePasswordModal onClose={jest.fn()} />)
    fillAndSubmit({ current: STRONG_NEW_PASSWORD, next: STRONG_NEW_PASSWORD, confirm: STRONG_NEW_PASSWORD })
    expect(screen.getByText(/different from your current one/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})

describe('ChangePasswordModal submit', () => {
  it('calls the mutation with currentPassword/newPassword, toasts, and closes on success', async () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fillAndSubmit()
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ currentPassword: 'OldPassword1!', newPassword: STRONG_NEW_PASSWORD }))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('surfaces CURRENT_PASSWORD_INCORRECT inline and does not close', async () => {
    mutateAsync.mockRejectedValue(new ApiError(400, { error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'wrong' } }))
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(/current password is incorrect/i)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ChangePasswordModal dismissal is allowed when NOT pending', () => {
  it('closes via the X button', () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via Escape', () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fireEvent.keyDown(screen.getByTestId('change-password-modal'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via a scrim click', () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fireEvent.click(screen.getByTestId('change-password-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('enables the X button when not pending', () => {
    render(<ChangePasswordModal onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: /close/i })).toBeEnabled()
  })
})

describe('ChangePasswordModal blocks EVERY dismissal path while the update is in flight (P3 hardening)', () => {
  beforeEach(() => {
    // Force the pending state: isPending true AND a never-resolving mutation so
    // the modal is stuck mid-request for the duration of the assertions.
    isPending = true
    mutateAsync.mockReset().mockReturnValue(new Promise(() => {}))
  })

  it('the X button is disabled and clicking it does NOT close', () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    const closeButton = screen.getByRole('button', { name: /close/i })
    expect(closeButton).toBeDisabled()
    fireEvent.click(closeButton)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('change-password-modal')).toBeInTheDocument()
  })

  it('Escape does NOT close while pending', () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fireEvent.keyDown(screen.getByTestId('change-password-modal'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('change-password-modal')).toBeInTheDocument()
  })

  it('a scrim click does NOT close while pending', () => {
    const onClose = jest.fn()
    render(<ChangePasswordModal onClose={onClose} />)
    fireEvent.click(screen.getByTestId('change-password-scrim'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('change-password-modal')).toBeInTheDocument()
  })

  it('Cancel is disabled while pending', () => {
    render(<ChangePasswordModal onClose={jest.fn()} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })
})
