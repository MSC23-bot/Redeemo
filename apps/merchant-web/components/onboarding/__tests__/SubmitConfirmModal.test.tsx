import { render, screen, fireEvent } from '@testing-library/react'
import { SubmitConfirmModal } from '@/components/onboarding/SubmitConfirmModal'

describe('SubmitConfirmModal', () => {
  it('renders the confirm copy and the second-gate checkbox', () => {
    render(<SubmitConfirmModal onClose={jest.fn()} onConfirm={jest.fn()} submitting={false} />)
    expect(screen.getByText(/submit your business for review/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /confirm/i })).toBeInTheDocument()
  })

  it('disables Submit until the checkbox (second gate) is ticked', () => {
    render(<SubmitConfirmModal onClose={jest.fn()} onConfirm={jest.fn()} submitting={false} />)
    const submit = screen.getByRole('button', { name: /^submit for review$/i })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /confirm/i }))
    expect(submit).toBeEnabled()
  })

  it('calls onConfirm only once the checkbox is ticked', () => {
    const onConfirm = jest.fn()
    render(<SubmitConfirmModal onClose={jest.fn()} onConfirm={onConfirm} submitting={false} />)
    const submit = screen.getByRole('button', { name: /^submit for review$/i })
    fireEvent.click(submit)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /confirm/i }))
    fireEvent.click(submit)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose from the cancel button', () => {
    const onClose = jest.fn()
    render(<SubmitConfirmModal onClose={onClose} onConfirm={jest.fn()} submitting={false} />)
    fireEvent.click(screen.getByRole('button', { name: /go back and check/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces an error message when one is passed', () => {
    render(
      <SubmitConfirmModal
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        submitting={false}
        error="Some steps are still incomplete. Please finish them and try again."
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/some steps are still incomplete/i)
  })
})
