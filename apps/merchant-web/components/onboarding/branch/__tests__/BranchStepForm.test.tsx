import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { BranchStepForm } from '@/components/onboarding/branch/BranchStepForm'
import type { BranchFormValues } from '@/components/onboarding/branch/BranchStepForm'

// M2 F4 + Branches PR-8: the "Add your main branch" step. These tests pin the form
// contract: the field set, the create-minimum gate (name + address), the MULTI-WINDOW
// hours UI (per-day open/closed switch, per-day add/remove window, Open 24h, inline
// client validation incl. within-day overlap), the amenities chips, the banner + photo
// uploads, the 4-digit PIN, and the dual-CTA payloads. The B5 uploads + the API are
// mocked at the page level; the form takes the save callbacks + the amenity catalog +
// initial values as props.

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

const EMPTY_INITIAL: BranchFormValues = {
  name: '',
  about: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  postcode: '',
  phone: '',
  email: '',
  websiteUrl: '',
  bannerUrl: '',
  photos: [],
  pin: '',
  hours: [
    { dayOfWeek: 1, isClosed: false, windows: [{ openTime: '09:00', closeTime: '17:00' }] },
    { dayOfWeek: 2, isClosed: false, windows: [{ openTime: '09:00', closeTime: '17:00' }] },
    { dayOfWeek: 3, isClosed: false, windows: [{ openTime: '09:00', closeTime: '17:00' }] },
    { dayOfWeek: 4, isClosed: false, windows: [{ openTime: '09:00', closeTime: '17:00' }] },
    { dayOfWeek: 5, isClosed: false, windows: [{ openTime: '09:00', closeTime: '17:00' }] },
    { dayOfWeek: 6, isClosed: false, windows: [{ openTime: '10:00', closeTime: '16:00' }] },
    { dayOfWeek: 0, isClosed: true, windows: [] },
  ],
  amenityIds: [],
  candidateToken: '',
}

const AMENITIES = [
  { id: 'a1', name: 'Free wifi', iconUrl: null, isActive: true },
  { id: 'a2', name: 'Outdoor seating', iconUrl: null, isActive: true },
]

function renderForm(overrides: Partial<React.ComponentProps<typeof BranchStepForm>> = {}) {
  const onSaveContinue = jest.fn()
  const onSaveLater = jest.fn()
  const onBack = jest.fn()
  render(
    <BranchStepForm
      initialValues={EMPTY_INITIAL}
      amenities={AMENITIES}
      onSaveContinue={onSaveContinue}
      onSaveLater={onSaveLater}
      onBack={onBack}
      saving={false}
      saveError={null}
      businessDescription="A lovely family kitchen."
      headOffice={null}
      {...overrides}
    />,
  )
  return { onSaveContinue, onSaveLater, onBack }
}

