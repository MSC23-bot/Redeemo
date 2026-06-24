import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MainBranchControl } from '@/components/branches/sections/MainBranchControl'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F8: the asymmetric "main branch" control (prototype 02/07). When the
// branch is already main it renders a non-clickable "Main branch" badge and NO button.
// Otherwise an owner sees a "Make main branch" action that, with a confirm, PATCHes
// { isMainBranch: true } via the useSetMainBranch hook. A non-owner sees neither
// control (read-only).

// --- the F8 mutation hook ---------------------------------------------------
const setMainMutateAsync = jest.fn()
let setMainPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useSetMainBranch: () => ({ mutateAsync: setMainMutateAsync, isPending: setMainPending }),
}))

// --- toast ------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

function branch(over: Record<string, unknown> = {}): Branch {
  return { id: 'b1', name: 'High Street', ...over } as unknown as Branch
}

beforeEach(() => {
  setMainMutateAsync.mockReset().mockResolvedValue({})
  toast.mockReset()
  setMainPending = false
})

describe('MainBranchControl already-main', () => {
  it('shows a non-clickable Main branch badge and no action button (owner)', () => {
    render(<MainBranchControl branch={branch({ isMainBranch: true })} isOwner />)
    expect(screen.getByText(/main branch/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /make main branch/i })).not.toBeInTheDocument()
  })

  it('shows the Main branch badge to a non-owner too', () => {
    render(<MainBranchControl branch={branch({ isMainBranch: true })} isOwner={false} />)
    expect(screen.getByText(/main branch/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /make main branch/i })).not.toBeInTheDocument()
  })
})

describe('MainBranchControl not-main owner action', () => {
  it('shows the Make main branch action for an owner', () => {
    render(<MainBranchControl branch={branch({ isMainBranch: false })} isOwner />)
    expect(screen.getByRole('button', { name: /make main branch/i })).toBeInTheDocument()
  })

  it('PATCHes isMainBranch:true after confirming and toasts success', async () => {
    render(<MainBranchControl branch={branch({ isMainBranch: false })} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /make main branch/i }))
    // A confirm step appears; clicking the confirm fires the mutation.
    fireEvent.click(screen.getByRole('button', { name: /^make main branch$/i }))
    await waitFor(() => expect(setMainMutateAsync).toHaveBeenCalledWith('b1'))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })

  it('does not PATCH if the confirm is cancelled', () => {
    render(<MainBranchControl branch={branch({ isMainBranch: false })} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /make main branch/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(setMainMutateAsync).not.toHaveBeenCalled()
  })

  it('surfaces an error via role=alert when the PATCH fails', async () => {
    setMainMutateAsync.mockRejectedValue(new Error('boom'))
    render(<MainBranchControl branch={branch({ isMainBranch: false })} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /make main branch/i }))
    fireEvent.click(screen.getByRole('button', { name: /^make main branch$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})

describe('MainBranchControl non-owner', () => {
  it('renders neither control for a non-owner on a non-main branch', () => {
    const { container } = render(
      <MainBranchControl branch={branch({ isMainBranch: false })} isOwner={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
