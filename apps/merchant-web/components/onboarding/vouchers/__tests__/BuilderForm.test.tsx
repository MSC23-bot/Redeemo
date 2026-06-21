import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { BuilderForm, type BuilderResumeSeed, type BuilderSavePayload } from '@/components/onboarding/vouchers/BuilderForm'

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
      initialFields={props.initialFields}
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

  it('a caution term row exposes the tier severity in the checkbox accessible name (a11y)', () => {
    // The wrapping <label> supplies the name, so it includes BOTH the clause text AND the
    // "Caution" tier badge. An aria-label on the checkbox would override the label and
    // drop the tier severity from what a screen reader announces.
    setup({ type: 'discount', categoryKey: 'food_drink' })
    const terms = screen.getByTestId('terms-section')
    const cautionBox = within(terms).getByRole('checkbox', { name: /Booking recommended\s+Caution/i })
    expect(cautionBox).toBeInTheDocument()
  })

  it('a fair term row has no tier suffix in the accessible name (no badge)', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    const terms = screen.getByTestId('terms-section')
    // Fair terms carry no badge, so the name is just the clause text.
    const fairBox = within(terms).getByRole('checkbox', { name: 'Not valid with any other voucher' })
    expect(fairBox).toBeInTheDocument()
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

// ── REAL round-trip resume fixtures (review-mandated) ────────────────────────
//
// The OLD resume tests passed a FLAT merchantFields bag the system NEVER writes
// (bogoBuy / selectedClauseIds / discountKind directly under merchantFields), so they
// validated the wrong contract and the data-loss bug shipped. These tests rebuild the
// resume fixtures from the EXACT shape the backend stores after a real save:
//
//   1. The merchant fills BuilderForm and clicks "Save as draft". onSave receives
//      buildPayload() = { title, description, estimatedSaving, terms, imageUrl,
//        merchantFields: { builderType, ...draft, selectedClauseIds, customTerms,
//        askHelp, titleEdited, descEdited } }.
//   2. The PATCH body IS that payload; updateRmvVoucherCore merges the WHOLE body into
//      Voucher.merchantFields (top-level columns keep the template defaults).
//      So stored merchantFields = { ...patchBody } (the bag nests under .merchantFields).
//   3. listRmvVouchers returns row.title/description/estimatedSaving/imageUrl = TEMPLATE
//      DEFAULTS, and row.merchantFields = the stored bag from step 2.
//   4. The page flattens that row into the clean resume seed BuilderForm consumes:
//        { title, description, estimatedSaving, imageUrl, fields: <nested draft bag> }
//      reading the merchant's edited title/desc/saving/imageUrl from the FLATTENED keys
//      in the stored bag (template-default fallback when absent), and the draft fields
//      from the NESTED merchantFields.merchantFields bag.
//
// captureSavePayload renders a throwaway BuilderForm, applies the field edits, captures
// the real buildPayload() output via onSave, then unmounts. simulateBackendMerge +
// flattenToSeed reproduce steps 2 + 4 so each test round-trips end to end.

function captureSavePayload(
  type: React.ComponentProps<typeof BuilderForm>['type'],
  categoryKey: React.ComponentProps<typeof BuilderForm>['categoryKey'],
  edit: () => void,
): BuilderSavePayload {
  const onSave = jest.fn()
  render(
    <BuilderForm
      type={type}
      categoryKey={categoryKey}
      merchantBusinessName="The Old Foundry"
      voucherIndex={1}
      saving={false}
      saveError={null}
      onSave={onSave}
      onSubmit={jest.fn()}
      onBack={jest.fn()}
    />,
  )
  edit()
  fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
  const payload = onSave.mock.calls[0][0] as BuilderSavePayload
  cleanup() // tear down the capture form before the resume form renders
  return payload
}

// Reproduce updateRmvVoucherCore: the WHOLE PATCH body merges into merchantFields.
function simulateBackendMerge(payload: BuilderSavePayload): Record<string, unknown> {
  return { ...payload }
}

// Reproduce the page's resumeSeedFromRmv: flatten the stored bag into the clean seed.
// row.title/description/estimatedSaving/imageUrl are TEMPLATE DEFAULTS; the merchant's
// edits live inside the stored bag (flattened keys + nested draft bag).
function flattenToSeed(
  storedMerchantFields: Record<string, unknown>,
  templateDefaults: { title?: string | null; description?: string | null; estimatedSaving?: number | null; imageUrl?: string | null } = {},
): BuilderResumeSeed {
  const mf = storedMerchantFields
  const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const asStr = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  return {
    title: 'title' in mf ? asStr(mf.title) : (templateDefaults.title ?? null),
    description: 'description' in mf ? asStr(mf.description) : (templateDefaults.description ?? null),
    estimatedSaving: 'estimatedSaving' in mf ? asNum(mf.estimatedSaving) : (templateDefaults.estimatedSaving ?? null),
    imageUrl: 'imageUrl' in mf ? asStr(mf.imageUrl) : (templateDefaults.imageUrl ?? null),
    fields: (mf.merchantFields as Record<string, unknown>) ?? null,
  }
}

// Build the resume seed exactly as a real saved DRAFT would produce it.
function realResumeSeed(
  type: React.ComponentProps<typeof BuilderForm>['type'],
  categoryKey: React.ComponentProps<typeof BuilderForm>['categoryKey'],
  edit: () => void,
  templateDefaults?: { title?: string | null; description?: string | null; estimatedSaving?: number | null; imageUrl?: string | null },
): BuilderResumeSeed {
  const payload = captureSavePayload(type, categoryKey, edit)
  const stored = simulateBackendMerge(payload)
  return flattenToSeed(stored, templateDefaults)
}

describe('resume rehydration (real round-trip shape)', () => {
  it('BOGO draft: round-trips the buy item + free price through save then store then resume', () => {
    const seed = realResumeSeed('bogo', 'food_drink', () => {
      fireEvent.change(screen.getByLabelText('Item') as HTMLInputElement, { target: { value: 'a main' } })
      fireEvent.change(screen.getByLabelText('Full price') as HTMLInputElement, { target: { value: '12' } })
      fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '12' } })
    })

    // TEMPLATE DEFAULTS would be wrong: assert the resume shows the MERCHANT's edits.
    setup({ type: 'bogo', categoryKey: 'food_drink', initialFields: seed })
    expect((screen.getByLabelText('Item') as HTMLInputElement).value).toBe('a main')
    expect((screen.getByLabelText('Value of the free item') as HTMLInputElement).value).toBe('12')
    expect(screen.getByTestId('preview-title')).toHaveTextContent(/Buy one main, get one free/i)
  })

  it('discount draft: rehydrates discountKind (fixed) + amount through the round-trip', () => {
    const seed = realResumeSeed('discount', 'food_drink', () => {
      // Switch to a FIXED discount and set the amount.
      fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
      fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })
    })

    setup({ type: 'discount', categoryKey: 'food_drink', initialFields: seed })
    // The fixed kind survived: the Amount off field exists (the percent field does not).
    expect(screen.getByLabelText('Amount off')).toBeInTheDocument()
    expect((screen.getByLabelText('Amount off') as HTMLInputElement).value).toBe('10')
    expect(screen.getByTestId('preview-title')).toHaveTextContent(/£10 off/i)
  })

  it('discount draft with edited title/description + selected clauses + custom terms + askHelp', () => {
    const seed = realResumeSeed(
      'discount',
      'food_drink',
      () => {
        fireEvent.change(screen.getByLabelText(/What percentage off/i) as HTMLInputElement, { target: { value: '25' } })
        fireEvent.change(screen.getByLabelText(/typical order value/i) as HTMLInputElement, { target: { value: '40' } })
        // Edit the title + description so titleEdited / descEdited are stored true.
        fireEvent.change(screen.getByLabelText('Title') as HTMLInputElement, { target: { value: 'My own headline' } })
        fireEvent.change(screen.getByLabelText('Description') as HTMLInputElement, { target: { value: 'My own body copy' } })
        // Select a clause + add a custom term.
        const terms = screen.getByTestId('terms-section')
        fireEvent.click(within(terms).getByRole('checkbox', { name: 'Not valid with any other voucher' }))
        fireEvent.change(screen.getByLabelText('Add your own term') as HTMLInputElement, { target: { value: 'Eat in only please' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add term' }))
        // Flag the concierge help toggle.
        fireEvent.click(screen.getByRole('switch', { name: /Ask the Redeemo team to help/i }))
      },
      // TEMPLATE DEFAULTS the resume must NOT fall back to (they would be the wrong values).
      { title: 'Template default title', description: 'Template default body', estimatedSaving: 5 },
    )

    setup({ type: 'discount', categoryKey: 'food_drink', initialFields: seed })
    // Edited title/description rehydrate from the STORED bag, not the template defaults.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('My own headline')
    expect(screen.getByTestId('preview-title')).toHaveTextContent('My own headline')
    expect(screen.getByTestId('preview-desc')).toHaveTextContent('My own body copy')
    // The selected clause stays selected + the custom term rehydrates.
    const terms = screen.getByTestId('terms-section')
    expect((within(terms).getByRole('checkbox', { name: 'Not valid with any other voucher' }) as HTMLInputElement).checked).toBe(true)
    expect(within(terms).getByText('Eat in only please')).toBeInTheDocument()
    // The concierge toggle stays on.
    expect((screen.getByRole('switch', { name: /Ask the Redeemo team to help/i }) as HTMLInputElement).getAttribute('aria-checked')).toBe('true')
  })

  it('draft with a photo: round-trips the uploaded imageUrl into the preview', () => {
    const seed = realResumeSeed('bogo', 'food_drink', () => {
      fireEvent.change(screen.getByLabelText('Item') as HTMLInputElement, { target: { value: 'a main' } })
      // The mocked FileUpload sets a fixed url on click.
      fireEvent.click(screen.getByRole('button', { name: /Add a photo/i }))
    })
    // The stored bag carries the photo url at the flattened imageUrl key.
    expect(seed.imageUrl).toBe('https://cdn.test/voucher.png')

    setup({ type: 'bogo', categoryKey: 'food_drink', initialFields: seed })
    // The photo rehydrates: the upload button now reads "Replace photo".
    expect(screen.getByRole('button', { name: /Replace photo/i })).toBeInTheDocument()
  })

  it('default (no initialFields) keeps fresh-start behaviour unchanged', () => {
    setup({ type: 'bogo', categoryKey: 'food_drink' })
    // Fresh start -> the buy item field is empty.
    expect((screen.getByLabelText('Item') as HTMLInputElement).value).toBe('')
    expect(screen.getByTestId('preview-title')).toHaveTextContent(/Your voucher title|Buy one, get one free/i)
  })
})
