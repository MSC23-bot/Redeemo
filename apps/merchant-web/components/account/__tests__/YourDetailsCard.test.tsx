import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { YourDetailsCard } from '@/components/account/YourDetailsCard'
import type { MerchantAccount } from '@/lib/api/account'

const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/account/useUpdateMerchantAccount', () => ({
  useUpdateMerchantAccount: () => ({ mutateAsync, isPending }),
}))

const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

function account(over: Partial<MerchantAccount> = {}): MerchantAccount {
  return {
    id: 'a1',
    firstName: 'James',
    lastName: 'Whitfield',
    jobTitle: 'Owner',
    email: 'james@oldfoundrykitchen.co.uk',
    phone: '+44 7700 900145',
    phoneCountryCode: '+44',
    emailVerified: true,
    passwordChangedAt: null,
    ...over,
  } as MerchantAccount
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(account())
  toast.mockReset()
  isPending = false
})

describe('YourDetailsCard view mode', () => {
  it('shows the name, role · business line, login email and mobile', () => {
    render(<YourDetailsCard account={account()} businessName="The Old Foundry Kitchen" />)
    expect(screen.getByText('James Whitfield')).toBeInTheDocument()
    expect(screen.getByText('Owner · The Old Foundry Kitchen')).toBeInTheDocument()
    expect(screen.getByText('james@oldfoundrykitchen.co.uk')).toBeInTheDocument()
    expect(screen.getByText('+44 7700 900145')).toBeInTheDocument()
  })

  it('falls back to "Team member" when jobTitle is absent', () => {
    render(<YourDetailsCard account={account({ jobTitle: null })} businessName="Co" />)
    expect(screen.getByText('Team member · Co')).toBeInTheDocument()
  })

  it('shows "Not added yet" for a missing mobile number, never a fabricated one', () => {
    render(<YourDetailsCard account={account({ phone: null })} businessName="Co" />)
    expect(screen.getByText('Not added yet')).toBeInTheDocument()
  })
})

describe('YourDetailsCard edit + save', () => {
  it('Edit reveals First name / Last name / Job title inputs seeded from the account', () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('your-details-edit'))
    expect(screen.getByLabelText(/first name/i)).toHaveValue('James')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Whitfield')
    expect(screen.getByLabelText(/job title/i)).toHaveValue('Owner')
  })

  it('Save PATCHes exactly firstName/lastName/jobTitle', async () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('your-details-edit'))
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jamie' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({ firstName: 'Jamie', lastName: 'Whitfield', jobTitle: 'Owner' })
  })

  it('rejects an empty first/last name without calling the API', async () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('your-details-edit'))
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/enter both a first and last name/i)).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('shows the "each is changed through its own confirmed step" info line in edit mode', () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('your-details-edit'))
    expect(screen.getByText(/its own confirmed step below/i)).toBeInTheDocument()
  })

  it('does not call the API when nothing changed', async () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('your-details-edit'))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(screen.getByText('James Whitfield')).toBeInTheDocument())
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('Cancel discards edits', () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('your-details-edit'))
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'CHANGED' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText('James Whitfield')).toBeInTheDocument()
  })

  it('shows a success toast and returns to view after save', async () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('your-details-edit'))
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'Jamie' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })))
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument()
  })
})

describe('YourDetailsCard staged contact changes', () => {
  it('Change email opens a staged, honest modal (not a working flow)', () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('change-email-open'))
    expect(screen.getByTestId('change-email-modal')).toBeInTheDocument()
    expect(screen.getByText(/handled with redeemo directly/i)).toBeInTheDocument()
  })

  it('Change phone opens a staged, honest modal (not a working flow)', () => {
    render(<YourDetailsCard account={account()} businessName="Co" />)
    fireEvent.click(screen.getByTestId('change-phone-open'))
    expect(screen.getByTestId('change-phone-modal')).toBeInTheDocument()
  })
})
