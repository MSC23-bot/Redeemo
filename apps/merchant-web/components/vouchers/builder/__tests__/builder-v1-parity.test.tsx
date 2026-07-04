/**
 * Vouchers V1 (builder parity) pins:
 * - Terms checklist wiring: structured types compose the terms string from the
 *   ticked clauses + custom terms; the free-text textarea remains ONLY for
 *   TIME_LIMITED / REUSABLE; legacy free-text drafts rehydrate as custom terms
 *   (nothing silently dropped).
 * - Photo upload control present; payload carries imageUrl.
 * - REUSABLE custom interval (floor-clamped); TIME_LIMITED window presets +
 *   end-date toggle (generic expiryDate).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DayTwoBuilder } from '@/components/vouchers/builder/DayTwoBuilder'
import {
  emptyBuilderState,
  fromDetail,
  toCreatePayload,
  composeTermsText,
  REUSABLE_COOLDOWN_FLOOR,
} from '@/components/vouchers/builder/builderModel'
import { defaultSelectedClauseIds } from '@/lib/voucher/terms'

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

// The photo control POSTs through apiFetch inside FileUpload; stub the client so
// no network fires (upload behaviour itself is pinned in file-upload.test.tsx).
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: jest.fn(() => Promise.resolve({ url: 'https://cdn.example/p.png' })),
}))

function renderBuilder(props: Partial<React.ComponentProps<typeof DayTwoBuilder>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onDone = props.onDone ?? jest.fn()
  render(
    <QueryClientProvider client={qc}>
      <DayTwoBuilder categoryName="Food & Drink" onDone={onDone} onCancel={jest.fn()} {...props} />
    </QueryClientProvider>,
  )
  return { onDone }
}

beforeEach(() => {
  createVoucher.mockReset().mockResolvedValue({ id: 'new1', status: 'DRAFT', approvalStatus: 'PENDING' })
  updateVoucher.mockReset().mockResolvedValue({ id: 'new1', status: 'DRAFT', approvalStatus: 'PENDING' })
  submitVoucher.mockReset().mockResolvedValue({ id: 'new1', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' })
})

describe('terms checklist (structured types)', () => {
  it('renders the checklist with the per-type defaults ticked, and NO free-text terms textarea', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    const section = screen.getByTestId('terms-section')
    expect(section).toBeInTheDocument()
    // Freebie defaults: one_free_item + tell_staff + per_visit ticked.
    expect(within(section).getByRole('checkbox', { name: /one free item per visit/i })).toBeChecked()
    expect(within(section).getByRole('checkbox', { name: /tell the staff/i })).toBeChecked()
    expect(within(section).getByRole('checkbox', { name: /not valid with any other voucher/i })).not.toBeChecked()
    expect(screen.queryByLabelText(/terms \(optional\)/i)).not.toBeInTheDocument()
  })

  it('saving composes the terms string from ticked clauses + custom terms', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    const section = screen.getByTestId('terms-section')
    // Untick a default, add a custom term.
    fireEvent.click(within(section).getByRole('checkbox', { name: /one free item per visit/i }))
    fireEvent.change(within(section).getByLabelText(/add your own term/i), { target: { value: 'Bring this voucher on your phone' } })
    fireEvent.click(within(section).getByRole('button', { name: /add term/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    const lines = String(payload.terms).split('\n')
    expect(lines).toContain('Bring this voucher on your phone')
    expect(lines).not.toContain('One free item per visit') // unticked
    // Selections persisted for rehydration.
    expect(payload.merchantFields.selectedClauseIds).not.toContain('one_free_item')
    expect(payload.merchantFields.customTerms).toEqual([
      { text: 'Bring this voucher on your phone', tier: expect.any(String) },
    ])
  })

  it('TIME_LIMITED keeps the free-text terms textarea (no clause pools)', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    expect(screen.queryByTestId('terms-section')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/terms \(optional\)/i)).toBeInTheDocument()
  })
})

describe('legacy free-text rehydration', () => {
  it('a structured draft with free-text terms and no saved selections becomes custom terms verbatim', () => {
    const state = fromDetail({
      type: 'FREEBIE',
      title: 'Free coffee',
      terms: 'Weekdays only\nShow the code at the till',
      merchantFields: { builderType: 'freebie' },
    })
    expect(state.selectedClauseIds).toEqual([])
    expect(state.customTerms.map((c) => c.text)).toEqual(['Weekdays only', 'Show the code at the till'])
    // The restrictive-word regex tags "only" lines restrictive.
    expect(state.customTerms[0].tier).toBe('restrictive')
    // Composed payload preserves the merchant's words.
    const composed = composeTermsText(state, 'food_drink')
    expect(composed).toBe('Weekdays only\nShow the code at the till')
  })

  it('saved selections win over legacy conversion', () => {
    const state = fromDetail({
      type: 'FREEBIE',
      terms: 'ignored\nlines',
      merchantFields: { builderType: 'freebie', selectedClauseIds: ['tell_staff'], customTerms: [{ text: 'Custom A', tier: 'caution' }] },
    })
    expect(state.selectedClauseIds).toEqual(['tell_staff'])
    expect(state.customTerms).toEqual([{ text: 'Custom A', tier: 'caution' }])
  })
})

describe('photo upload', () => {
  it('renders the photo control for every type and carries imageUrl in the payload', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    expect(screen.getByText(/add a photo \(optional\)/i)).toBeInTheDocument()
    // Model-level: a state with imageUrl lands in the payload.
    const state = { ...emptyBuilderState('freebie'), imageUrl: 'https://cdn.example/p.png' }
    expect(toCreatePayload(state).imageUrl).toBe('https://cdn.example/p.png')
  })
})

describe('REUSABLE custom interval', () => {
  it('applies every-N-unit as seconds and clamps to the 30-minute floor', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /reusable/i }))
    const box = screen.getByTestId('custom-cooldown')
    fireEvent.change(within(box).getByLabelText(/custom cooldown amount/i), { target: { value: '3' } })
    fireEvent.change(within(box).getByLabelText(/custom cooldown unit/i), { target: { value: 'days' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    return waitFor(() => {
      expect(createVoucher).toHaveBeenCalledTimes(1)
      expect(createVoucher.mock.calls[0][0].cooldownSeconds).toBe(3 * 86400)
    })
  })

  it('model clamps a below-floor custom value to the floor', () => {
    const state = { ...emptyBuilderState('reusable'), cooldownSeconds: 60 }
    expect(toCreatePayload(state).cooldownSeconds).toBe(REUSABLE_COOLDOWN_FLOOR)
  })
})

describe('TIME_LIMITED presets + end date', () => {
  it('a preset seeds editable windows', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    fireEvent.click(within(screen.getByTestId('window-presets')).getByRole('button', { name: /weekday lunchtimes/i }))
    // 5 seeded rows (Mon-Fri) render as editable window rows.
    expect(screen.getAllByLabelText(/open time/i)).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const windows = createVoucher.mock.calls[0][0].availabilityWindows
    expect(windows).toHaveLength(5)
    expect(windows[0]).toEqual({ dayOfWeek: 1, openTime: '12:00', closeTime: '14:30' })
  })

  it('the end-date toggle writes the generic expiryDate into the payload', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /ends on a date/i }))
    fireEvent.change(screen.getByLabelText(/^end date$/i), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    expect(createVoucher.mock.calls[0][0].expiryDate).toBe('2026-09-30')
  })
})

describe('defaults sanity', () => {
  it('emptyBuilderState pre-ticks the per-type default clause ids', () => {
    expect(emptyBuilderState('freebie').selectedClauseIds).toEqual(defaultSelectedClauseIds('freebie'))
    expect(emptyBuilderState('time').selectedClauseIds).toEqual([])
  })
})
