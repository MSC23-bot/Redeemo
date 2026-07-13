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
import type { ComponentProps } from 'react'
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

// The photo control POSTs through apiFetch inside FileUpload; a reprogrammable
// stub lets the interaction tests drive success / STORAGE_NOT_ENABLED paths.
const mockApiFetch = jest.fn()
jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
}))

// FileUpload now routes an image pick through ImageCropModal (crop-first flow)
// before uploading. The crop step has its own suites
// (components/ui/__tests__/ImageCropModal.test.tsx + lib/image/__tests__/
// cropImage.test.ts); here it is replaced with an auto-confirm pass-through
// (confirms with the same picked File on mount) so these parity tests keep
// exercising the pick -> upload -> payload wiring without a canvas in jsdom.
jest.mock('@/components/ui/ImageCropModal', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    ImageCropModal: ({ file, onConfirm }: { file: File; onConfirm: (f: File) => void }) => {
      useEffect(() => {
        onConfirm(file)
        // Mount-only: the fake immediately "confirms" the crop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return null
    },
  }
})

function renderBuilder(props: Partial<ComponentProps<typeof DayTwoBuilder>> = {}) {
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
  mockApiFetch.mockReset().mockResolvedValue({ url: 'https://cdn.example/p.png' })
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

  it('TIME_LIMITED shows the base-mechanic Step 1 first, then the wrapper terms checklist once a base is picked', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    // Step 1 (base mechanic) shows; no terms checklist yet on a fresh wrapper.
    expect(screen.getByTestId('base-mechanic-picker')).toBeInTheDocument()
    expect(screen.queryByTestId('terms-section')).not.toBeInTheDocument()
    // Pick a base mechanic: the wrapper cadence terms checklist appears with the
    // wrapper defaults ticked (time_avail / time_once_window / tell_staff).
    fireEvent.click(within(screen.getByTestId('base-mechanic-picker')).getByRole('button', { name: /discount/i }))
    const section = screen.getByTestId('terms-section')
    expect(within(section).getByRole('checkbox', { name: /available only during the times shown/i })).toBeChecked()
    expect(within(section).getByRole('checkbox', { name: /one redemption per customer each time/i })).toBeChecked()
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

function pickPhoto(name = 'p.png') {
  const input = document.getElementById('file-upload-photo') as HTMLInputElement
  const file = new File(['x'.repeat(10)], name, { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('photo upload (real FileUpload interaction)', () => {
  it('a successful upload propagates the returned URL into the saved payload', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    pickPhoto()
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/merchant/uploads/photo', expect.objectContaining({ method: 'POST' })),
    )
    await screen.findByText('Replace photo')
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    expect(createVoucher.mock.calls[0][0].imageUrl).toBe('https://cdn.example/p.png')
  })

  it('replacement swaps the payload URL to the newest upload', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    pickPhoto('first.png')
    await screen.findByText('Replace photo')
    mockApiFetch.mockResolvedValue({ url: 'https://cdn.example/second.png' })
    pickPhoto('second.png')
    // Wait for the upload to COMPLETE (exact filename without the 'Uploading '
    // prefix = FileUpload's done state), so onUploaded has updated the builder
    // state before saving.
    await screen.findByText('second.png', { exact: true })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    expect(createVoucher.mock.calls[0][0].imageUrl).toBe('https://cdn.example/second.png')
  })

  it('pre-save removal on a NEW voucher clears the photo (create-omission means no photo)', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    pickPhoto()
    await screen.findByText('Replace photo')
    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    expect(createVoucher.mock.calls[0][0].imageUrl).toBeUndefined()
  })

  it('STORAGE_NOT_ENABLED surfaces the honest not-available message in the builder', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    mockApiFetch.mockRejectedValueOnce(Object.assign(new Error('dark'), { code: 'STORAGE_NOT_ENABLED' }))
    pickPhoto()
    expect(await screen.findByText(/image upload is not available yet/i)).toBeInTheDocument()
  })
})

