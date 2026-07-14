import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { BuilderForm, type BuilderResumeSeed, type BuilderSavePayload } from '@/components/onboarding/vouchers/BuilderForm'

// Voucher Builder prototype fidelity S2: the flagship (RMV) onboarding builder, rewired
// onto the SHARED prototype-fidelity core (components/vouchers/shared/*). Pins the shared
// DOM/copy + the governed flagship rules: per-type fields + chips; the terms checklist;
// the LIVE advisory score (CC-1: a Too-weak voucher can STILL be saved, and a Too-weak
// SUBMIT surfaces the soft weak-warning first); the "voucher 1 of 2" framing; the
// template-seeded defaults; allowedFields gating. The file-upload is mocked.

jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ label, onUploaded }: { label: string; onUploaded?: (u: string) => void }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded?.('https://cdn.test/voucher.png')}>
      {label}
    </button>
  ),
}))

// The full template allowedFields set (the standard backend template seed). The
// component itself has NO permissive default (fail closed: null = nothing editable),
// so the test harness passes the full set explicitly unless a test overrides it.
const FULL_ALLOWED = ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields']

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
      allowedFields={Object.prototype.hasOwnProperty.call(props, 'allowedFields') ? props.allowedFields : FULL_ALLOWED}
    />,
  )
  return { onSave, onSubmit }
}

describe('per-type structured fields (shared core)', () => {
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

describe('category-driven suggestion chips', () => {
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
    expect(screen.getByTestId('builder-preview-title')).toHaveTextContent(/Buy one main, get one free/i)
  })
})

describe('terms section with tier badges', () => {
  it('food_drink discount lists core fair terms + caution category terms with badges', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    const terms = screen.getByTestId('terms-section')
    expect(within(terms).getByText('Booking recommended')).toBeInTheDocument()
    expect(within(terms).getAllByText('Caution').length).toBeGreaterThan(0)
    expect(within(terms).getByText('Not valid with any other voucher')).toBeInTheDocument()
  })

  it('a caution term row exposes the tier severity in the checkbox accessible name (a11y)', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    const terms = screen.getByTestId('terms-section')
    const cautionBox = within(terms).getByRole('checkbox', { name: /Booking recommended\s+Caution/i })
    expect(cautionBox).toBeInTheDocument()
  })
})

describe('advisory score (CC-1: advisory, NOT a gate)', () => {
  it('shows the "How this voucher stacks up" panel with a Too weak meter for an empty draft', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    expect(screen.getByText('How this voucher stacks up')).toBeInTheDocument()
    expect(within(screen.getByTestId('builder-score')).getAllByText(/Too weak/i).length).toBeGreaterThan(0)
  })

  it('CC-1: Save + Submit are NOT disabled even when the score is Too weak', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Save voucher 1 of 2/i })).toBeEnabled()
  })

  it('Save as draft is NEVER gated by the score (a Too-weak draft saves straight away)', () => {
    const { onSave } = setup({ type: 'discount', categoryKey: 'food_drink' })
    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})

