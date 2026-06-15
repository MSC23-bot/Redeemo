/**
 * EditCategoryDialog (B2.3-web) - eligible picker (ineligible disabled), review
 * gating (different category + reason), two-stage confirm (first-set applies
 * immediately; a change previews then confirms), error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditCategoryDialog } from '../EditCategoryDialog'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useEditMerchantCategory: jest.fn(() => mockMutation),
}))

const CATEGORIES = [
  { id: 'c-food', name: 'Food', parentId: null, eligible: true },
  { id: 'c-drinks', name: 'Drinks', parentId: null, eligible: true },
  { id: 'c-empty', name: 'Empty', parentId: null, eligible: false },
]

jest.mock('@/lib/merchants/useAdminCategories', () => ({
  useAdminCategories: jest.fn(() => ({ categories: CATEGORIES, isLoading: false, isError: false })),
}))

function renderDialog(
  opts: { currentCategoryId?: string | null; onSuccess?: () => void; onCancel?: () => void } = {}
) {
  return render(
    <EditCategoryDialog
      merchantId="m-1"
      currentCategoryId={'currentCategoryId' in opts ? (opts.currentCategoryId as string | null) : 'c-drinks'}
      onSuccess={opts.onSuccess ?? jest.fn()}
      onCancel={opts.onCancel ?? jest.fn()}
    />
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('EditCategoryDialog structure + picker', () => {
  it('renders role=dialog with the on-behalf audit copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /change category/i })).toBeInTheDocument()
    expect(screen.getByTestId('edit-category-dialog')).toHaveTextContent(/audit log/i)
    expect(screen.getByTestId('edit-category-dialog')).toHaveTextContent(/on the merchant's behalf/i)
  })

  it('disables an ineligible category option', () => {
    renderDialog()
    const empty = screen.getByRole('option', { name: /Empty/ }) as HTMLOptionElement
    expect(empty.disabled).toBe(true)
    const food = screen.getByRole('option', { name: 'Food' }) as HTMLOptionElement
    expect(food.disabled).toBe(false)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = jest.fn()
    renderDialog({ onCancel })
    fireEvent.click(screen.getByTestId('edit-category-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('EditCategoryDialog review gating', () => {
  it('Review disabled when reason empty', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('edit-category-select'), { target: { value: 'c-food' } })
    expect(screen.getByTestId('edit-category-review')).toBeDisabled()
  })

  it('Review disabled when category is the same as current', () => {
    renderDialog({ currentCategoryId: 'c-drinks' })
    // select stays on c-drinks (current)
    fireEvent.change(screen.getByTestId('edit-category-reason'), { target: { value: 'reason' } })
    expect(screen.getByTestId('edit-category-review')).toBeDisabled()
  })

  it('Review enabled when a different category is picked AND reason is non-empty', () => {
    renderDialog({ currentCategoryId: 'c-drinks' })
    fireEvent.change(screen.getByTestId('edit-category-select'), { target: { value: 'c-food' } })
    fireEvent.change(screen.getByTestId('edit-category-reason'), { target: { value: 'wrong category' } })
    expect(screen.getByTestId('edit-category-review')).not.toBeDisabled()
  })
})

describe('EditCategoryDialog first-set (no existing category)', () => {
  it('applies immediately on a provisioned result (no confirm stage)', async () => {
    mockMutateAsync.mockResolvedValueOnce({ provisioned: true })
    const onSuccess = jest.fn()
    renderDialog({ currentCategoryId: null, onSuccess })

    fireEvent.change(screen.getByTestId('edit-category-select'), { target: { value: 'c-food' } })
    fireEvent.change(screen.getByTestId('edit-category-reason'), { target: { value: 'onboarding set' } })
    fireEvent.click(screen.getByTestId('edit-category-review'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith({ primaryCategoryId: 'c-food', reason: 'onboarding set' })
    expect(screen.queryByTestId('edit-category-confirm-message')).not.toBeInTheDocument()
  })
})

describe('EditCategoryDialog change (two-stage)', () => {
  it('previews on requiresConfirmation then confirms with confirm:true', async () => {
    mockMutateAsync
      .mockResolvedValueOnce({ requiresConfirmation: true, message: 'Changing category discards 1 draft voucher.' })
      .mockResolvedValueOnce({ changed: true })
    const onSuccess = jest.fn()
    renderDialog({ currentCategoryId: 'c-drinks', onSuccess })

    fireEvent.change(screen.getByTestId('edit-category-select'), { target: { value: 'c-food' } })
    fireEvent.change(screen.getByTestId('edit-category-reason'), { target: { value: '  wrong category  ' } })
    fireEvent.click(screen.getByTestId('edit-category-review'))

    // Stage 2: the consequence message is shown; onSuccess NOT yet called.
    await waitFor(() => expect(screen.getByTestId('edit-category-confirm-message')).toBeInTheDocument())
    expect(screen.getByTestId('edit-category-confirm-message')).toHaveTextContent('discards 1 draft voucher')
    expect(onSuccess).not.toHaveBeenCalled()
    // First call omitted confirm.
    expect(mockMutateAsync).toHaveBeenNthCalledWith(1, { primaryCategoryId: 'c-food', reason: 'wrong category' })

    fireEvent.click(screen.getByTestId('edit-category-confirm'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    // Second call sends confirm:true.
    expect(mockMutateAsync).toHaveBeenNthCalledWith(2, { primaryCategoryId: 'c-food', reason: 'wrong category', confirm: true })
  })

  it('Back returns to the pick stage', async () => {
    mockMutateAsync.mockResolvedValueOnce({ requiresConfirmation: true, message: 'discard drafts' })
    renderDialog({ currentCategoryId: 'c-drinks' })
    fireEvent.change(screen.getByTestId('edit-category-select'), { target: { value: 'c-food' } })
    fireEvent.change(screen.getByTestId('edit-category-reason'), { target: { value: 'reason' } })
    fireEvent.click(screen.getByTestId('edit-category-review'))
    await waitFor(() => expect(screen.getByTestId('edit-category-confirm-message')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('edit-category-back'))
    expect(screen.getByTestId('edit-category-select')).toBeInTheDocument()
    expect(screen.queryByTestId('edit-category-confirm-message')).not.toBeInTheDocument()
  })
})

describe('EditCategoryDialog error banner', () => {
  it('renders NamedGateBanner when mutation.error is set (e.g. CATEGORY_CHANGE_BLOCKED)', () => {
    const err = Object.assign(new Error('Blocked'), { code: 'CATEGORY_CHANGE_BLOCKED' })
    const { useEditMerchantCategory } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useEditMerchantCategory: jest.MockedFunction<() => typeof mockMutation>
    }
    useEditMerchantCategory.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