describe('BranchStepForm (M2 F4)', () => {
  it('renders the setup step pill and the branch detail fields', () => {
    renderForm()
    expect(screen.getByText(/setup step 4 of 6/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/branch name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/address line 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^town or city/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/postcode/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/branch phone/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/branch email/i)).toBeInTheDocument()
  })

  it('renders all seven days of opening hours with an open/closed switch each', () => {
    renderForm()
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(screen.getByText(new RegExp(`^${day}$`, 'i'))).toBeInTheDocument()
    }
    // One open/closed switch per day.
    expect(screen.getAllByRole('switch', { name: /open on/i })).toHaveLength(7)
  })

  it('renders the location-confirmed reassurance copy (no map dependency)', () => {
    renderForm()
    expect(screen.getByText(/confirm your exact location before you go live/i)).toBeInTheDocument()
  })

  it('renders the amenity chips from the catalog', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /free wifi/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /outdoor seating/i })).toBeInTheDocument()
  })

  it('shows the amenities empty/blocked message when the catalog is empty', () => {
    renderForm({ amenities: [] })
    expect(screen.getByText(/no amenities to choose from/i)).toBeInTheDocument()
  })

  it('toggles an amenity chip selection on click', () => {
    renderForm()
    const chip = screen.getByRole('button', { name: /free wifi/i })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders the PIN explainer and a 4-digit input', () => {
    renderForm()
    expect(screen.getByLabelText(/redemption pin/i)).toBeInTheDocument()
    expect(screen.getByText(/staff enter this pin/i)).toBeInTheDocument()
  })

  it('prefills the about field from the business description when "use my business description" is clicked', () => {
    renderForm()
    const useDesc = screen.getByRole('button', { name: /use my business description/i })
    fireEvent.click(useDesc)
    expect(screen.getByLabelText(/branch description/i)).toHaveValue('A lovely family kitchen.')
  })

  it('blocks Save and continue until name + address line 1 + city + postcode are present', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/branch name is required/i)).toBeInTheDocument()
    })
    expect(onSaveContinue).not.toHaveBeenCalled()
  })

  it('flags invalid opening hours inline and blocks continue (open === close)', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Main' } })
    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '1 St' } })
    fireEvent.change(screen.getByLabelText(/^town or city/i), { target: { value: 'Leeds' } })
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'LS1 1AA' } })
    // Set Monday close == open
    const monClose = screen.getByLabelText(/monday closing time/i)
    fireEvent.change(monClose, { target: { value: '09:00' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/cannot be the same/i)).toBeInTheDocument()
    })
    expect(onSaveContinue).not.toHaveBeenCalled()
  })

  it('Open 24 hours sets the day to 00:00 -> 24:00', () => {
    renderForm()
    const open24 = within(screen.getByTestId('hours-row-1')).getByRole('button', { name: /open 24 hours/i })
    fireEvent.click(open24)
    expect(screen.getByLabelText(/monday opening time/i)).toHaveValue('00:00')
    expect(screen.getByLabelText(/monday closing time/i)).toHaveValue('24:00')
  })

  it('closing a day hides its time inputs', () => {
    renderForm()
    expect(screen.getByLabelText(/monday opening time/i)).toBeInTheDocument()
    const monSwitch = within(screen.getByTestId('hours-row-1')).getByRole('switch', { name: /open on monday/i })
    fireEvent.click(monSwitch)
    expect(screen.queryByLabelText(/monday opening time/i)).not.toBeInTheDocument()
  })

  it('calls onSaveContinue with the full payload including hours, amenities, banner, photos and pin', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Old Foundry' } })
    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '12 Mill Lane' } })
    fireEvent.change(screen.getByLabelText(/^town or city/i), { target: { value: 'Huddersfield' } })
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'HD1 1AA' } })
    fireEvent.change(screen.getByLabelText(/branch phone/i), { target: { value: '+441484000000' } })
    fireEvent.change(screen.getByLabelText(/redemption pin/i), { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: /free wifi/i }))
    fireEvent.click(screen.getByRole('button', { name: /upload a branch banner/i }))
    fireEvent.click(screen.getByRole('button', { name: /add a branch photo/i }))

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => expect(onSaveContinue).toHaveBeenCalledTimes(1))
    const values = onSaveContinue.mock.calls[0][0] as BranchFormValues
    expect(values).toMatchObject({
      name: 'Old Foundry',
      addressLine1: '12 Mill Lane',
      city: 'Huddersfield',
      postcode: 'HD1 1AA',
      phone: '+441484000000',
      pin: '4821',
      bannerUrl: 'https://cdn.test/banner.png',
      amenityIds: ['a1'],
    })
    expect(values.photos).toEqual(['https://cdn.test/photo.png'])
    expect(values.hours).toHaveLength(7)
  })

  it('rejects a PIN that is not exactly 4 digits on continue', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Main' } })
    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '1 St' } })
    fireEvent.change(screen.getByLabelText(/^town or city/i), { target: { value: 'Leeds' } })
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'LS1 1AA' } })
    fireEvent.change(screen.getByLabelText(/redemption pin/i), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => {
      expect(screen.getByText(/4 digits/i)).toBeInTheDocument()
    })
    expect(onSaveContinue).not.toHaveBeenCalled()
  })

  it('Save and finish later calls onSaveLater with the partial values, no required-field gate', () => {
    const { onSaveLater } = renderForm()
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Partial Branch' } })
    fireEvent.click(screen.getByRole('button', { name: /save and finish later/i }))
    expect(onSaveLater).toHaveBeenCalledTimes(1)
    expect(onSaveLater).toHaveBeenCalledWith(expect.objectContaining({ name: 'Partial Branch' }))
  })

  it('Save and finish later flags invalid hours inline and does NOT call onSaveLater', async () => {
    const { onSaveLater } = renderForm()
    // Make Monday open === close so the client hours mirror should catch it on the
    // finish-later path too (parity with Save and continue), not defer to a 400.
    fireEvent.change(screen.getByLabelText(/monday closing time/i), { target: { value: '09:00' } })
    fireEvent.click(screen.getByRole('button', { name: /save and finish later/i }))
    await waitFor(() => {
      expect(screen.getByText(/cannot be the same/i)).toBeInTheDocument()
    })
    expect(onSaveLater).not.toHaveBeenCalled()
  })

  it('accepts an OVERNIGHT day (close < open) through to onSaveContinue with both times in the payload', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Night Diner' } })
    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '1 Late St' } })
    fireEvent.change(screen.getByLabelText(/^town or city/i), { target: { value: 'Leeds' } })
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'LS1 1AA' } })
    // Monday opens 18:00 and closes 02:00 (past midnight). This is valid.
    fireEvent.change(screen.getByLabelText(/monday opening time/i), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText(/monday closing time/i), { target: { value: '02:00' } })

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => expect(onSaveContinue).toHaveBeenCalledTimes(1))
    // No inline hours error rendered for the overnight day.
    expect(screen.queryByText(/closing time must be/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/cannot be the same/i)).not.toBeInTheDocument()

    const values = onSaveContinue.mock.calls[0][0] as BranchFormValues
    const monday = values.hours.find((d) => d.dayOfWeek === 1)!
    expect(monday.isClosed).toBe(false)
    expect(monday.windows).toEqual([{ openTime: '18:00', closeTime: '02:00' }])
  })

  it('adds and removes a second window on a day (multi-window UI)', async () => {
    renderForm()
    const monday = screen.getByTestId('hours-row-1')
    // One window to start: window 1 close field present, window 2 not.
    expect(screen.getByLabelText(/monday closing time, window 1/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/monday closing time, window 2/i)).not.toBeInTheDocument()

    // Add a window.
    fireEvent.click(within(monday).getByTestId('add-window-1'))
    expect(screen.getByLabelText(/monday opening time, window 2/i)).toBeInTheDocument()

    // Remove window 2 (the remove control only shows when 2+ windows exist).
    fireEvent.click(within(monday).getByTestId('remove-window-1-1'))
    expect(screen.queryByLabelText(/monday closing time, window 2/i)).not.toBeInTheDocument()
  })

  it('sends BOTH windows of a split day through to onSaveContinue', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Split Cafe' } })
    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '1 Cafe St' } })
    fireEvent.change(screen.getByLabelText(/^town or city/i), { target: { value: 'Leeds' } })
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'LS1 1AA' } })
    // Monday window 1 = 09:00-14:00, add a window 2 = 17:00-23:00.
    fireEvent.change(screen.getByLabelText(/monday opening time, window 1/i), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText(/monday closing time, window 1/i), { target: { value: '14:00' } })
    fireEvent.click(within(screen.getByTestId('hours-row-1')).getByTestId('add-window-1'))
    fireEvent.change(screen.getByLabelText(/monday opening time, window 2/i), { target: { value: '17:00' } })
    fireEvent.change(screen.getByLabelText(/monday closing time, window 2/i), { target: { value: '23:00' } })

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => expect(onSaveContinue).toHaveBeenCalledTimes(1))
    const values = onSaveContinue.mock.calls[0][0] as BranchFormValues
    const monday = values.hours.find((d) => d.dayOfWeek === 1)!
    expect(monday.windows).toEqual([
      { openTime: '09:00', closeTime: '14:00' },
      { openTime: '17:00', closeTime: '23:00' },
    ])
  })

  it('flags WITHIN-day overlapping windows inline and blocks continue', async () => {
    const { onSaveContinue } = renderForm()
    fireEvent.change(screen.getByLabelText(/branch name/i), { target: { value: 'Overlap' } })
    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: '1 St' } })
    fireEvent.change(screen.getByLabelText(/^town or city/i), { target: { value: 'Leeds' } })
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: 'LS1 1AA' } })
    // Monday window 1 = 09:00-13:00; add window 2 = 12:00-18:00 (overlaps window 1).
    fireEvent.change(screen.getByLabelText(/monday closing time, window 1/i), { target: { value: '13:00' } })
    fireEvent.click(within(screen.getByTestId('hours-row-1')).getByTestId('add-window-1'))
    fireEvent.change(screen.getByLabelText(/monday opening time, window 2/i), { target: { value: '12:00' } })
    fireEvent.change(screen.getByLabelText(/monday closing time, window 2/i), { target: { value: '18:00' } })

    fireEvent.click(screen.getByRole('button', { name: /save and continue/i }))
    await waitFor(() => expect(screen.getByText(/cannot overlap/i)).toBeInTheDocument())
    expect(onSaveContinue).not.toHaveBeenCalled()
  })

  it('surfaces a save error passed from the parent', () => {
    renderForm({ saveError: 'We could not save your branch just now. Please try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent(/could not save your branch/i)
  })

  it('calls onBack from the Back button', () => {
    const { onBack } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows a pending-review note on the branch photos section', () => {
    renderForm()
    expect(screen.getByText(/photos go to our team for a quick review/i)).toBeInTheDocument()
  })
})
