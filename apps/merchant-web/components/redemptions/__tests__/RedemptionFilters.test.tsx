import { render, fireEvent, screen } from '@testing-library/react'
import { RedemptionFilters } from '../RedemptionFilters'

// Finding 3: the date range must cover the FULL selected day. From is start-of-day
// (00:00:00.000Z); To is end-of-day (23:59:59.999Z) so redemptions later on the
// selected To date are included (a midnight To would exclude almost the whole day).
function setup() {
  const onChange = jest.fn()
  const { container } = render(
    <RedemptionFilters filters={{}} branches={[]} onChange={onChange} />
  )
  const dateInputs = Array.from(container.querySelectorAll('input[type="date"]'))
  // Order in the markup: From, then To.
  return { onChange, fromInput: dateInputs[0] as HTMLInputElement, toInput: dateInputs[1] as HTMLInputElement }
}

describe('RedemptionFilters date range (Finding 3)', () => {
  it('From is sent as start-of-day (00:00:00.000Z)', () => {
    const { onChange, fromInput } = setup()
    fireEvent.change(fromInput, { target: { value: '2026-06-21' } })
    expect(onChange).toHaveBeenCalledWith({ from: '2026-06-21T00:00:00.000Z' })
  })

  it('To is sent as end-of-day (23:59:59.999Z) so the whole selected day is included', () => {
    const { onChange, toInput } = setup()
    fireEvent.change(toInput, { target: { value: '2026-06-21' } })
    expect(onChange).toHaveBeenCalledWith({ to: '2026-06-21T23:59:59.999Z' })
    // Regression guard against the midnight bug that excluded the rest of the day.
    expect(onChange).not.toHaveBeenCalledWith({ to: '2026-06-21T00:00:00.000Z' })
  })
})

describe('RedemptionFilters fidelity controls (voucher / sort / search)', () => {
  it('renders the voucher select from options and patches voucherId', () => {
    const onChange = jest.fn()
    render(
      <RedemptionFilters
        filters={{}}
        branches={[]}
        vouchers={[{ id: 'v1', title: 'Free coffee' }, { id: 'v2', title: 'Lunch deal' }]}
        onChange={onChange}
      />,
    )
    const select = screen.getByLabelText(/^voucher$/i)
    expect(screen.getByRole('option', { name: 'All vouchers' })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'v2' } })
    expect(onChange).toHaveBeenCalledWith({ voucherId: 'v2' })
  })

  it('a deep-linked voucherId missing from the options renders a fallback option, never blank (review F3)', () => {
    render(
      <RedemptionFilters
        filters={{ voucherId: 'v-deep' }}
        branches={[]}
        vouchers={[{ id: 'v1', title: 'Free coffee' }]}
        onChange={jest.fn()}
      />,
    )
    const select = screen.getByLabelText(/^voucher$/i) as HTMLSelectElement
    expect(select).toHaveValue('v-deep')
    expect(screen.getByRole('option', { name: 'Selected voucher' })).toBeInTheDocument()
  })

  it('hides the voucher select when no options are supplied (non-fatal fetch contract)', () => {
    render(<RedemptionFilters filters={{}} branches={[]} onChange={jest.fn()} />)
    expect(screen.queryByLabelText(/^voucher$/i)).not.toBeInTheDocument()
  })

  it('sort select patches sort, defaulting back to undefined for Newest first', () => {
    const onChange = jest.fn()
    render(<RedemptionFilters filters={{ sort: 'saving' }} branches={[]} onChange={onChange} />)
    const select = screen.getByLabelText(/^sort$/i)
    expect(select).toHaveValue('saving')
    fireEvent.change(select, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ sort: undefined })
  })

  it('the search box is labelled for its real scope (code or voucher)', () => {
    render(<RedemptionFilters filters={{}} branches={[]} onChange={jest.fn()} />)
    const input = screen.getByLabelText(/^search$/i)
    expect(input).toHaveAttribute('placeholder', 'Code or voucher')
  })
})
