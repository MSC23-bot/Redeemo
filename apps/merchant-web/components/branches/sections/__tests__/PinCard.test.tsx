import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PinCard } from '@/components/branches/sections/PinCard'
import type { Branch } from '@/lib/api/branch'
import { ApiError } from '@/lib/api/client'

// Branches PR-1 F6: the owner-only Redemption PIN card (prototype 04/08). The PIN is
// masked by default; the decrypted value is fetched ON DEMAND via GET /pin (the
// getBranchPin client) only when the owner taps Reveal, NEVER from the list payload.
// Change validates /^\d{4}$/ then PUTs; Send dispatches the PIN to the branch. A
// non-owner sees no PIN section at all.

// --- on-demand reveal read (lib/api/branch.getBranchPin) --------------------
const getBranchPin = jest.fn()
jest.mock('@/lib/api/branch', () => ({
  getBranchPin: (id: string) => getBranchPin(id),
}))

// --- the F6 mutation hooks --------------------------------------------------
const changeMutateAsync = jest.fn()
const sendMutateAsync = jest.fn()
let changePending = false
let sendPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useSetBranchPin: () => ({ mutateAsync: changeMutateAsync, isPending: changePending }),
  useSendBranchPin: () => ({ mutateAsync: sendMutateAsync, isPending: sendPending }),
}))

// --- toast ------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

// Wire hygiene (2026-07-05): the server strips the encrypted redemptionPin and
// emits the derived redemptionPinSet boolean instead. The card derives set/not-set
// from that boolean and NEVER reads a raw pin value off the row.
function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    redemptionPinSet: true,
    ...over,
  } as unknown as Branch
}

beforeEach(() => {
  getBranchPin.mockReset().mockResolvedValue({ pin: '4821' })
  changeMutateAsync.mockReset().mockResolvedValue({})
  sendMutateAsync.mockReset().mockResolvedValue({ message: 'sent' })
  toast.mockReset()
  changePending = false
  sendPending = false
})

describe('PinCard #pin deep-link scroll (shell wave Quick Action)', () => {
  it('scrolls itself into view on mount when the URL hash is #pin', () => {
    const scrollIntoView = jest.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    window.location.hash = '#pin'
    try {
      render(<PinCard branch={branch()} isOwner />)
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    } finally {
      Element.prototype.scrollIntoView = original
      window.location.hash = ''
    }
  })

  it('does not scroll without the hash', () => {
    const scrollIntoView = jest.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      render(<PinCard branch={branch()} isOwner />)
      expect(scrollIntoView).not.toHaveBeenCalled()
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })
})

describe('PinCard owner gating', () => {
  it('renders nothing for a non-owner', () => {
    const { container } = render(<PinCard branch={branch()} isOwner={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the PIN section for an owner', () => {
    render(<PinCard branch={branch()} isOwner />)
    expect(screen.getByText(/redemption pin/i)).toBeInTheDocument()
  })

  it('renders the private-PIN explainer copy', () => {
    render(<PinCard branch={branch()} isOwner />)
    expect(screen.getByText(/keep it private/i)).toBeInTheDocument()
  })
})

describe('PinCard reveal-on-demand (security)', () => {
  it('does NOT fetch the PIN on mount and never renders a ciphertext (the server no longer sends one at all)', () => {
    const { container } = render(<PinCard branch={branch()} isOwner />)
    expect(getBranchPin).not.toHaveBeenCalled()
    // Regression guard: even if a stray ciphertext rode along on the row, it must
    // never render.
    expect(container.textContent ?? '').not.toContain('ENCRYPTED-CIPHERTEXT')
    // And the decrypted value is not shown until the owner reveals it.
    expect(container.textContent ?? '').not.toContain('4821')
  })

  it('fetches GET /pin only when Reveal is pressed and then shows the value', async () => {
    render(<PinCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /reveal/i }))
    await waitFor(() => expect(getBranchPin).toHaveBeenCalledWith('b1'))
    expect(await screen.findByText('4821')).toBeInTheDocument()
  })
})

describe('PinCard change', () => {
  it('rejects a non-4-digit PIN without calling PUT', async () => {
    render(<PinCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /change pin/i }))
    fireEvent.change(screen.getByLabelText(/new 4-digit pin/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /save pin/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(changeMutateAsync).not.toHaveBeenCalled()
  })

  it('PUTs a valid 4-digit PIN and toasts', async () => {
    render(<PinCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /change pin/i }))
    fireEvent.change(screen.getByLabelText(/new 4-digit pin/i), { target: { value: '9876' } })
    fireEvent.click(screen.getByRole('button', { name: /save pin/i }))
    await waitFor(() => expect(changeMutateAsync).toHaveBeenCalledWith({ id: 'b1', pin: '9876' }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })

  it('surfaces INVALID_PIN_FORMAT from the backend via role=alert', async () => {
    changeMutateAsync.mockRejectedValue(new ApiError(400, { error: { code: 'INVALID_PIN_FORMAT' } }))
    render(<PinCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /change pin/i }))
    fireEvent.change(screen.getByLabelText(/new 4-digit pin/i), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /save pin/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})

describe('PinCard send', () => {
  it('POSTs the send and toasts success', async () => {
    render(<PinCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /send to branch/i }))
    await waitFor(() => expect(sendMutateAsync).toHaveBeenCalledWith('b1'))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })

  it('surfaces PIN_NOT_CONFIGURED from the backend via role=alert', async () => {
    sendMutateAsync.mockRejectedValue(new ApiError(400, { error: { code: 'PIN_NOT_CONFIGURED' } }))
    render(<PinCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /send to branch/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})

describe('PinCard not-set state', () => {
  it('shows a not-set state when no PIN is configured and disables Reveal + Send', () => {
    render(<PinCard branch={branch({ redemptionPinSet: false })} isOwner />)
    expect(screen.getByText(/no pin set yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reveal/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /send to branch/i })).toBeDisabled()
    // Change is still available so the owner can set the first PIN.
    expect(screen.getByRole('button', { name: /change pin|set pin/i })).toBeEnabled()
  })

  // Wire hygiene explicit pin: set-state is driven purely by redemptionPinSet.
  it('set-state is driven by redemptionPinSet: true (masked dots, Reveal/Send enabled)', () => {
    render(<PinCard branch={branch({ redemptionPinSet: true })} isOwner />)
    expect(screen.getByTestId('branch-pin-masked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reveal/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /send to branch/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /change pin/i })).toBeEnabled()
  })

  it('not-set state is driven by redemptionPinSet: false, independent of any other field', () => {
    render(<PinCard branch={branch({ redemptionPinSet: false })} isOwner />)
    expect(screen.queryByTestId('branch-pin-masked')).not.toBeInTheDocument()
    expect(screen.getByText(/no pin set yet/i)).toBeInTheDocument()
  })
})