// (c) Weak-submit warning path on flagship submit (owner ruling 2026-07-13).
describe('weak-submit warning (governed CC-1 soft warning)', () => {
  it('a Too-weak SUBMIT opens the soft weak-warning first (does NOT submit yet); "Submit anyway" then submits', () => {
    const { onSubmit } = setup({ type: 'discount', categoryKey: 'food_drink' })
    // Empty draft => Too weak. Clicking Submit opens the warning instead of submitting.
    fireEvent.click(screen.getByRole('button', { name: /Save voucher 1 of 2/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('This offer may feel too weak')).toBeInTheDocument()
    // "Submit anyway" proceeds through the same submit path.
    fireEvent.click(screen.getByRole('button', { name: /Submit anyway/i }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('"Keep editing" dismisses the weak warning without submitting', () => {
    const { onSubmit } = setup({ type: 'discount', categoryKey: 'food_drink' })
    fireEvent.click(screen.getByRole('button', { name: /Save voucher 1 of 2/i }))
    fireEvent.click(screen.getByRole('button', { name: /Keep editing/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByText('This offer may feel too weak')).not.toBeInTheDocument()
  })

  it('a strong (non-weak) BOGO submits directly with no warning dialog', () => {
    const { onSubmit } = setup({ type: 'bogo', categoryKey: 'food_drink' })
    // A generous BOGO: full price £20, free item £20 => saving £20 => not weak.
    fireEvent.change(screen.getByLabelText('Full price') as HTMLInputElement, { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /Save voucher 1 of 2/i }))
    expect(screen.queryByText('This offer may feel too weak')).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

// (e) Cap-2 language + prototype flagship framing (A11 / FULL.html buildHeading +
// stepLabel): the flagship heading, the "Voucher N of 2 · Step 2 of 2" wizard chip
// (middle dot, never an em-dash) and the "Save voucher N of 2" submit label.
describe('cap-2 flagship framing (prototype A11)', () => {
  it('renders the prototype flagship heading "Build Your Flagship Voucher"', () => {
    setup({ type: 'bogo', voucherIndex: 1 })
    expect(screen.getByRole('heading', { name: 'Build Your Flagship Voucher' })).toBeInTheDocument()
  })

  it('voucher 1 renders "Voucher 1 of 2 · Step 2 of 2" + "Save voucher 1 of 2"', () => {
    setup({ type: 'bogo', voucherIndex: 1 })
    expect(screen.getByText('Voucher 1 of 2 · Step 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save voucher 1 of 2' })).toBeInTheDocument()
  })

  it('voucher 2 renders "Voucher 2 of 2 · Step 2 of 2" + "Save voucher 2 of 2"', () => {
    setup({ type: 'freebie', voucherIndex: 2 })
    expect(screen.getByText('Voucher 2 of 2 · Step 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save voucher 2 of 2' })).toBeInTheDocument()
  })
})

describe('auto-compose title/description + "use our suggestion" reset', () => {
  it('shows a composed suggestion and lets the merchant override then reset', () => {
    setup({ type: 'discount', categoryKey: 'food_drink' })
    expect(screen.getByTestId('builder-preview-title')).toHaveTextContent('20% off')

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'My own headline' } })
    expect(screen.getByTestId('builder-preview-title')).toHaveTextContent('My own headline')

    fireEvent.click(screen.getByRole('button', { name: /Use our suggestion/i }))
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('20% off')
  })
})

// (d) Template-seeded defaults: the create-flagship template title/description arrive as
// the editable starting values (seed with fields:null = fresh create, no draft bag yet).
describe('template-seeded defaults (fresh create)', () => {
  it('seeds the template title + description as the editable starting values', () => {
    setup({
      type: 'bogo',
      categoryKey: 'food_drink',
      initialFields: { title: 'Lunch on us, one main free', description: 'Our signature midweek offer.', estimatedSaving: 12, imageUrl: null, fields: null },
    })
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Lunch on us, one main free')
    expect(screen.getByTestId('builder-preview-title')).toHaveTextContent('Lunch on us, one main free')
    expect(screen.getByTestId('builder-preview-description')).toHaveTextContent('Our signature midweek offer.')
    // The template title/description are editable starting values: each carries a
    // "Use our suggestion" reset that reverts to the field-composed suggestion.
    expect(screen.getAllByRole('button', { name: /Use our suggestion/i }).length).toBeGreaterThanOrEqual(1)
  })
})

// (b) allowedFields gating: a field the template omits renders read-only and is NEVER
// written to the PATCH payload (mirrors updateRmvVoucherCore's RMV_FIELD_NOT_ALLOWED).
describe('allowedFields gating (governed RMV template lock)', () => {
  it('omitting "imageUrl" removes the photo upload control and drops imageUrl from the payload', () => {
    const { onSave } = setup({
      type: 'bogo',
      categoryKey: 'food_drink',
      allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'merchantFields'],
    })
    // No editable upload control (photo is read-only / template-set).
    expect(screen.queryByRole('button', { name: /Add a photo|Replace photo/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    const payload = onSave.mock.calls[0][0] as BuilderSavePayload
    expect('imageUrl' in payload).toBe(false)
    // Allowed keys still present.
    expect(payload.merchantFields).toBeDefined()
    expect(payload.title).toBeDefined()
  })

  it('omitting "estimatedSaving" renders the saving read-only (no editable money field) and drops it from the payload', () => {
    const { onSave } = setup({
      type: 'bogo',
      categoryKey: 'food_drink',
      allowedFields: ['title', 'description', 'terms', 'imageUrl', 'merchantFields'],
    })
    fireEvent.change(screen.getByLabelText('Full price') as HTMLInputElement, { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '20' } })
    // BOGO saving is normally editable; with estimatedSaving disallowed it is read-only.
    expect(screen.queryByLabelText('Estimated saving')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    const payload = onSave.mock.calls[0][0] as BuilderSavePayload
    expect('estimatedSaving' in payload).toBe(false)
  })

  it('omitting "merchantFields" removes the mechanic fields, terms and askHelp toggle', () => {
    setup({
      type: 'bogo',
      categoryKey: 'food_drink',
      allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl'],
    })
    expect(screen.queryByText('What does the customer buy?')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /Ask the Redeemo team to help/i })).not.toBeInTheDocument()
  })

  it('FAIL CLOSED: unknown permissions (null) render nothing editable, with a loading note and disabled CTAs', () => {
    const { onSave, onSubmit } = setup({ type: 'bogo', categoryKey: 'food_drink', allowedFields: null })
    // The loading note is visible; no mechanic fields, no photo upload, no title input,
    // no terms checklist, no askHelp switch.
    expect(screen.getByText(/Checking what you can edit on this voucher/i)).toBeInTheDocument()
    expect(screen.queryByText('What does the customer buy?')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add a photo|Replace photo/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    expect(screen.queryByTestId('terms-section')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /Ask the Redeemo team to help/i })).not.toBeInTheDocument()
    // Save + Submit are DISABLED (never PATCH with an unverified key set).
    const saveBtn = screen.getByRole('button', { name: /Save as draft/i })
    const submitBtn = screen.getByRole('button', { name: /Save voucher 1 of 2/i })
    expect(saveBtn).toBeDisabled()
    expect(submitBtn).toBeDisabled()
    fireEvent.click(saveBtn)
    fireEvent.click(submitBtn)
    expect(onSave).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('FAIL CLOSED: an explicitly EMPTY template list keeps everything read-only but is not the loading state', () => {
    setup({ type: 'bogo', categoryKey: 'food_drink', allowedFields: [] })
    expect(screen.queryByText(/Checking what you can edit on this voucher/i)).not.toBeInTheDocument()
    expect(screen.queryByText('What does the customer buy?')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    // Known-empty permissions: the CTAs stay enabled (an empty PATCH is harmless) but
    // nothing renders editable.
    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeEnabled()
  })
})

// (GAP 1) Discount kind integrity: the bag key contract with submitRmvVoucherCore.
// The backend reads Voucher.merchantFields.merchantFields.discountKind at submit and
// re-links type + rmvTemplateId to the sibling template (tests/api/merchant/
// voucher-bridge.test.ts). The frontend must therefore write discountKind into the
// nested bag on EVERY save, and a resumed draft must render + retain the saved kind.
describe('discount kind bag contract (type/template integrity)', () => {
  it('create-percent then toggle-fixed: the save payload bag carries discountKind "fixed"', () => {
    const { onSave } = setup({ type: 'discount', categoryKey: 'food_drink' })
    fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
    fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    const payload = onSave.mock.calls[0][0] as BuilderSavePayload
    const bag = payload.merchantFields as { discountKind?: string; builderType?: string }
    expect(bag.builderType).toBe('discount')
    expect(bag.discountKind).toBe('fixed')
  })

  it('untouched discount saves discountKind "percent" (the created default)', () => {
    const { onSave } = setup({ type: 'discount', categoryKey: 'food_drink' })
    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    const bag = (onSave.mock.calls[0][0] as BuilderSavePayload).merchantFields as { discountKind?: string }
    expect(bag.discountKind).toBe('percent')
  })

  it('resumed FIXED draft: renders the fixed branch and RE-SAVES discountKind "fixed" untouched', () => {
    const seed = realResumeSeed('discount', 'food_drink', () => {
      fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
      fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })
    })
    const { onSave } = setup({ type: 'discount', categoryKey: 'food_drink', initialFields: seed })
    // The resumed draft renders the saved kind (fixed branch, not the percent default).
    expect(screen.getByLabelText('Amount off')).toBeInTheDocument()
    // Re-saving without touching the toggle retains fixed (no silent kind reset).
    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    const bag = (onSave.mock.calls[0][0] as BuilderSavePayload).merchantFields as { discountKind?: string }
    expect(bag.discountKind).toBe('fixed')
  })

  it('resumed FIXED draft toggled back to percent saves discountKind "percent" (vice versa)', () => {
    const seed = realResumeSeed('discount', 'food_drink', () => {
      fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
      fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })
    })
    const { onSave } = setup({ type: 'discount', categoryKey: 'food_drink', initialFields: seed })
    fireEvent.click(screen.getByRole('radio', { name: 'A percentage off' }))
    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    const bag = (onSave.mock.calls[0][0] as BuilderSavePayload).merchantFields as { discountKind?: string }
    expect(bag.discountKind).toBe('percent')
  })

  it('the SUBMIT payload carries the same bag (discountKind travels to submitRmvVoucherCore)', () => {
    const { onSubmit } = setup({ type: 'discount', categoryKey: 'food_drink' })
    fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
    fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Save voucher 1 of 2/i }))
    // £10 fixed is Too weak with default terms? Clear the weak warning if it interposes.
    const anyway = screen.queryByRole('button', { name: /Submit anyway/i })
    if (anyway) fireEvent.click(anyway)
    const bag = (onSubmit.mock.calls[0][0] as BuilderSavePayload).merchantFields as { discountKind?: string }
    expect(bag.discountKind).toBe('fixed')
  })
})

describe('save payloads', () => {
  it('Save as draft posts the composed title/estimatedSaving + merchantFields', () => {
    const { onSave } = setup({ type: 'discount', categoryKey: 'food_drink', voucherIndex: 1 })
    fireEvent.change(screen.getByLabelText(/Percent off/i) as HTMLInputElement, { target: { value: '25' } })
    fireEvent.change(screen.getByLabelText(/Typical order/i) as HTMLInputElement, { target: { value: '40' } })

    fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0] as BuilderSavePayload
    expect(payload.title).toContain('25% off')
    expect(typeof payload.estimatedSaving).toBe('number')
    expect(payload.estimatedSaving!).toBeGreaterThan(0)
    expect((payload.merchantFields as { builderType?: string }).builderType).toBe('discount')
  })
})

