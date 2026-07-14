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
// warning variant of the confirm dialog first. S5 (owner 2026-07-13): the weak-warning
// modal is reached only by a COMPLETE offer; an INCOMPLETE one is blocked before it.
// So the fixture is a COMPLETE-but-weak percentage discount: 5% off a £20 typical order
// is a £1 saving (below the £5 floor) => Too weak, while every S5-required field is set.
describe('DayTwoBuilder weak-submit warning (CC-1, owner ruling 2026-07-13)', () => {
  function openWeakDiscount() {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /a straight saving off the price/i }))
    // Complete the percent discount so it clears the S5 submit gate but stays weak.
    fireEvent.change(screen.getByLabelText('Percent off') as HTMLInputElement, { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Typical order') as HTMLInputElement, { target: { value: '20' } })
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

// S5 submission-validity gate (owner requirement 2026-07-13): Save as draft is never
// blocked; Submit for review fails closed until the offer is complete, marking the
// offending fields inline + focusing the first problem, and never reaching the modal or
// the API. Weak-but-complete still routes through the weak modal (covered above). The
// shared matrix is unit-tested in lib/voucher/__tests__/submitValidity.test.ts.
describe('DayTwoBuilder S5 submit-validity gate (owner 2026-07-13)', () => {
  function openBogo() {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /buy one, get one free/i }))
  }

  it('blocks an incomplete BOGO submit: marks fields, focuses the first problem, no modal, no API', () => {
    openBogo()
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    // Summary + inline marks.
    expect(screen.getByText(/Before you submit/i)).toBeInTheDocument()
    const buy = screen.getByPlaceholderText('e.g. A main course')
    expect(buy).toHaveAttribute('aria-invalid', 'true')
    // The FIRST problem (top-down) receives focus.
    expect(buy).toHaveFocus()
    // Never reaches the confirm modal or the API.
    expect(screen.queryByTestId('submit-confirm-modal')).not.toBeInTheDocument()
    expect(createVoucher).not.toHaveBeenCalled()
    expect(submitVoucher).not.toHaveBeenCalled()
  })

  it('live-clears a field mark the moment it is corrected (no phantom errors before Submit)', () => {
    openBogo()
    // No marks before the first Submit attempt (resumed/legacy drafts must not flash errors).
    const buy = screen.getByPlaceholderText('e.g. A main course')
    expect(buy).not.toHaveAttribute('aria-invalid')
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    expect(buy).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(buy, { target: { value: 'A main course' } })
    expect(buy).not.toHaveAttribute('aria-invalid')
  })

  it('a complete BOGO opens the NORMAL confirm (not the weak variant) and submits', async () => {
    openBogo()
    fireEvent.change(screen.getByPlaceholderText('e.g. A main course'), { target: { value: 'A main course' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. A second of equal or lower value'), { target: { value: 'A second main' } })
    fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    expect(await screen.findByText('Confirm this is your voucher')).toBeInTheDocument()
    expect(screen.queryByText('This offer may feel too weak')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, this is my voucher' }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('new1'))
  })

  it('maps a backend VOUCHER_INCOMPLETE response onto the same inline marks + summary', async () => {
    // A voucher the client considers complete, but the backend rejects as incomplete
    // (belt-and-braces for direct-API drift): the fields[] render as the same marks.
    submitVoucher.mockRejectedValueOnce({
      code: 'VOUCHER_INCOMPLETE',
      body: { error: { fields: [{ field: 'bogoFreePrice', code: 'REQUIRED', message: 'A backend completeness message.' }] } },
    })
    openBogo()
    fireEvent.change(screen.getByPlaceholderText('e.g. A main course'), { target: { value: 'A main course' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. A second of equal or lower value'), { target: { value: 'A second main' } })
    fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, this is my voucher' }))
    // The backend rejection surfaces as an inline mark + summary line (message appears twice).
    expect((await screen.findAllByText('A backend completeness message.')).length).toBeGreaterThan(0)
    const price = screen.getByLabelText('Value of the free item') as HTMLInputElement
    expect(price).toHaveAttribute('aria-invalid', 'true')
  })

  // Fill a client-complete BOGO, submit, and let the backend reject it with the given
  // VOUCHER_INCOMPLETE fields[] (drift simulation for the lifecycle tests).
  async function submitCompleteBogoRejectedWith(fields: Array<{ field: string; code: string; message: string }>) {
    submitVoucher.mockRejectedValueOnce({ code: 'VOUCHER_INCOMPLETE', body: { error: { fields } } })
    fireEvent.change(screen.getByPlaceholderText('e.g. A main course'), { target: { value: 'A main course' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. A second of equal or lower value'), { target: { value: 'A second main' } })
    fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, this is my voucher' }))
    await waitFor(() => expect(screen.queryByTestId('submit-confirm-modal')).not.toBeInTheDocument())
  }

  // Server-error lifecycle (blocking fix 2026-07-14): editing the flagged field drops the
  // server mark permanently; it never resurfaces from stale state.
  it('edit-after-server-error: correcting the flagged field clears the server mark immediately and it does NOT reappear', async () => {
    openBogo()
    await submitCompleteBogoRejectedWith([
      { field: 'bogoFreePrice', code: 'REQUIRED', message: 'A backend completeness message.' },
    ])
    const price = screen.getByLabelText('Value of the free item') as HTMLInputElement
    expect(price).toHaveAttribute('aria-invalid', 'true')
    // Correct the flagged field: the server mark drops immediately.
    fireEvent.change(price, { target: { value: '9' } })
    expect(price).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('A backend completeness message.')).not.toBeInTheDocument()
    // Unrelated re-renders + ANOTHER field erroring must not resurrect it: blank bogoBuy
    // so the client flags that field; the retired server mark stays gone.
    const buy = screen.getByPlaceholderText('e.g. A main course') as HTMLInputElement
    fireEvent.change(buy, { target: { value: '' } })
    expect(buy).toHaveAttribute('aria-invalid', 'true')
    expect(price).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('A backend completeness message.')).not.toBeInTheDocument()
    // And restoring the other field still does not bring it back.
    fireEvent.change(buy, { target: { value: 'A main course' } })
    expect(screen.queryByText('A backend completeness message.')).not.toBeInTheDocument()
  })

  it('a fresh submit replaces the server-error set wholesale (old fields drop, new ones show)', async () => {
    openBogo()
    await submitCompleteBogoRejectedWith([
      { field: 'bogoFreePrice', code: 'REQUIRED', message: 'A backend completeness message.' },
    ])
    expect(screen.getAllByText('A backend completeness message.').length).toBeGreaterThan(0)
    // Resubmit; the backend now rejects a DIFFERENT field. The first set must be replaced
    // wholesale, not merged.
    submitVoucher.mockRejectedValueOnce({
      code: 'VOUCHER_INCOMPLETE',
      body: { error: { fields: [{ field: 'bogoFree', code: 'REQUIRED', message: 'A different backend message.' }] } },
    })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, this is my voucher' }))
    expect((await screen.findAllByText('A different backend message.')).length).toBeGreaterThan(0)
    expect(screen.queryByText('A backend completeness message.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Value of the free item')).not.toHaveAttribute('aria-invalid')
  })
})

// S5 TIME_LIMITED window rule, three-state known/unknown (regression fix 2026-07-14). The
// voucher DETAIL contract does NOT return availabilityWindows (a relation), so an existing
// TIME_LIMITED edit hydrates windowsLoaded=false and the client gate must NOT invent a
// zero-window block: the save omits the field and the backend preserves + validates the
// real windows. Fresh create + loaded states stay KNOWN and fail-closed. The gate mirrors
// the SAVE path's own signal (state.windowsLoaded); it never gets stricter than the backend.
describe('DayTwoBuilder TIME_LIMITED window rule (three-state, regression fix 2026-07-14)', () => {
  const TL_BOGO_BAG = {
    askHelp: false,
    builderType: 'time',
    baseMechanic: 'bogo',
    draftFields: { type: 'bogo', bogoBuy: 'A main course', bogoFree: 'A second main', bogoFreePrice: 12 },
    selectedClauseIds: ['tell_staff'],
    customTerms: [],
  }
  const ONE_WINDOW = [{ dayOfWeek: 2, openTime: '17:00', closeTime: '21:00' }]

  it('UNKNOWN (existing edit, detail omits availabilityWindows -> initialWindows null): submits, not blocked', async () => {
    renderBuilder({ voucherId: 'v1', initialType: 'TIME_LIMITED', initialFields: TL_BOGO_BAG, initialWindows: null })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    // Reaches the confirm modal (attemptSubmit passed): the window rule was skipped.
    expect(await screen.findByTestId('submit-confirm-modal')).toBeInTheDocument()
    expect(screen.queryByText(/Add at least one time window/i)).not.toBeInTheDocument()
    // Confirming submits: update (edit) then submit; the save OMITS windows (unknown state).
    fireEvent.click(screen.getByRole('button', { name: 'Yes, this is my voucher' }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('new1'))
    expect(updateVoucher.mock.calls[0][1]).not.toHaveProperty('availabilityWindows')
  })

  it('KNOWN-PRESENT (existing edit with loaded non-empty windows): submits', async () => {
    renderBuilder({ voucherId: 'v1', initialType: 'TIME_LIMITED', initialFields: TL_BOGO_BAG, initialWindows: ONE_WINDOW })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    expect(await screen.findByTestId('submit-confirm-modal')).toBeInTheDocument()
    expect(screen.queryByText(/Add at least one time window/i)).not.toBeInTheDocument()
  })

  it('KNOWN-EMPTY (fresh create, no windows added): fails closed with the window requirement, no modal', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    fireEvent.click(within(screen.getByTestId('base-mechanic-picker')).getByRole('button', { name: /buy one, get one free/i }))
    // Complete the underlying mechanic so ONLY the window rule can block.
    fireEvent.change(screen.getByPlaceholderText('e.g. A main course'), { target: { value: 'A main course' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. A second of equal or lower value'), { target: { value: 'A second main' } })
    fireEvent.change(screen.getByLabelText('Value of the free item') as HTMLInputElement, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    // Fresh create = KNOWN-EMPTY: the window requirement fires and the modal never opens.
    expect(screen.getAllByText(/Add at least one time window/i).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('submit-confirm-modal')).not.toBeInTheDocument()
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it('REUSABLE existing edit (cooldownSeconds IS returned by detail): submits, cooldown never falsely blocks', async () => {
    const reuseBag = {
      askHelp: false,
      builderType: 'reusable',
      baseMechanic: 'bogo',
      draftFields: { type: 'bogo', bogoBuy: 'A main course', bogoFree: 'A second main', bogoFreePrice: 12 },
      selectedClauseIds: ['tell_staff'],
      customTerms: [],
    }
    renderBuilder({ voucherId: 'v1', initialType: 'REUSABLE', initialFields: reuseBag, initialCooldown: 3600 })
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    expect(await screen.findByTestId('submit-confirm-modal')).toBeInTheDocument()
    expect(screen.queryByText(/reuse cooldown/i)).not.toBeInTheDocument()
  })
})