describe('saved-photo removal (edit mode - nullable-clear spec 2026-07-05, D1+D3)', () => {
  const editProps = {
    voucherId: 'v1',
    initialType: 'FREEBIE',
    initialTitle: 'Free coffee',
    initialImageUrl: 'https://cdn.example/saved.png',
  }

  it('the saved baseline shows a Remove photo button, never the old replace-only note', () => {
    renderBuilder(editProps)
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    expect(screen.queryByText(/a saved photo can be replaced, not removed, for now/i)).not.toBeInTheDocument()
  })

  it('clicking Remove photo on the saved baseline sends imageUrl: null on save', async () => {
    renderBuilder(editProps)
    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    expect(updateVoucher.mock.calls[0][1].imageUrl).toBeNull()
  })

  it('a session upload over a saved photo offers revert-to-saved, and reverting restores the baseline in the payload', async () => {
    renderBuilder(editProps)
    pickPhoto('new.png')
    const revert = await screen.findByRole('button', { name: /use the saved photo instead/i })
    fireEvent.click(revert)
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    expect(updateVoucher.mock.calls[0][1].imageUrl).toBe('https://cdn.example/saved.png')
  })
})

describe('REUSABLE custom interval', () => {
  it('applies every-N-unit as seconds and clamps to the 30-minute floor', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /reusable/i }))
    // Wrapper Step 1: pick a base mechanic to reveal Step 2 (the cooldown editor).
    fireEvent.click(within(screen.getByTestId('base-mechanic-picker')).getByRole('button', { name: /discount/i }))
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
  function pickTimeLimitedBase() {
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    fireEvent.click(within(screen.getByTestId('base-mechanic-picker')).getByRole('button', { name: /discount/i }))
  }

  it('a quick-start preset seeds editable windows', async () => {
    renderBuilder()
    pickTimeLimitedBase()
    fireEvent.click(within(screen.getByTestId('window-presets')).getByRole('button', { name: /happy hour/i }))
    // 5 seeded rows (Mon-Fri) render as editable window rows.
    expect(screen.getAllByLabelText(/open time/i)).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const windows = createVoucher.mock.calls[0][0].availabilityWindows
    expect(windows).toHaveLength(5)
    expect(windows[0]).toEqual({ dayOfWeek: 1, openTime: '17:00', closeTime: '19:00' })
  })

  it('the end-date toggle writes the normalized ISO expiryDate into the payload', async () => {
    renderBuilder()
    pickTimeLimitedBase()
    fireEvent.click(screen.getByRole('checkbox', { name: /ends on a date/i }))
    fireEvent.change(screen.getByLabelText(/^end date$/i), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    expect(createVoucher.mock.calls[0][0].expiryDate).toBe('2026-09-30T00:00:00.000Z')
  })
})

describe('saved end-date removal on edits (nullable-clear spec 2026-07-05, D1+D2)', () => {
  it('an EDIT with a hydrated end date shows an ENABLED toggle and no locked copy; unticking clears expiryDate to null on save', async () => {
    renderBuilder({
      voucherId: 'v1',
      initialType: 'TIME_LIMITED',
      initialTitle: 'Happy hour',
      initialExpiryDate: '2026-12-01T00:00:00.000Z',
    })
    const box = screen.getByRole('checkbox', { name: /ends on a date/i })
    expect(box).toBeChecked()
    expect(box).toBeEnabled()
    expect(screen.queryByText(/a saved end date can be changed, not removed, for now/i)).not.toBeInTheDocument()
    fireEvent.click(box) // untick
    expect(box).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    expect(updateVoucher.mock.calls[0][1].expiryDate).toBeNull()
  })

  it('a DUPLICATE with a source end date keeps the toggle free (create-omission is truthful)', () => {
    renderBuilder({
      initialType: 'TIME_LIMITED',
      initialTitle: 'Happy hour (copy)',
      initialExpiryDate: '2026-12-01T00:00:00.000Z',
    })
    const box = screen.getByRole('checkbox', { name: /ends on a date/i })
    expect(box).toBeChecked()
    expect(box).toBeEnabled()
  })
})

