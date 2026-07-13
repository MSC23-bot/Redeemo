import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DayTwoBuilder } from '@/components/vouchers/builder/DayTwoBuilder'
import { composeTitle } from '@/lib/voucher/compose'

// Day-2 Vouchers B2: the decoupled builder. All 8 voucher types are selectable
// (incl TIME_LIMITED + REUSABLE, unlike the onboarding flagship picker where the
// last two are disabled). The structured 5 types drive the live score + composed
// title/description from lib/voucher/*; the save path calls the B1 client.
//
// The builder carries NO onboarding state (no 2-RMV gate / voucherIndex / flagship
// template) and imports NOTHING from components/onboarding/**.

const createVoucher = jest.fn()
const updateVoucher = jest.fn()
const submitVoucher = jest.fn()
jest.mock('@/lib/api/voucher', () => {
  const actual = jest.requireActual('@/lib/api/voucher')
  return {
    ...actual,
    createVoucher: (...a: unknown[]) => createVoucher(...a),
    updateVoucher: (...a: unknown[]) => updateVoucher(...a),
    submitVoucher: (...a: unknown[]) => submitVoucher(...a),
  }
})

function renderBuilder(props: Partial<React.ComponentProps<typeof DayTwoBuilder>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onDone = props.onDone ?? jest.fn()
  const utils = render(
    <QueryClientProvider client={qc}>
      <DayTwoBuilder categoryName="Food & Drink" onDone={onDone} onCancel={jest.fn()} {...props} />
    </QueryClientProvider>,
  )
  return { ...utils, onDone }
}

beforeEach(() => {
  createVoucher.mockReset().mockResolvedValue({ id: 'new1', status: 'DRAFT', approvalStatus: 'PENDING' })
  updateVoucher.mockReset().mockResolvedValue({ id: 'new1', status: 'DRAFT', approvalStatus: 'PENDING' })
  submitVoucher.mockReset().mockResolvedValue({ id: 'new1', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' })
})

describe('DayTwoBuilder type picker', () => {
  it('renders all 8 voucher types as selectable (incl Time limited + Reusable)', () => {
    renderBuilder()
    const picker = screen.getByTestId('builder-type-picker')
    // The five structured types plus the two extra-handled types.
    expect(within(picker).getByRole('button', { name: /buy one, get one free/i })).toBeEnabled()
    expect(within(picker).getByRole('button', { name: /spend & save/i })).toBeEnabled()
    expect(within(picker).getByRole('button', { name: /discount/i })).toBeEnabled()
    expect(within(picker).getByRole('button', { name: /freebie/i })).toBeEnabled()
    expect(within(picker).getByRole('button', { name: /package deal/i })).toBeEnabled()
    expect(within(picker).getByRole('button', { name: /time limited/i })).toBeEnabled()
    expect(within(picker).getByRole('button', { name: /reusable/i })).toBeEnabled()
    // 7 picker cards => 8 types (discount is one card -> fixed/percent chosen in fields).
    expect(within(picker).getAllByRole('button')).toHaveLength(7)
  })
})

describe('DayTwoBuilder live compose + score (structured types)', () => {
  it('composes the title from lib/voucher logic as fields change', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /spend & save/i }))
    // Spend & save default compose: "Spend £30, Save £8".
    const expected = composeTitle({ type: 'spend', spendAmount: 30, spendSave: 8 })
    expect(await screen.findByTestId('builder-preview-title')).toHaveTextContent(expected)
  })

  it('shows the advisory score meter for a structured type', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /buy one, get one free/i }))
    expect(await screen.findByTestId('builder-score')).toBeInTheDocument()
  })
})

