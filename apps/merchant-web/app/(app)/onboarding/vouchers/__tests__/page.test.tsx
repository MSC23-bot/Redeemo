import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VouchersPage from '@/app/(app)/onboarding/vouchers/page'
import { ApiError } from '@/lib/api/client'
import { BuilderForm, type BuilderSavePayload } from '@/components/onboarding/vouchers/BuilderForm'

// M2 F5: the vouchers onboarding page. Wires the type picker -> create-flagship ->
// guided builder -> update + submit; tracks "voucher 1 of 2" / "2 of 2"; on building
// the 2nd, returns to the hub; surfaces the eligible + cap errors. The API + the
// taxonomy + the profile are mocked at the page boundary.

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

jest.mock('@/lib/auth/session', () => ({
  useSession: () => ({ isAuthenticated: true }),
}))

const mockProfile = { data: { primaryCategoryId: 'sub-restaurant', businessName: 'The Old Foundry' }, isLoading: false, isError: false }
jest.mock('@/lib/auth/useMerchantProfile', () => ({
  useMerchantProfile: () => mockProfile,
}))

const getOnboardingTaxonomy = jest.fn()
jest.mock('@/lib/api/taxonomy', () => ({
  getOnboardingTaxonomy: () => getOnboardingTaxonomy(),
}))

const createFlagshipRmv = jest.fn()
const updateRmvVoucher = jest.fn()
const submitRmvVoucher = jest.fn()
const listRmvVouchers = jest.fn()
jest.mock('@/lib/api/voucher', () => ({
  createFlagshipRmv: (...a: unknown[]) => createFlagshipRmv(...a),
  updateRmvVoucher: (...a: unknown[]) => updateRmvVoucher(...a),
  submitRmvVoucher: (...a: unknown[]) => submitRmvVoucher(...a),
  listRmvVouchers: (...a: unknown[]) => listRmvVouchers(...a),
  // Mirrors the real helper's FAIL-CLOSED semantics: the template's own list when the
  // fetched row carries one; null (nothing editable) when unknown. No permissive default.
  rmvAllowedFields: (row: { rmvTemplate?: { allowedFields?: string[] | null } } | null | undefined) => {
    const list = row?.rmvTemplate?.allowedFields
    return Array.isArray(list) ? list : null
  },
}))

jest.mock('@/components/ui/file-upload', () => ({
  FileUpload: ({ label, onUploaded }: { label: string; onUploaded?: (u: string) => void }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded?.('https://cdn.test/voucher.png')}>
      {label}
    </button>
  ),
}))

const FOOD_TAXONOMY = {
  categories: [
    {
      id: 'cat-food',
      name: 'Food & Drink',
      parentId: null,
      eligible: true,
      subcategories: [{ id: 'sub-restaurant', name: 'Restaurant', parentId: 'cat-food', tags: [] }],
    },
  ],
}

// The standard template allowedFields set (backend seed). The page reads the
// AUTHORITATIVE list from the fetched row's rmvTemplate: rows without it are treated
// as unknown and the builder fails closed (nothing editable).
const FULL_ALLOWED = ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields']
const FULL_TEMPLATE = { allowedFields: FULL_ALLOWED }

// A freshly-created DRAFT row as the post-create REFETCH returns it: top-level template
// defaults + the rmvTemplate relation (which the create response itself lacks).
function createdRow(id: string, type: string, template: { allowedFields: string[] } = FULL_TEMPLATE) {
  return { id, type, status: 'DRAFT', title: 'Template title', description: 'Template body', estimatedSaving: 5, rmvTemplate: template }
}

// Click a flagship Submit button, then clear the governed soft weak-warning if it
// interposes (a Too-weak voucher shows it; a strong one submits directly). CC-1: the
// warning never hard-gates - "Submit anyway" proceeds through the same submit path.
function submitFlagship(label: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: label }))
  const anyway = screen.queryByRole('button', { name: /Submit anyway/i })
  if (anyway) fireEvent.click(anyway)
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <VouchersPage />
    </QueryClientProvider>,
  )
}

// ── REAL round-trip DRAFT fixtures (review-mandated) ─────────────────────────
//
// A saved DRAFT row is NOT a flat merchantFields bag. buildPayload PATCHes a body
// { title, description, estimatedSaving, terms, imageUrl, merchantFields: <draft bag> };
// the backend (updateRmvVoucherCore) merges the WHOLE body into Voucher.merchantFields
// and leaves the top-level columns at their create-flagship TEMPLATE DEFAULTS. So a
// resumed row has row.title/description = TEMPLATE DEFAULTS and row.merchantFields =
// { ...patchBody } (the draft bag nested one level deeper). These helpers reproduce that
// EXACT shape from a real buildPayload so the resume fixtures stay honest and drift-proof.

