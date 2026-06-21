import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BusinessProfileForm } from '@/components/onboarding/profile/BusinessProfileForm'
import type { ProfileFormValues } from '@/components/onboarding/profile/BusinessProfileForm'

// M2 F3 (D4): the Tier-1 business-profile step. These tests pin the form contract:
// the field set, prefill, required-description gate, the 600 char counter, the VAT
// toggle reveal/hide, and the dual-CTA payloads. The B5 upload + the PATCH are mocked
// at the page level; the form takes `onUpload` + the two save callbacks as props.

// Mock the B5 upload component so the form test can assert the upload->onUploaded
// wiring without the network. The mock surfaces a button that, when clicked, calls
// onUploaded with a deterministic URL keyed by `kind`.
jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({
    kind,
    label,
    onUploaded,
  }: {
    kind: string
    label: string
    onUploaded?: (url: string) => void
  }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded?.(`https://cdn.test/${kind}.png`)}>
      {label}
    </button>
  ),
}))

const EMPTY_INITIAL: ProfileFormValues = {
  businessName: '',
  tradingName: '',
  description: '',
  websiteUrl: '',
  companyNumber: '',
  vatRegistered: false,
  vatNumber: '',
  logoUrl: '',
  bannerUrl: '',
}

function renderForm(overrides: Partial<React.ComponentProps<typeof BusinessProfileForm>> = {}) {
  const onSaveContinue = jest.fn()
  const onSaveLater = jest.fn()
  const onBack = jest.fn()
  render(
    <BusinessProfileForm
      initialValues={EMPTY_INITIAL}
      onSaveContinue={onSaveContinue}
      onSaveLater={onSaveLater}
      onBack={onBack}
      saving={false}
      saveError={null}
      {...overrides}
    />,
  )
  return { onSaveContinue, onSaveLater, onBack }
}

describe('BusinessProfileForm (M2 F3 Tier-1)', () => {
  it('renders the setup step pill and the Tier-1 field set', () => {
    renderForm()
    expect(screen.getByText(/setup step 3 of 6/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/registered business name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/trading name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/business description/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/public website/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company number/i)).toBeInTheDocument()
    // logo + cover uploads
    expect(screen.getByRole('button', { name: /upload logo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload a brand cover image/i })).toBeInTheDocument()
  })

  it('does NOT render any Tier-3 sections (About you / business type / address / Values) per D4', () => {
    renderForm()
    expect(screen.queryByText(/about you/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/business type/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/surname/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/position in the business/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/address line 1/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/registered or head office address/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^values$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/unique taxpayer reference/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/charity number/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/head office phone/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/head office email/i)).not.toBeInTheDocument()
  })

  it('prefills the form from initialValues', () => {
    renderForm({
      initialValues: {
        businessName: 'Old Foundry Kitchen Ltd',
        tradingName: 'Old Foundry Kitchen',
        description: 'We serve great food.',
        websiteUrl: 'oldfoundry.co.uk',
        companyNumber: '09872341',
        vatRegistered: true,
        vatNumber: 'GB123456789',
        logoUrl: 'https://cdn.test/logo.png',
        bannerUrl: '',
      },
    })
    expect(screen.getByLabelText(/registered business name/i)).toHaveValue('Old Foundry Kitchen Ltd')
    expect(screen.getByLabelText(/trading name/i)).toHaveValue('Old Foundry Kitchen')
    expect(screen.getByLabelText(/business description/i)).toHaveValue('We serve great food.')
    expect(screen.getByLabelText(/public website/i)).toHaveValue('oldfoundry.co.uk')
    expect(screen.getByLabelText(/company number/i)).toHaveValue('09872341')
    // VAT prefilled to Yes -> the VAT number field is revealed + prefilled
    expect(screen.getByLabelText(/vat number/i)).toHaveValue('GB123456789')
  })

  it('shows a live 600 char counter on the description', () => {
    renderForm()
    const desc = screen.getByLabelText(/business description/i)
    fireEvent.change(desc, { target: { value: 'Hello' } })
    expect(screen.getByText('5 / 600')).toBeInTheDocument()
  })

  it('reveals the VAT number field when the VAT toggle is switched to Yes, and hides it on No', () => {
    renderForm()
    // No by default -> VAT number hidden
    expect(screen.queryByLabelText(/vat number/i)).not.toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: /vat registered/i })
    fireEvent.click(toggle)
    expect(screen.getByLabelText(/vat number/i)).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByLabelText(/vat number/i)).not.toBeInTheDocument()
  })

  it('shows the VAT threshold helper copy', () => {
    renderForm()
    expect(screen.getByText(/£90,000 threshold/i)).toBeInTheDocument()
  })

  it('blocks Save and continue until description and businessName are present', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/business description is required/i)).toBeInTheDocument()
    })
    expect(onSaveContinue).not.toHaveBeenCalled()

    // Fill description but clear businessName -> still blocked on businessName
    fireEvent.change(screen.getByLabelText(/business description/i), { target: { value: 'Tasty food.' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/registered business name is required/i)).toBeInTheDocument()
    })
    expect(onSaveContinue).not.toHaveBeenCalled()
  })

  it('calls onSaveContinue with the full Tier-1 payload once required fields are present', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/registered business name/i), { target: { value: 'Acme Ltd' } })
    fireEvent.change(screen.getByLabelText(/trading name/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/business description/i), { target: { value: 'Best widgets.' } })
    fireEvent.change(screen.getByLabelText(/public website/i), { target: { value: 'acme.co.uk' } })
    fireEvent.change(screen.getByLabelText(/company number/i), { target: { value: '01234567' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() => expect(onSaveContinue).toHaveBeenCalledTimes(1))
    expect(onSaveContinue).toHaveBeenCalledWith({
      businessName: 'Acme Ltd',
      tradingName: 'Acme',
      description: 'Best widgets.',
      websiteUrl: 'acme.co.uk',
      companyNumber: '01234567',
      vatRegistered: false,
      vatNumber: '',
      logoUrl: '',
      bannerUrl: '',
    })
  })

  it('Save and finish later calls onSaveLater with the partial values without validating required fields', () => {
    const { onSaveLater } = renderForm()
    // Only a trading name filled; description + businessName empty -> still allowed
    fireEvent.change(screen.getByLabelText(/trading name/i), { target: { value: 'Partial Co' } })
    fireEvent.click(screen.getByRole('button', { name: /save and finish later/i }))
    expect(onSaveLater).toHaveBeenCalledTimes(1)
    expect(onSaveLater).toHaveBeenCalledWith(
      expect.objectContaining({ tradingName: 'Partial Co', businessName: '', description: '' }),
    )
  })

  it('wires the logo + cover uploads into the submitted payload', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/registered business name/i), { target: { value: 'Acme Ltd' } })
    fireEvent.change(screen.getByLabelText(/business description/i), { target: { value: 'Best widgets.' } })
    fireEvent.click(screen.getByRole('button', { name: /upload logo/i }))
    fireEvent.click(screen.getByRole('button', { name: /upload a brand cover image/i }))
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))

    await waitFor(() => expect(onSaveContinue).toHaveBeenCalledTimes(1))
    expect(onSaveContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        logoUrl: 'https://cdn.test/logo.png',
        bannerUrl: 'https://cdn.test/banner.png',
      }),
    )
  })

  it('surfaces a save error passed from the parent', () => {
    renderForm({ saveError: 'We could not save your profile just now. Please try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/could not save your profile/i)
  })

  it('calls onBack from the Back button', () => {
    const { onBack } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