describe('DayTwoBuilder save path (create draft + optional submit)', () => {
  it('Save draft calls createVoucher and never sends status/approvalStatus', async () => {
    const { onDone } = renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    expect(payload.type).toBe('FREEBIE')
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('approvalStatus')
    expect(payload).not.toHaveProperty('isRmv')
    expect(payload).not.toHaveProperty('merchantId')
    expect(payload.merchantFields.builderType).toBe('freebie')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('Submit for review opens the NORMAL confirm modal for a non-weak voucher, then creates + submits on confirm', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /a straight saving off the price/i }))
    // Make the voucher non-weak: 20% of a £30 typical order = £6 saving, 20% share.
    fireEvent.click(screen.getByRole('button', { name: '20%' }))
    fireEvent.click(screen.getByRole('button', { name: '£30' }))
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    // Prototype-faithful confirm modal (A10): normal copy, no weak warning.
    expect(await screen.findByText('Confirm this is your voucher')).toBeInTheDocument()
    expect(screen.queryByText('This offer may feel too weak')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /yes, this is my voucher/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('new1'))
  })

  it('B-5: Discount toggled to "fixed" saves type DISCOUNT_FIXED (the default percent path is also covered)', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /a straight saving off the price/i }))
    // The discount fields default to "A percentage"; toggle to the fixed-amount kind
    // (the kind is a segmented radio control, not a plain button).
    fireEvent.click(await screen.findByRole('radio', { name: /a fixed amount/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    expect(createVoucher.mock.calls[0][0].type).toBe('DISCOUNT_FIXED')
  })

  it('updates an existing draft instead of creating when editing', async () => {
    renderBuilder({
      voucherId: 'v9',
      initialType: 'BOGO',
      initialFields: { builderType: 'bogo', bogoBuy: 'A main', bogoFree: 'A second item', bogoFreePrice: 12 },
    })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    expect(updateVoucher.mock.calls[0][0]).toBe('v9')
    expect(createVoucher).not.toHaveBeenCalled()
  })
})

// CC-1 weak-submit warning (owner ruling 2026-07-13): the score stays NON-GATING
// (Submit is always enabled), but submitting a Too weak voucher surfaces a soft
// warning variant of the confirm dialog first. A fresh Discount with no values has
// a £0 saving (below the £5 floor) so its verdict is Too weak deterministically.
describe('DayTwoBuilder weak-submit warning (CC-1, owner ruling 2026-07-13)', () => {
  function openWeakDiscount() {
    renderBuilder()
    // Default discount: no percent / typical order => saving £0 => Too weak.
    fireEvent.click(screen.getByRole('button', { name: /a straight saving off the price/i }))
    expect(screen.getByTestId('builder-score').querySelector('[data-cal]')).toHaveAttribute('data-cal', 'weak')
  }

  it('Submit stays ENABLED for a Too weak voucher, and clicking it shows the warning copy BEFORE any API call', async () => {
    openWeakDiscount()
    const submit = screen.getByRole('button', { name: /submit for review/i })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    // Owner-approved copy, verbatim.
    expect(await screen.findByText('This offer may feel too weak')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Redeemo thinks this voucher may not be strong enough to stand out to members. You can still submit it for review, but improving the saving or relaxing the terms may help it perform better.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit anyway' })).toBeInTheDocument()
    // The weak variant REPLACES the normal confirm (never two dialogs in sequence).
    expect(screen.queryByText('Confirm this is your voucher')).not.toBeInTheDocument()
    // No API call happened before confirmation.
    expect(createVoucher).not.toHaveBeenCalled()
    expect(updateVoucher).not.toHaveBeenCalled()
    expect(submitVoucher).not.toHaveBeenCalled()
  })

  it('Keep editing closes the warning and calls NOTHING', async () => {
    openWeakDiscount()
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }))
    await waitFor(() => expect(screen.queryByText('This offer may feel too weak')).not.toBeInTheDocument())
    expect(createVoucher).not.toHaveBeenCalled()
    expect(updateVoucher).not.toHaveBeenCalled()
    expect(submitVoucher).not.toHaveBeenCalled()
  })

  it('Submit anyway proceeds through the existing submit flow (create then submit)', async () => {
    openWeakDiscount()
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit anyway' }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('new1'))
  })
})

describe('DayTwoBuilder TIME_LIMITED + REUSABLE handling', () => {
  it('TIME_LIMITED wraps a base mechanic (Step 1), then a window is added and sent on save', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    // Wrapper model: pick a base mechanic first (Step 1), then Step 2 schedule shows.
    fireEvent.click(within(screen.getByTestId('base-mechanic-picker')).getByRole('button', { name: /discount/i }))
    fireEvent.click(screen.getByRole('button', { name: /add another window/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    expect(payload.type).toBe('TIME_LIMITED')
    expect(Array.isArray(payload.availabilityWindows)).toBe(true)
    expect(payload.availabilityWindows.length).toBeGreaterThan(0)
  })

  it('REUSABLE sends a cooldownSeconds >= 1800', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /reusable/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    expect(payload.type).toBe('REUSABLE')
    expect(payload.cooldownSeconds).toBeGreaterThanOrEqual(1800)
  })
})