function captureSavePayload(
  type: React.ComponentProps<typeof BuilderForm>['type'],
  edit?: () => void,
): BuilderSavePayload {
  const onSave = jest.fn()
  render(
    <BuilderForm
      type={type}
      categoryKey="food_drink"
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
  edit?.()
  fireEvent.click(screen.getByRole('button', { name: /Save as draft/i }))
  const payload = onSave.mock.calls[0][0] as BuilderSavePayload
  cleanup() // tear down the capture form before the page renders
  return payload
}

// Build a saved DRAFT row exactly as the backend stores it after a real save:
// the top-level columns keep the TEMPLATE DEFAULTS; merchantFields = the merged PATCH body.
// `type` uses the REAL backend VoucherType enum (the create-flagship template type),
// because the page resolves the builder type via enumToBuilderType(row.type).
function draftRow(
  id: string,
  type: 'BOGO' | 'FREEBIE' | 'DISCOUNT_PERCENT' | 'DISCOUNT_FIXED' | 'SPEND_AND_SAVE' | 'PACKAGE_DEAL',
  builderType: React.ComponentProps<typeof BuilderForm>['type'],
  templateDefaults: { title: string; description: string; estimatedSaving: number },
  edit?: () => void,
) {
  const payload = captureSavePayload(builderType, edit)
  return {
    id,
    type,
    status: 'DRAFT',
    // TEMPLATE DEFAULTS on the top-level columns (the backend never overwrites these).
    title: templateDefaults.title,
    description: templateDefaults.description,
    estimatedSaving: templateDefaults.estimatedSaving,
    // The merged PATCH body lands in merchantFields (the draft bag nests under .merchantFields).
    merchantFields: { ...payload },
    // List rows carry the template relation; its allowedFields is the authoritative
    // gating source (fail closed without it).
    rmvTemplate: FULL_TEMPLATE,
  }
}

beforeEach(() => {
  push.mockReset()
  getOnboardingTaxonomy.mockReset().mockResolvedValue(FOOD_TAXONOMY)
  createFlagshipRmv.mockReset().mockResolvedValue({ id: 'rmv-1', type: 'BOGO', status: 'DRAFT' })
  updateRmvVoucher.mockReset().mockResolvedValue({ id: 'rmv-1', type: 'BOGO', status: 'DRAFT' })
  submitRmvVoucher.mockReset().mockResolvedValue({ id: 'rmv-1', type: 'BOGO', status: 'PENDING_APPROVAL' })
  listRmvVouchers.mockReset().mockResolvedValue([])
})

describe('type pick -> create-flagship -> builder', () => {
  it('resolves the food category, picks BOGO, and creates the flagship DRAFT', async () => {
    // Initial load: no rows. Post-create refetch: the created DRAFT WITH its template.
    listRmvVouchers.mockResolvedValueOnce([]).mockResolvedValue([createdRow('rmv-1', 'BOGO')])
    renderPage()
    // The picker shows once taxonomy + profile load.
    const bogo = await screen.findByRole('button', { name: /Buy one, get one free/i })
    fireEvent.click(bogo)
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

    await waitFor(() => expect(createFlagshipRmv).toHaveBeenCalledWith('BOGO'))
    // The guided builder mounts, EDITABLE (the refetched template allows the fields).
    expect(await screen.findByText('What does the customer buy?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeEnabled()
  })

  it('GAP 2: the fresh-create path gates on the FETCHED template allowedFields (restricted template)', async () => {
    // The refetched row carries a template WITHOUT imageUrl or estimatedSaving: those
    // surfaces must render read-only even though this is a brand-new draft.
    listRmvVouchers
      .mockResolvedValueOnce([])
      .mockResolvedValue([createdRow('rmv-1', 'BOGO', { allowedFields: ['title', 'description', 'terms', 'merchantFields'] })])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Buy one, get one free/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    expect(await screen.findByText('What does the customer buy?')).toBeInTheDocument()
    // Photo upload absent (imageUrl not allowed); title still editable.
    expect(screen.queryByRole('button', { name: /Add a photo|Replace photo/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
  })

  it('GAP 2: unknown permissions FAIL CLOSED (created row missing from the refetched list)', async () => {
    // The refetch never returns the created row: the builder must render its
    // fail-closed loading state, with nothing editable and the CTAs disabled.
    listRmvVouchers.mockResolvedValue([])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Buy one, get one free/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => expect(createFlagshipRmv).toHaveBeenCalledWith('BOGO'))
    expect(await screen.findByText(/Checking what you can edit on this voucher/i)).toBeInTheDocument()
    expect(screen.queryByText('What does the customer buy?')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save as draft/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Save voucher 1 of 2/i })).toBeDisabled()
    expect(updateRmvVoucher).not.toHaveBeenCalled()
  })
})

describe('GAP 1: discount kind type/template integrity', () => {
  it('create-percent then toggle-fixed then submit: the PATCH bag carries discountKind "fixed" for the backend re-link', async () => {
    // The picker's single Discount card creates DISCOUNT_PERCENT (the default kind).
    createFlagshipRmv.mockResolvedValue({ id: 'rmv-d1', type: 'DISCOUNT_PERCENT', status: 'DRAFT' })
    updateRmvVoucher.mockResolvedValue({ id: 'rmv-d1', type: 'DISCOUNT_PERCENT', status: 'DRAFT' })
    submitRmvVoucher.mockResolvedValue({ id: 'rmv-d1', type: 'DISCOUNT_FIXED', status: 'PENDING_APPROVAL' })
    listRmvVouchers.mockResolvedValueOnce([]).mockResolvedValue([createdRow('rmv-d1', 'DISCOUNT_PERCENT')])
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /^Discount/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => expect(createFlagshipRmv).toHaveBeenCalledWith('DISCOUNT_PERCENT'))
    await screen.findByText('What kind of discount?')

    // Toggle to the FIXED kind and set an amount.
    fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
    fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })

    submitFlagship(/Save voucher 1 of 2/i)
    await waitFor(() => expect(submitRmvVoucher).toHaveBeenCalledWith('rmv-d1'))

    // The PATCH (save) body's nested bag carries the chosen kind: this is the exact
    // key submitRmvVoucherCore reads (Voucher.merchantFields.merchantFields.discountKind)
    // to re-link type + rmvTemplateId to the DISCOUNT_FIXED sibling template
    // (backend covered by tests/api/merchant/voucher-bridge.test.ts).
    const patchBody = updateRmvVoucher.mock.calls[0][1] as { merchantFields?: { discountKind?: string; builderType?: string } }
    expect(patchBody.merchantFields?.builderType).toBe('discount')
    expect(patchBody.merchantFields?.discountKind).toBe('fixed')
    // And the PATCH lands BEFORE submit, so the re-link sees the stored kind.
    expect(updateRmvVoucher.mock.invocationCallOrder[0]).toBeLessThan(submitRmvVoucher.mock.invocationCallOrder[0])
  })

  it('resumed FIXED-kind draft: renders the saved kind and a re-save retains discountKind "fixed" (vice versa direction)', async () => {
    // A saved draft whose bag carries the FIXED kind (created percent, toggled fixed).
    const row = draftRow('rmv-d2', 'DISCOUNT_PERCENT', 'discount', { title: 'Template default title', description: 'Template default body', estimatedSaving: 5 }, () => {
      fireEvent.click(screen.getByRole('radio', { name: 'A fixed amount off' }))
      fireEvent.change(screen.getByLabelText('Amount off') as HTMLInputElement, { target: { value: '10' } })
    })
    listRmvVouchers.mockResolvedValue([row])
    renderPage()
    // The resumed draft renders the saved FIXED branch, not the percent default.
    expect(await screen.findByLabelText('Amount off')).toBeInTheDocument()
    expect((screen.getByLabelText('Amount off') as HTMLInputElement).value).toBe('10')

    submitFlagship(/Save voucher 1 of 2/i)
    await waitFor(() => expect(submitRmvVoucher).toHaveBeenCalledWith('rmv-d2'))
    const patchBody = updateRmvVoucher.mock.calls[0][1] as { merchantFields?: { discountKind?: string } }
    expect(patchBody.merchantFields?.discountKind).toBe('fixed')
  })
})

