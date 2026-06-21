import { render, screen, fireEvent, within } from '@testing-library/react'
import { ContractAgreementForm } from '@/components/onboarding/contract/ContractAgreementForm'

// M2 F6: the "Sign the merchant agreement" step form. These tests pin the form
// contract: the step header, the owner-only subtitle, the 6 plain-English key terms,
// the full-agreement modal (fetched backend text + the draft banner), the
// click-to-agree gate (checkbox AND a typed name), and the signed-confirmation state.
// The API + routing are mocked at the page level; the form takes the contract data +
// callbacks as props.

const CONTRACT = {
  version: '1.0',
  text: 'Redeemo Merchant Agreement v1.0\n\nThis is the binding agreement text from the backend.',
}

// The 6 key terms, verbatim from the prototype/map.
const KEY_TERMS = [
  'This is a 12 month agreement between your business and Redeemo.',
  'Listing is free. You only pay for optional featured placement and campaigns.',
  'You agree to honour the vouchers you publish and to keep your information accurate.',
  'Customers redeem in person at your branch, and your team validates each redemption.',
  'Redeemo may review, suspend, or remove listings that break the rules or fall short on quality, to protect customers and merchants.',
  'Your data is handled under the Redeemo Privacy Policy, and you are responsible for your staff use of the portal.',
]

function renderForm(overrides: Partial<React.ComponentProps<typeof ContractAgreementForm>> = {}) {
  const onAccept = jest.fn()
  const onBack = jest.fn()
  render(
    <ContractAgreementForm
      contract={CONTRACT}
      signerBusinessName="Old Foundry Kitchen Ltd"
      signerName=""
      signed={false}
      accepting={false}
      acceptError={null}
      onAccept={onAccept}
      onBack={onBack}
      {...overrides}
    />,
  )
  return { onAccept, onBack }
}

describe('ContractAgreementForm (M2 F6)', () => {
  it('renders the step header, the title, and the owner-only subtitle', () => {
    renderForm()
    expect(screen.getByText(/setup step 6 of 6/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sign the merchant agreement/i })).toBeInTheDocument()
    expect(screen.getByText(/only the business owner can sign this/i)).toBeInTheDocument()
  })

  it('renders the 6 key terms in plain English', () => {
    renderForm()
    expect(screen.getByText(/the key terms, in plain english/i)).toBeInTheDocument()
    for (const term of KEY_TERMS) {
      expect(screen.getByText(term)).toBeInTheDocument()
    }
  })

  it('opens the full-agreement modal with the fetched text and the draft banner', () => {
    renderForm()
    // Modal is not mounted until the trigger fires.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /read the full agreement/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/this is the binding agreement text from the backend/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/draft for review\. the binding version will be confirmed by redeemo legal team before launch/i),
    ).toBeInTheDocument()
  })

  it('keeps Agree and continue disabled until BOTH the checkbox is ticked and a name is typed', () => {
    renderForm()
    const cta = screen.getByRole('button', { name: /agree and continue/i })
    expect(cta).toBeDisabled()

    // Checkbox only -> still disabled.
    fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree/i }))
    expect(cta).toBeDisabled()

    // Name only (checkbox unticked) -> still disabled.
    fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree/i }))
    fireEvent.change(screen.getByLabelText(/type your full name to sign/i), {
      target: { value: 'James Whitfield' },
    })
    expect(cta).toBeDisabled()

    // Both -> enabled.
    fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree/i }))
    expect(cta).toBeEnabled()
  })

  it('treats a whitespace-only name as not signed (gate stays closed)', () => {
    renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree/i }))
    fireEvent.change(screen.getByLabelText(/type your full name to sign/i), {
      target: { value: '   ' },
    })
    expect(screen.getByRole('button', { name: /agree and continue/i })).toBeDisabled()
  })

  it('calls onAccept when Agree and continue is pressed with both gates met', () => {
    const { onAccept } = renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /i have read and agree/i }))
    fireEvent.change(screen.getByLabelText(/type your full name to sign/i), {
      target: { value: 'James Whitfield' },
    })
    fireEvent.click(screen.getByRole('button', { name: /agree and continue/i }))
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  it('shows a read-only date affordance (it is not an editable input)', () => {
    renderForm()
    expect(screen.getByText(/date of agreement/i)).toBeInTheDocument()
    // The date is a read-only display, not a text input the signer fills.
    expect(screen.queryByRole('textbox', { name: /date of agreement/i })).not.toBeInTheDocument()
  })

  it('renders the signed-confirmation state and hides the signing form', () => {
    renderForm({ signed: true })
    expect(screen.getByRole('heading', { name: /your agreement is signed/i })).toBeInTheDocument()
    // The active signing affordances are gone in the signed state.
    expect(screen.queryByRole('button', { name: /agree and continue/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /i have read and agree/i })).not.toBeInTheDocument()
  })

  it('surfaces an accept error inline', () => {
    renderForm({ acceptError: 'We could not record your agreement just now. Please try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/could not record your agreement/i)
  })

  it('navigates back from the Back button', () => {
    const { onBack } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
