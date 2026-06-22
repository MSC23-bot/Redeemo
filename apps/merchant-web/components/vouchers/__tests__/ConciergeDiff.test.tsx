import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConciergeDiff } from '@/components/vouchers/ConciergeDiff'
import { DayTwoBuilder } from '@/components/vouchers/builder/DayTwoBuilder'
import type { AdminProposed } from '@/lib/api/voucher'

// Day-2 Vouchers B6: the concierge correction loop. When a voucher is
// CHANGES_REQUESTED the admin writes corrected fields into
// merchantFields.adminProposed (+ adminNote). The builder renders a proposed-vs-
// current diff; "Apply Redeemo's suggestions" writes the proposed values into the
// form; resubmit flows through the validated updateVoucher then submitVoucher. A
// comment-only changes request (no adminProposed) shows just the note.

// --- ConciergeDiff unit -----------------------------------------------------

describe('ConciergeDiff (proposed-vs-current)', () => {
  const current = { title: 'Old title', description: 'Old desc', terms: 'Old terms', estimatedSaving: 4 }

  it('renders proposed-vs-current rows + the admin note + the Apply action', () => {
    const proposed: AdminProposed = { title: 'Better title', estimatedSaving: 6 }
    const onApply = jest.fn()
    render(<ConciergeDiff proposed={proposed} note="Please raise the saving." current={current} onApply={onApply} />)

    expect(screen.getByTestId('concierge-note')).toHaveTextContent('Please raise the saving.')
    // Only the proposed keys (title, estimatedSaving) appear as diff rows.
    expect(screen.getByTestId('concierge-current-title')).toHaveTextContent('Old title')
    expect(screen.getByTestId('concierge-proposed-title')).toHaveTextContent('Better title')
    expect(screen.getByTestId('concierge-current-estimatedSaving')).toHaveTextContent('£4')
    expect(screen.getByTestId('concierge-proposed-estimatedSaving')).toHaveTextContent('£6')
    // A field the admin did NOT propose (description) is not shown as a diff row.
    expect(screen.queryByTestId('concierge-proposed-description')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /apply redeemo's suggestions/i }))
    expect(onApply).toHaveBeenCalledWith(proposed)
  })

  it('comment-only (no adminProposed) shows the note and NO Apply action', () => {
    render(<ConciergeDiff proposed={null} note="Just a heads up." current={current} onApply={jest.fn()} />)
    expect(screen.getByTestId('concierge-note')).toHaveTextContent('Just a heads up.')
    expect(screen.queryByRole('button', { name: /apply redeemo's suggestions/i })).toBeNull()
  })

  it('an empty adminProposed object shows no Apply action', () => {
    render(<ConciergeDiff proposed={{}} note="Comment only." current={current} onApply={jest.fn()} />)
    expect(screen.queryByRole('button', { name: /apply redeemo's suggestions/i })).toBeNull()
  })
})

// --- Builder apply + resubmit-via-updateVoucher integration -----------------

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
  return render(
    <QueryClientProvider client={qc}>
      <DayTwoBuilder
        categoryName="Food & Drink"
        onDone={jest.fn()}
        onCancel={jest.fn()}
        voucherId="v9"
        initialType="FREEBIE"
        initialFields={{ builderType: 'freebie', draftFields: { type: 'freebie', freeItem: 'A coffee', freeWorth: 4 } }}
        initialTitle="Old title"
        initialSaving={4}
        {...props}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  createVoucher.mockReset().mockResolvedValue({ id: 'v9', status: 'DRAFT', approvalStatus: 'PENDING' })
  updateVoucher.mockReset().mockResolvedValue({ id: 'v9', status: 'DRAFT', approvalStatus: 'PENDING' })
  submitVoucher.mockReset().mockResolvedValue({ id: 'v9', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' })
})

describe('DayTwoBuilder concierge apply + resubmit', () => {
  it('opening a CHANGES_REQUESTED voucher renders the diff + note', async () => {
    renderBuilder({
      initialAdminProposed: { title: 'Better title', estimatedSaving: 6 },
      initialAdminNote: 'Raise the saving and sharpen the title.',
    })
    expect(await screen.findByTestId('concierge-diff')).toBeInTheDocument()
    expect(screen.getByTestId('concierge-proposed-title')).toHaveTextContent('Better title')
    expect(screen.getByTestId('concierge-note')).toHaveTextContent('Raise the saving')
  })

  it('Apply suggestions then Submit resubmits via the validated updateVoucher then submitVoucher', async () => {
    renderBuilder({
      initialAdminProposed: { title: 'Better title', estimatedSaving: 6 },
      initialAdminNote: 'Raise the saving.',
    })
    fireEvent.click(await screen.findByRole('button', { name: /apply redeemo's suggestions/i }))
    // The preview reflects the applied title.
    await waitFor(() =>
      expect(screen.getByTestId('builder-preview-title')).toHaveTextContent('Better title'),
    )
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    await waitFor(() => expect(updateVoucher).toHaveBeenCalledTimes(1))
    const [calledId, payload] = updateVoucher.mock.calls[0]
    expect(calledId).toBe('v9')
    expect(payload.title).toBe('Better title')
    expect(payload.estimatedSaving).toBe(6)
    await waitFor(() => expect(submitVoucher).toHaveBeenCalledWith('v9'))
    expect(createVoucher).not.toHaveBeenCalled()
  })

  it('a comment-only changes request shows the note but no Apply action', async () => {
    renderBuilder({ initialAdminProposed: null, initialAdminNote: 'Looks close, tighten the wording.' })
    expect(await screen.findByTestId('concierge-note')).toHaveTextContent('tighten the wording')
    expect(screen.queryByRole('button', { name: /apply redeemo's suggestions/i })).toBeNull()
  })
})
