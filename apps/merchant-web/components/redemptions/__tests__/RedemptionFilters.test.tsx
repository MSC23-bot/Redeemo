import { render, fireEvent } from '@testing-library/react'
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
