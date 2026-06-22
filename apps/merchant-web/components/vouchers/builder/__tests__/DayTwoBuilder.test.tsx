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

  it('Submit for review creates the draft then submits it', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /a straight saving off the price/i }))
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('new1'))
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

describe('DayTwoBuilder TIME_LIMITED + REUSABLE handling', () => {
  it('TIME_LIMITED requires an availability window and sends availabilityWindows on save', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    // Add a window via the window editor.
    fireEvent.click(screen.getByRole('button', { name: /add a time window/i }))
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
