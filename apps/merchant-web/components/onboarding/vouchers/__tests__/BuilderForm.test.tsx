import { render, screen, fireEvent, within } from '@testing-library/react'
import { BuilderForm } from '@/components/onboarding/vouchers/BuilderForm'

// M2 F5: the guided builder (Step 2). Pins: per-type fields render + chips per
// category; the terms section with Fair/Caution/Restrictive tags; the LIVE advisory
// score (CC-1: a Too-weak voucher can STILL be saved/submitted); the auto-composed
// title/description with the "use our suggestion" reset. The B5 file-upload is mocked.

jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ label, onUploaded }: { label: string; onUploaded?: (u: string) => void }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded?.('https://cdn.test/voucher.png')}>
      {label}
    </button>
  ),
}))

function setup(props: Partial<React.ComponentProps<typeof BuilderForm>> = {}) {
  const onSave = jest.fn()
  const onSubmit = jest.fn()
  render(
    <BuilderForm
      type={props.type ?? 'bogo'}
      categoryKey={props.categoryKey ?? 'food_drink'}
      merchantBusinessName="The Old Foundry"
      voucherIndex={props.voucherIndex ?? 1}
      saving={props.saving ?? false}
      saveError={props.saveError ?? null}
      onSave={onSave}
      onSubmit={onSubmit}
      onBack={jest.fn()}
    />,
  )
  return { onSave, onSubmit }
}

describe('per-type structured fields (S0 §3)', () => {
  it('BOGO renders the buy + free item fields', () => {
    setup({ type: 'bogo' })
    expect(screen.getByText('What does the customer buy?')).toBeInTheDocument()
    expect(screen.getByText('What do they get free?')).toBeInTheDocument()
  })

  it('Spend & save renders spend + save fields', () => {
    setup({ type: 'spend' })
    expect(screen.getByText('How much does a customer need to spend?')).toBeInTheDocument()
    expect(screen.getByText('How much do they save?')).toBeInTheDocument()
  })

  it('Discount renders the kind toggle + percentage field', () => {
    setup({ type: 'discount' })
    expect(screen.getByText('What kind of discount?')).toBeInTheDocument()
    expect(screen.getByText('What percentage off?')).toBeInTheDocument()
  })

  it('Package renders the bundle + price + normal-total fields', () => {
    setup({ type: 'package' })
    expect(screen.getByText('What is in the package?')).toBeInTheDocument()
    expect(screen.getByText('What does the customer pay?')).toBeInTheDocument()
    expect(screen.getByText('What would these normally cost?')).toBeInTheDocument()
  })

  it('Freebie renders the free item + worth + needs-purchase fields', () => {
    setup({ type: 'freebie' })
    expect(screen.getByText('What does the customer get free?')).toBeInTheDocument()
    expect(screen.getByText('What is it worth?')).toBeInTheDocument()
    expect(screen.getByText('Do they need to buy something to get it?')).toBeInTheDocument()
  })
})

describe('category-driven suggestion chips (S0 §1)', () => {
  it('BOGO buy chips for food_drink include "A main"', () => {
    setup({ type: 'bogo', categoryKey: 'food_drink' })
    expect(screen.getByRole('button', { name: 'A main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Any full price item' })).toBeInTheDocument()
  })

  it('BOGO buy chips for beauty_wellness include "A treatment"', () => {
    setup({ type: 'bogo', categoryKey: 'beauty_wellness' })
    expect(screen.getByRole('button', { name: 'A treatment' })).toBeInTheDocument()
  })

  it('tapping a chip fills the field and updates the live preview title', () => {
    setup({ type: 'bogo', categoryKey: 'food_drink' })
    fireEvent.click(screen.getByRole('button', { name: 'A main' }))
    // The composed title should reflect the buy item.
    expect(screen.getByTestId('preview-title')).toHaveTextContent(/Buy one main, get one free/i)
  })
})

describe('terms section with Fair/Caution/Restrictive tags (S0 §2)', () => {
  it('food_drink discount lists core fair terms + caution category terms with badges', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    const terms = screen.getByTestId('terms-section')
    expect(within(terms).getByText('Booking recommended')).toBeInTheDocument()
    // Caution terms carry a "Caution" badge; fair terms do not.
    expect(within(terms).getAllByText('Caution').length).toBeGreaterThan(0)
    expect(within(terms).getByText('Not valid with any other voucher')).toBeInTheDocument()
  })
})

describe('advisory score widget (S0 §4) - CC-1 advisory, NOT a gate', () => {
  it('shows the "How this voucher stacks up" panel with a Too weak meter for an empty draft', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    expect(screen.getByText('How this voucher stacks up')).toBeInTheDocument()
    // An empty draft (no saving) reads Too weak.
    expect(screen.getByTestId('score-meter')).toHaveTextContent(/Too weak/i)
  })

  it('CC-1: Save / Submit are NOT disabled even when the score is Too weak', () => {
    const { onSubmit } = setup({ type: 'discount', categoryKey: 'food_drink' })
    // No fields entered -> Too weak. Save button must remain ENABLED (advisory only).
    const saveBtn = screen.getByRole('button', { name: /Save as draft/i })
    const submitBtn = screen.getByRole('button', { name: /Save voucher 1 of 2/i })
    expect(screen.getByTestId('score-meter')).toHaveTextContent(/Too weak/i)
    expect(saveBtn).toBeEnabled()
    expect(submitBtn).toBeEnabled()
    // And the weak voucher CAN be saved + submitted.
    fireEvent.click(submitBtn)
    expect(onSubmit).toHaveBeenCalled()
  })
})

describe('auto-compose title/description + "use our suggestion" reset (S0 §6)', () => {
  it('shows a composed suggestion and lets the merchant override then reset', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    // Default percent discount -> "20% off".
    expect(screen.getByTestId('preview-title')).toHaveTextContent('20% off')

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'My own headline' } })
    expect(screen.getByTestId('preview-title')).toHaveTextContent('My own headline')

    // Reset link restores the suggestion.
    fireEvent.click(screen.getByRole('button', { name: /Use our suggestion/i }))
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('20% off')
  })
})

describe('save payloads', () => {
  it('Save as draft posts the composed title/description/estimatedSaving + merchantFields', () => {
    const { onSave } = setup({ type: 'discount', categoryKey: 'food_drink', voucherIndex: 1 })
    // Fill a percentage so estimatedSaving derives.
    const pct = screen.getByLabelText(/What percentage off/i) as HTMLInputElement
    fireEvent.change(pct, { target: { value: '25' } })
    const order = screen.getByLabelText(/typical order value/i) as HTMLInputElement
    fireEvent.change(order, { target: { value: '40' } })

    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(payload.title).toContain('25% off')
    expect(typeof payload.estimatedSaving).toBe('number')
    expect(payload.estimatedSaving).toBeGreaterThan(0)
    expect(payload.merchantFields.builderType).toBe('discount')
  })
})
