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
    renderPage()
    // The picker shows once taxonomy + profile load.
    const bogo = await screen.findByRole('button', { name: /Buy one, get one free/i })
    fireEvent.click(bogo)
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

    await waitFor(() => expect(createFlagshipRmv).toHaveBeenCalledWith('BOGO'))
    // The guided builder mounts.
    expect(await screen.findByText('What does the customer buy?')).toBeInTheDocument()
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
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Buy one, get one free/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await screen.findByText('What does the customer buy?')

    fireEvent.click(screen.getByRole('button', { name: /Save voucher 1 of 2/i }))
    await waitFor(() => expect(submitRmvVoucher).toHaveBeenCalledWith('rmv-1'))

    // Now back on the picker for voucher 2 of 2.
    expect(await screen.findByText(/2 of 2/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('after submitting voucher 2, returns to the hub', async () => {
    listRmvVouchers.mockResolvedValue([{ id: 'rmv-1', type: 'BOGO', status: 'PENDING_APPROVAL' }])
    submitRmvVoucher.mockResolvedValue({ id: 'rmv-2', type: 'FREEBIE', status: 'PENDING_APPROVAL' })
    renderPage()
    // Already one flagship submitted -> picker shows "voucher 2 of 2".
    expect(await screen.findByText(/2 of 2/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Freebie/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await screen.findByText('What does the customer get free?')

    fireEvent.click(screen.getByRole('button', { name: /Save voucher 2 of 2/i }))
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
    // Resuming voucher 1 of 2 (0 submitted) - the builder eyebrow reads the index.
    expect(screen.getByText(/Flagship voucher 1 of 2/i)).toBeInTheDocument()
  })

  it('resumes a DRAFT with an edited title/description + selected clause + custom term + askHelp (full round-trip)', async () => {
    const row = draftRow('rmv-draft-1', 'DISCOUNT_PERCENT', 'discount', { title: 'Template default title', description: 'Template default body', estimatedSaving: 5 }, () => {
      fireEvent.change(screen.getByLabelText(/What percentage off/i) as HTMLInputElement, { target: { value: '25' } })
      fireEvent.change(screen.getByLabelText(/typical order value/i) as HTMLInputElement, { target: { value: '40' } })
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
    expect(screen.getByTestId('preview-desc')).toHaveTextContent('My own body copy')
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
    // Submit the resumed DRAFT -> updates THIS draft id then submits it.
    fireEvent.click(screen.getByRole('button', { name: /Save voucher 1 of 2/i }))
    await waitFor(() => expect(submitRmvVoucher).toHaveBeenCalledWith('rmv-draft-1'))
    expect(createFlagshipRmv).not.toHaveBeenCalled()
    // Advances to voucher 2 of 2 (still does not leave to the hub): picker for #2.
    expect(await screen.findByText(/2 of 2/i)).toBeInTheDocument()
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
    expect(screen.getByText(/Flagship voucher 2 of 2/i)).toBeInTheDocument()
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