describe('duplicate free photo removal (review F2 pin)', () => {
  it('a DUPLICATE with a source photo offers free Remove (not the replace-only note)', () => {
    renderBuilder({
      initialType: 'FREEBIE',
      initialTitle: 'Free coffee (copy)',
      initialImageUrl: 'https://cdn.example/saved.png',
    })
    expect(screen.getByRole('button', { name: /remove photo/i })).toBeInTheDocument()
    expect(screen.queryByText(/a saved photo can be replaced, not removed/i)).not.toBeInTheDocument()
  })
})

describe('expiryDate + imageUrl hydration and contract (Codex round)', () => {
  it('the date-only UI value normalizes to a literal ISO datetime in the outgoing payload', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /time limited/i }))
    fireEvent.click(within(screen.getByTestId('base-mechanic-picker')).getByRole('button', { name: /discount/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /ends on a date/i }))
    fireEvent.change(screen.getByLabelText(/^end date$/i), { target: { value: '2026-09-30' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    // LITERAL ISO datetime - the backend contract is z.string().datetime().
    expect(createVoucher.mock.calls[0][0].expiryDate).toBe('2026-09-30T00:00:00.000Z')
  })

  it('a description-only EDIT preserves the saved imageUrl and expiryDate in the PATCH', async () => {
    renderBuilder({
      voucherId: 'v1',
      initialType: 'FREEBIE',
      initialTitle: 'Free coffee',
      initialImageUrl: 'https://cdn.example/saved.png',
      initialExpiryDate: '2026-12-01T00:00:00.000Z',
    })
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'New description.' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const payload = updateVoucher.mock.calls[0][1]
    expect(payload.imageUrl).toBe('https://cdn.example/saved.png')
    expect(payload.expiryDate).toBe('2026-12-01T00:00:00.000Z') // full ISO passes through untouched
  })

  it('a DUPLICATE carries the source imageUrl and expiryDate into the new create', async () => {
    renderBuilder({
      initialType: 'FREEBIE',
      initialTitle: 'Free coffee (copy)',
      initialImageUrl: 'https://cdn.example/saved.png',
      initialExpiryDate: '2026-12-01T00:00:00.000Z',
    })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    expect(payload.imageUrl).toBe('https://cdn.example/saved.png')
    expect(payload.expiryDate).toBe('2026-12-01T00:00:00.000Z')
  })
})

describe('nullable-clear cross-field independence (spec 2026-07-05, D1)', () => {
  const editProps = {
    voucherId: 'v1',
    initialType: 'TIME_LIMITED',
    initialTitle: 'Happy hour',
    initialImageUrl: 'https://cdn.example/saved.png',
    initialExpiryDate: '2026-12-01T00:00:00.000Z',
  }

  it('clearing the saved photo leaves the saved expiryDate in the PATCH untouched', async () => {
    renderBuilder(editProps)
    fireEvent.click(screen.getByRole('button', { name: /remove photo/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const payload = updateVoucher.mock.calls[0][1]
    expect(payload.imageUrl).toBeNull()
    expect(payload.expiryDate).toBe('2026-12-01T00:00:00.000Z')
  })

  it('clearing the saved end date leaves the saved imageUrl in the PATCH untouched (mirror)', async () => {
    renderBuilder(editProps)
    fireEvent.click(screen.getByRole('checkbox', { name: /ends on a date/i })) // untick
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const payload = updateVoucher.mock.calls[0][1]
    expect(payload.expiryDate).toBeNull()
    expect(payload.imageUrl).toBe('https://cdn.example/saved.png')
  })

  it('an untouched EDIT still resends both unchanged saved values (always-resend preserved)', async () => {
    renderBuilder(editProps)
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const payload = updateVoucher.mock.calls[0][1]
    expect(payload.imageUrl).toBe('https://cdn.example/saved.png')
    expect(payload.expiryDate).toBe('2026-12-01T00:00:00.000Z')
  })

  it('CREATE with blank photo/date sends undefined for both, never null (no keys with null values)', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(createVoucher).toHaveBeenCalledTimes(1))
    const payload = createVoucher.mock.calls[0][0]
    expect(payload.imageUrl).toBeUndefined()
    expect(payload.expiryDate).toBeUndefined()
  })
})

describe('custom-term remove buttons have distinct accessible names (Codex round)', () => {
  it('each Remove is named for its term', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: /freebie/i }))
    const section = screen.getByTestId('terms-section')
    for (const text of ['First custom', 'Second custom']) {
      fireEvent.change(within(section).getByLabelText(/add your own term/i), { target: { value: text } })
      fireEvent.click(within(section).getByRole('button', { name: /add term/i }))
    }
    expect(within(section).getByRole('button', { name: 'Remove term: First custom' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Remove term: Second custom' })).toBeInTheDocument()
  })
})

