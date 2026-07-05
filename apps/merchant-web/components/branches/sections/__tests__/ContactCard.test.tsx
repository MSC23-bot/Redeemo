import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContactCard } from '@/components/branches/sections/ContactCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F4: the owner-only Contact instant-save card (prototype 03/08).
// View shows phone / email / website + a "Saves instantly" hint + an Edit pencil;
// edit swaps to inputs + Save / Cancel. Save PATCHes ONLY the changed DIRECT fields
// (phone / email / websiteUrl). A non-owner sees read-only values with no Edit
// control. isActive is NOT a Contact control (it is the read-only header status
// pill from F3) so F4 never sends it.

// --- the F4 mutation hook ---------------------------------------------------
const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useUpdateBranchContact: () => ({ mutateAsync, isPending }),
}))

// --- toast ------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

function branch(over: Partial<Branch> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    phone: '+44 1223 456 789',
    email: 'hello@oldfoundrykitchen.co.uk',
    websiteUrl: 'oldfoundrykitchen.co.uk',
    isActive: true,
    ...over,
  } as Branch
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({})
  toast.mockReset()
  isPending = false
})

describe('ContactCard owner gating', () => {
  it('shows the values read-only for a non-owner (no Edit control)', () => {
    render(<ContactCard branch={branch()} canManage={false} />)
    expect(screen.getByText('+44 1223 456 789')).toBeInTheDocument()
    expect(screen.getByText('hello@oldfoundrykitchen.co.uk')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })

  it('shows an Edit control for an owner', () => {
    render(<ContactCard branch={branch()} canManage />)
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('renders the "Saves instantly" hint', () => {
    render(<ContactCard branch={branch()} canManage />)
    expect(screen.getByText(/saves instantly/i)).toBeInTheDocument()
  })
})

describe('ContactCard edit + save', () => {
  it('owner edit PATCHes with exactly the changed direct fields', async () => {
    render(<ContactCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))

    const phone = screen.getByLabelText(/phone/i)
    fireEvent.change(phone, { target: { value: '+44 1223 999 000' } })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    // Only the changed field is sent; email + website are unchanged so omitted.
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'b1', body: { phone: '+44 1223 999 000' } })
  })

  it('sends only phone/email/website and never isActive', async () => {
    render(<ContactCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText(/website/i), { target: { value: 'newsite.co.uk' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@x.co.uk' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const body = mutateAsync.mock.calls[0][0].body
    expect(Object.keys(body).sort()).toEqual(['email', 'websiteUrl'])
    expect(body).not.toHaveProperty('isActive')
    expect(body).not.toHaveProperty('phone')
  })

  it('shows a success toast after an instant save', async () => {
    render(<ContactCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+44 0000' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })

  it('does not call the API when nothing changed (save is a no-op back to view)', async () => {
    render(<ContactCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(screen.getByText('+44 1223 456 789')).toBeInTheDocument(),
    )
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('Cancel discards edits and returns to view', () => {
    render(<ContactCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: 'CHANGED' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('+44 1223 456 789')).toBeInTheDocument()
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument()
  })
})

describe('ContactCard error', () => {
  it('surfaces a save failure via role=alert', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'))
    render(<ContactCard branch={branch()} canManage />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+44 0000' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // The error keeps the form open so the owner can retry.
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument()
  })
})