describe('VOUCHER_TYPE_NOT_ELIGIBLE + FLAGSHIP_RMV_LIMIT_REACHED handling', () => {
  it('surfaces a clear message when create-flagship rejects an ineligible type', async () => {
    createFlagshipRmv.mockRejectedValueOnce(new ApiError(400, { error: { code: 'VOUCHER_TYPE_NOT_ELIGIBLE' } }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Buy one, get one free/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/not available as a flagship/i)
  })

  it('surfaces the cap message (and returns to the hub) when the 3rd would exceed the cap', async () => {
    createFlagshipRmv.mockRejectedValueOnce(new ApiError(409, { error: { code: 'FLAGSHIP_RMV_LIMIT_REACHED' } }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Buy one, get one free/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already have your two flagship vouchers/i)
  })
})

describe('2-voucher flow', () => {
  it('after submitting voucher 1, advances to "voucher 2 of 2" (does NOT leave to the hub yet)', async () => {
    // initial [] -> post-create refetch [DRAFT + template] -> post-submit refetch [PENDING].
    const row = createdRow('rmv-1', 'BOGO')
    listRmvVouchers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row])
      .mockResolvedValue([{ ...row, status: 'PENDING_APPROVAL' }])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Buy one, get one free/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await screen.findByText('What does the customer buy?')

    submitFlagship(/Save voucher 1 of 2/i)
    await waitFor(() => expect(submitRmvVoucher).toHaveBeenCalledWith('rmv-1'))

    // Now back on the picker for voucher 2 of 2 (prototype step chip: Step 1 = pick).
    expect(await screen.findByText('Voucher 2 of 2 · Step 1 of 2')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('after submitting voucher 2, returns to the hub', async () => {
    const pending1 = { id: 'rmv-1', type: 'BOGO', status: 'PENDING_APPROVAL' }
    createFlagshipRmv.mockResolvedValue({ id: 'rmv-2', type: 'FREEBIE', status: 'DRAFT' })
    submitRmvVoucher.mockResolvedValue({ id: 'rmv-2', type: 'FREEBIE', status: 'PENDING_APPROVAL' })
    listRmvVouchers
      .mockResolvedValueOnce([pending1])
      .mockResolvedValue([pending1, createdRow('rmv-2', 'FREEBIE')])
    renderPage()
    // Already one flagship submitted -> picker shows the "Voucher 2 of 2" step chip.
    expect(await screen.findByText('Voucher 2 of 2 · Step 1 of 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Freebie/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await screen.findByText('What does the customer get free?')

    submitFlagship(/Save voucher 2 of 2/i)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })
})

describe('DRAFT resume + cap consistency (review-mandated fix)', () => {
  // TEMPLATE DEFAULTS the backend leaves on the top-level columns. The resume must show
  // the MERCHANT's edits, NOT these. If the resume ever reads row.title (= the template
  // default) and passes row.merchantFields as the seed bag, the edits are lost and these
  // tests fail.
  const BOGO_TEMPLATE = { title: 'Buy one, get one free', description: 'Template body copy', estimatedSaving: 5 }
  const FREEBIE_TEMPLATE = { title: 'Free item', description: 'Template body copy', estimatedSaving: 5 }

  it('save-as-draft then return: mounts the BUILDER resuming the DRAFT with the merchant edits, does NOT create a new one', async () => {
    // A single DRAFT, stored EXACTLY as a real save then backend-merge produces it: the
    // merchant filled the buy item + free price; the top-level columns keep the defaults.
    const row = draftRow('rmv-draft-1', 'BOGO', 'bogo', BOGO_TEMPLATE, () => {
      fireEvent.change(screen.getByLabelText('Item') as HTMLInputElement, { target: { value: 'a main' } })
      fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '12' } })
    })
    listRmvVouchers.mockResolvedValue([row])
    renderPage()
    // The guided builder mounts directly (resuming the DRAFT) - NOT the picker.
    expect(await screen.findByText('What does the customer buy?')).toBeInTheDocument()
    // The MERCHANT's saved buy item rehydrated (NOT the template default, NOT undefined).
    expect((screen.getByLabelText('Item') as HTMLInputElement).value).toBe('a main')
    expect((screen.getByLabelText('Value of the free item') as HTMLInputElement).value).toBe('12')
    // No create-flagship call: we RESUMED, not created.
    expect(createFlagshipRmv).not.toHaveBeenCalled()
    // Resuming voucher 1 of 2 (0 submitted): the builder step chip reads the index
    // (prototype stepLabel; the builder is Step 2 of 2).
    expect(screen.getByText('Voucher 1 of 2 · Step 2 of 2')).toBeInTheDocument()
  })

  it('resumes a DRAFT with an edited title/description + selected clause + custom term + askHelp (full round-trip)', async () => {
    const row = draftRow('rmv-draft-1', 'DISCOUNT_PERCENT', 'discount', { title: 'Template default title', description: 'Template default body', estimatedSaving: 5 }, () => {
      fireEvent.change(screen.getByLabelText(/Percent off/i) as HTMLInputElement, { target: { value: '25' } })
      fireEvent.change(screen.getByLabelText(/Typical order/i) as HTMLInputElement, { target: { value: '40' } })
      fireEvent.change(screen.getByLabelText('Title') as HTMLInputElement, { target: { value: 'My own headline' } })
      fireEvent.change(screen.getByLabelText('Description') as HTMLInputElement, { target: { value: 'My own body copy' } })
      const terms = screen.getByTestId('terms-section')
      fireEvent.click(within(terms).getByRole('checkbox', { name: 'Not valid with any other voucher' }))
      fireEvent.change(screen.getByLabelText('Add your own term') as HTMLInputElement, { target: { value: 'Eat in only please' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add term' }))
      fireEvent.click(screen.getByRole('switch', { name: /Ask the Redeemo team to help/i }))
    })
    listRmvVouchers.mockResolvedValue([row])
    renderPage()
    await screen.findByText('What kind of discount?')
    // Edited title/description rehydrate from the STORED bag, not the template defaults.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('My own headline')
    expect(screen.getByTestId('builder-preview-description')).toHaveTextContent('My own body copy')
    // The selected clause stays selected + the custom term rehydrates.
    const termsSection = screen.getByTestId('terms-section')
    expect((within(termsSection).getByRole('checkbox', { name: 'Not valid with any other voucher' }) as HTMLInputElement).checked).toBe(true)
    expect(within(termsSection).getByText('Eat in only please')).toBeInTheDocument()
    // The concierge toggle stays on.
    expect(screen.getByRole('switch', { name: /Ask the Redeemo team to help/i }).getAttribute('aria-checked')).toBe('true')
    expect(createFlagshipRmv).not.toHaveBeenCalled()
  })

  it('save-as-draft DRAFT: resuming + submitting it advances to voucher 2 of 2', async () => {
    const row = draftRow('rmv-draft-1', 'BOGO', 'bogo', BOGO_TEMPLATE)
    // Realistic backend transition: before submit the list has the DRAFT; after submit
    // the same row is PENDING_APPROVAL (so the refetch no longer sees it as a draft).
    listRmvVouchers.mockResolvedValueOnce([row]).mockResolvedValue([{ ...row, status: 'PENDING_APPROVAL' }])
    renderPage()
    await screen.findByText('What does the customer buy?')
    // Submit the resumed DRAFT -> updates THIS draft id then submits it. An empty BOGO is
    // Too weak, so the soft warning interposes; submitFlagship clears it.
    submitFlagship(/Save voucher 1 of 2/i)
    await waitFor(() => expect(submitRmvVoucher).toHaveBeenCalledWith('rmv-draft-1'))
    expect(createFlagshipRmv).not.toHaveBeenCalled()
    // Advances to voucher 2 of 2 (still does not leave to the hub): picker for #2
    // (prototype step chip: the type pick is Step 1 of 2).
    expect(await screen.findByText('Voucher 2 of 2 · Step 1 of 2')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('two DRAFTs already exist (prior buggy state): resumes a draft, never creates', async () => {
    listRmvVouchers.mockResolvedValue([
      draftRow('rmv-draft-1', 'BOGO', 'bogo', BOGO_TEMPLATE),
      draftRow('rmv-draft-2', 'FREEBIE', 'freebie', FREEBIE_TEMPLATE),
    ])
    renderPage()
    // Resumes a DRAFT in the builder, never the picker, never create-flagship.
    expect(await screen.findByText('What does the customer buy?')).toBeInTheDocument()
    expect(createFlagshipRmv).not.toHaveBeenCalled()
    // The type picker is NOT shown.
    expect(screen.queryByText(/Choose your flagship voucher/i)).not.toBeInTheDocument()
  })

  it('1 submitted + 1 DRAFT: index reads "2 of 2" and resumes the DRAFT', async () => {
    listRmvVouchers.mockResolvedValue([
      { id: 'rmv-1', type: 'BOGO', status: 'PENDING_APPROVAL' },
      draftRow('rmv-draft-2', 'FREEBIE', 'freebie', FREEBIE_TEMPLATE),
    ])
    renderPage()
    // 1 submitted -> "2 of 2"; resumes the DRAFT (no create).
    expect(await screen.findByText('What does the customer get free?')).toBeInTheDocument()
    // Builder step chip (prototype stepLabel): the builder is Step 2 of 2.
    expect(screen.getByText('Voucher 2 of 2 · Step 2 of 2')).toBeInTheDocument()
    expect(createFlagshipRmv).not.toHaveBeenCalled()
  })

  it('fresh start (no RMVs): the picker shows and picking creates a flagship', async () => {
    listRmvVouchers.mockResolvedValue([])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Buy one, get one free/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => expect(createFlagshipRmv).toHaveBeenCalledWith('BOGO'))
  })
})
