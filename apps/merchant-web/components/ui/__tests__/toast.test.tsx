import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from '../toast'

function Trigger({ variant }: { variant: 'success' | 'error' }) {
  const { toast } = useToast()
  return (
    <button onClick={() => toast({ variant, message: variant === 'success' ? 'Saved' : 'Failed' })}>
      fire
    </button>
  )
}

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers()
    })
    jest.useRealTimers()
  })

  it('shows a success toast with role=status when fired', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(
      <ToastProvider>
        <Trigger variant="success" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('fire'))
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('Saved')
    expect(toast).toHaveAttribute('data-variant', 'success')
  })

  it('shows an error toast with role=alert', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(
      <ToastProvider>
        <Trigger variant="error" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('fire'))
    const toast = await screen.findByRole('alert')
    expect(toast).toHaveTextContent('Failed')
    expect(toast).toHaveAttribute('data-variant', 'error')
  })

  it('auto-dismisses after the timeout', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(
      <ToastProvider>
        <Trigger variant="success" />
      </ToastProvider>,
    )
    await user.click(screen.getByText('fire'))
    expect(await screen.findByRole('status')).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(5000)
    })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('throws a clear error when useToast is used outside the provider', () => {
    function Bare() {
      useToast()
      return null
    }
    // Silence the expected React error boundary console noise.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/ToastProvider/i)
    spy.mockRestore()
  })
})
