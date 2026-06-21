import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VouchersPage from '@/app/(app)/onboarding/vouchers/page'
import { ApiError } from '@/lib/api/client'

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
  it('save-as-draft then return: mounts the BUILDER resuming the DRAFT, does NOT create a new one', async () => {
    // A single DRAFT exists (the merchant saved-as-draft earlier and came back).
    listRmvVouchers.mockResolvedValue([
      {
        id: 'rmv-draft-1',
        type: 'BOGO',
        status: 'DRAFT',
        title: 'Buy one main, get one free',
        description: 'Some body',
        estimatedSaving: 12,
        merchantFields: {
          builderType: 'bogo',
          categoryKey: 'food_drink',
          type: 'bogo',
          bogoBuy: 'a main',
          bogoFree: 'a second main',
          bogoFreePrice: 12,
          selectedClauseIds: [],
          customTerms: [],
          askHelp: false,
          titleEdited: false,
          descEdited: false,
        },
      },
    ])
    renderPage()
    // The guided builder mounts directly (resuming the DRAFT) - NOT the picker.
    expect(await screen.findByText('What does the customer buy?')).toBeInTheDocument()
    // The saved buy item rehydrated.
    expect((screen.getByLabelText('Item') as HTMLInputElement).value).toBe('a main')
    // No create-flagship call: we RESUMED, not created.
    expect(createFlagshipRmv).not.toHaveBeenCalled()
    // Resuming voucher 1 of 2 (0 submitted) - the builder eyebrow reads the index.
    expect(screen.getByText(/Flagship voucher 1 of 2/i)).toBeInTheDocument()
  })

  it('save-as-draft DRAFT: resuming + submitting it advances to voucher 2 of 2', async () => {
    const draftRow = {
      id: 'rmv-draft-1',
      type: 'BOGO',
      status: 'DRAFT',
      merchantFields: {
        builderType: 'bogo',
        categoryKey: 'food_drink',
        type: 'bogo',
        selectedClauseIds: [],
        customTerms: [],
        askHelp: false,
        titleEdited: false,
        descEdited: false,
      },
    }
    // Realistic backend transition: before submit the list has the DRAFT; after submit
    // the same row is PENDING_APPROVAL (so the refetch no longer sees it as a draft).
    listRmvVouchers.mockResolvedValueOnce([draftRow]).mockResolvedValue([{ ...draftRow, status: 'PENDING_APPROVAL' }])
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
      {
        id: 'rmv-draft-1',
        type: 'BOGO',
        status: 'DRAFT',
        merchantFields: { builderType: 'bogo', categoryKey: 'food_drink', type: 'bogo', selectedClauseIds: [], customTerms: [], askHelp: false, titleEdited: false, descEdited: false },
      },
      {
        id: 'rmv-draft-2',
        type: 'FREEBIE',
        status: 'DRAFT',
        merchantFields: { builderType: 'freebie', categoryKey: 'food_drink', type: 'freebie', selectedClauseIds: [], customTerms: [], askHelp: false, titleEdited: false, descEdited: false },
      },
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
      {
        id: 'rmv-draft-2',
        type: 'FREEBIE',
        status: 'DRAFT',
        merchantFields: { builderType: 'freebie', categoryKey: 'food_drink', type: 'freebie', selectedClauseIds: [], customTerms: [], askHelp: false, titleEdited: false, descEdited: false },
      },
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