// ── REAL round-trip resume fixtures ──────────────────────────────────────────
//
// A saved DRAFT is NOT a flat bag: buildPayload PATCHes { title, description,
// estimatedSaving, terms, imageUrl, merchantFields: <draft bag> }; the backend
// (updateRmvVoucherCore) merges the WHOLE body into Voucher.merchantFields, so the
// merchant's edits live INSIDE the stored bag (flattened keys + a nested draft bag).
// captureSavePayload renders a throwaway BuilderForm, applies the edits, captures the
// real buildPayload() output, then unmounts. simulateBackendMerge + flattenToSeed
// reproduce the store + the page's resumeSeedFromRmv flatten so each test round-trips.

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
      allowedFields={FULL_ALLOWED}
    />,
  )
  edit()
  fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
  const payload = onSave.mock.calls[0][0] as BuilderSavePayload
  cleanup()
  return payload
}

function simulateBackendMerge(payload: BuilderSavePayload): Record<string, unknown> {
  return { ...payload }
}

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

    setup({ type: 'bogo', categoryKey: 'food_drink', initialFields: seed })
    expect((screen.getByLabelText('Item') as HTMLInputElement).value).toBe('a main')
    expect((screen.getByLabelText('Value of the free item') as HTMLInputElement).value).toBe('12')
    expect(screen.getByTestId('builder-preview-title')).toHaveTextContent(/Buy one main, get one free/i)
  })

  it('discount draft: rehydrates discountKind (fixed) + amount through the round-trip', () => {
    const seed = realResumeSeed('discount', 'food_drink', () => {
      fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
      fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })
    })

    setup({ type: 'discount', categoryKey: 'food_drink', initialFields: seed })
    expect(screen.getByLabelText('Amount off')).toBeInTheDocument()
    expect((screen.getByLabelText('Amount off') as HTMLInputElement).value).toBe('10')
    expect(screen.getByTestId('builder-preview-title')).toHaveTextContent(/£10 off/i)
  })

  it('discount draft with edited title/description + selected clause + custom term + askHelp', () => {
    const seed = realResumeSeed(
      'discount',
      'food_drink',
      () => {
        fireEvent.change(screen.getByLabelText(/Percent off/i) as HTMLInputElement, { target: { value: '25' } })
        fireEvent.change(screen.getByLabelText(/Typical order/i) as HTMLInputElement, { target: { value: '40' } })
        fireEvent.change(screen.getByLabelText('Title') as HTMLInputElement, { target: { value: 'My own headline' } })
        fireEvent.change(screen.getByLabelText('Description') as HTMLInputElement, { target: { value: 'My own body copy' } })
        const terms = screen.getByTestId('terms-section')
        fireEvent.click(within(terms).getByRole('checkbox', { name: 'Not valid with any other voucher' }))
        fireEvent.change(screen.getByLabelText('Add your own term') as HTMLInputElement, { target: { value: 'Eat in only please' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add term' }))
        fireEvent.click(screen.getByRole('switch', { name: /Ask the Redeemo team to help/i }))
      },
      { title: 'Template default title', description: 'Template default body', estimatedSaving: 5 },
    )

    setup({ type: 'discount', categoryKey: 'food_drink', initialFields: seed })
    // Edited title/description rehydrate from the STORED bag, not the template defaults.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('My own headline')
    expect(screen.getByTestId('builder-preview-title')).toHaveTextContent('My own headline')
    expect(screen.getByTestId('builder-preview-description')).toHaveTextContent('My own body copy')
    const terms = screen.getByTestId('terms-section')
    expect((within(terms).getByRole('checkbox', { name: 'Not valid with any other voucher' }) as HTMLInputElement).checked).toBe(true)
    expect(within(terms).getByText('Eat in only please')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /Ask the Redeemo team to help/i }).getAttribute('aria-checked')).toBe('true')
  })

  it('draft with a photo: round-trips the uploaded imageUrl into the preview', () => {
    const seed = realResumeSeed('bogo', 'food_drink', () => {
      fireEvent.change(screen.getByLabelText('Item') as HTMLInputElement, { target: { value: 'a main' } })
      fireEvent.click(screen.getByRole('button', { name: /Add a photo/i }))
    })
    expect(seed.imageUrl).toBe('https://cdn.test/voucher.png')

    setup({ type: 'bogo', categoryKey: 'food_drink', initialFields: seed })
    expect(screen.getByRole('button', { name: /Replace photo/i })).toBeInTheDocument()
  })

  it('default (no initialFields) keeps fresh-start behaviour unchanged', () => {
    setup({ type: 'bogo', categoryKey: 'food_drink' })
    expect((screen.getByLabelText('Item') as HTMLInputElement).value).toBe('')
  })
})