describe('empty structured terms clear explicitly (CodeRabbit #366)', () => {
  it("removing every clause and custom sends terms: '' (an explicit PATCH clear), never an omitted key", () => {
    const state = { ...emptyBuilderState('freebie'), selectedClauseIds: [], customTerms: [] }
    const payload = toCreatePayload(state, 'food_drink')
    expect(payload.terms).toBe('')
    expect('terms' in payload).toBe(true)
  })

  it('wrapper types now compose their cadence terms from the checklist (no free-text path)', () => {
    // A fresh TIME_LIMITED state seeds its wrapper default clauses, so the composed
    // terms string is non-empty (there is no remaining omit-when-empty free-text path).
    const state = emptyBuilderState('time')
    const terms = toCreatePayload(state).terms
    expect(typeof terms).toBe('string')
    expect(String(terms)).toContain('Available only during the times shown')
  })
})

describe('custom cooldown hydration (CodeRabbit #366)', () => {
  it('editing a voucher with a saved custom cooldown seeds the every-N fields from it', () => {
    renderBuilder({
      voucherId: 'v1',
      initialType: 'REUSABLE',
      initialTitle: 'Reusable offer',
      initialCooldown: 3 * 86400, // 3 days - not a preset
    })
    const box = screen.getByTestId('custom-cooldown')
    expect(within(box).getByLabelText(/custom cooldown amount/i)).toHaveValue(3)
    expect(within(box).getByLabelText(/custom cooldown unit/i)).toHaveValue('days')
    expect(screen.getByText(/custom interval applied/i)).toBeInTheDocument()
  })
})

describe('concierge terms apply (structured)', () => {
  it("'Apply Redeemo's suggestions' terms text survives into the composed payload verbatim", async () => {
    renderBuilder({
      voucherId: 'v1',
      initialType: 'FREEBIE',
      initialTitle: 'Free coffee',
      initialAdminProposed: { terms: 'Weekdays before 5pm\nOne per table' },
      initialAdminNote: 'Tightened the terms.',
    })
    fireEvent.click(screen.getByRole('button', { name: /apply redeemo's suggestions/i }))
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const payload = updateVoucher.mock.calls[0][1]
    expect(String(payload.terms).split('\n')).toEqual(['Weekdays before 5pm', 'One per table'])
  })
})

describe('defaults sanity', () => {
  it('emptyBuilderState pre-ticks the per-type default clause ids', () => {
    expect(emptyBuilderState('freebie').selectedClauseIds).toEqual(defaultSelectedClauseIds('freebie'))
    // Wrapper types now seed their cadence defaults (A7 / FULL.html), not [].
    expect(emptyBuilderState('time').selectedClauseIds).toEqual(['time_avail', 'time_once_window', 'tell_staff'])
    expect(emptyBuilderState('reusable').selectedClauseIds).toEqual(['reuse_active', 'tell_staff'])
    // Live BOGO default is tell_staff + no_combine (A7), a day-2 override of the
    // shared defaultSelectedClauseIds (which stays [] for the onboarding lane).
    expect(emptyBuilderState('bogo').selectedClauseIds).toEqual(['tell_staff', 'no_combine'])
  })
})
