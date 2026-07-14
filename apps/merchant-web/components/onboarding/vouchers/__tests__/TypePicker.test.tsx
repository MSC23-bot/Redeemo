import { render, screen, fireEvent } from '@testing-library/react'
import { TypePicker } from '@/components/onboarding/vouchers/TypePicker'

// M2 F5 CC-3: the type picker. 5 ELIGIBLE cards (BOGO recommended) + Time-limited /
// Reusable DISABLED-with-copy. Continue is enabled only when an eligible type is
// chosen. The redemption-cycle primer is present.

function setup(onContinue = jest.fn()) {
  render(
    <TypePicker
      categoryKey="food_drink"
      voucherIndex={1}
      onContinue={onContinue}
      onBack={jest.fn()}
    />,
  )
  return { onContinue }
}

describe('CC-3: 5 eligible types, BOGO recommended', () => {
  it('renders the 5 eligible cards selectable + the Recommended badge on BOGO', () => {
    setup()
    expect(screen.getByRole('button', { name: /Buy one, get one free/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Spend & save/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Discount/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Freebie/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Package deal/i })).toBeEnabled()
    expect(screen.getByText('Recommended')).toBeInTheDocument()
  })

  it('renders Time limited + Reusable as DISABLED with the helper copy', () => {
    setup()
    const time = screen.getByRole('button', { name: /Time limited/i })
    const reusable = screen.getByRole('button', { name: /Reusable/i })
    expect(time).toBeDisabled()
    expect(reusable).toBeDisabled()
    expect(
      screen.getAllByText(/create these as custom vouchers later/i).length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('clicking a disabled type does NOT select it / does NOT enable Continue', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Time limited/i }))
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled()
  })
})

describe('selection + continue', () => {
  it('Continue is disabled until an eligible type is picked, then fires onContinue with the builder type', () => {
    const { onContinue } = setup()
    const cont = screen.getByRole('button', { name: /Continue/i })
    expect(cont).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Buy one, get one free/i }))
    expect(cont).toBeEnabled()
    fireEvent.click(cont)
    expect(onContinue).toHaveBeenCalledWith('bogo')
  })
})

describe('primer + voucher counter', () => {
  it('shows the redemption-cycle primer and the prototype step chip "Voucher 1 of 2 · Step 1 of 2"', () => {
    setup()
    expect(
      screen.getByText(/Each customer can use a voucher once a month/i),
    ).toBeInTheDocument()
    // Prototype wizard chip (A11 / FULL.html stepLabel): the type pick is Step 1 of 2.
    expect(screen.getByText('Voucher 1 of 2 · Step 1 of 2')).toBeInTheDocument()
  })

  it('shows a category example on the BOGO card', () => {
    setup()
    expect(screen.getByText(/Buy one main, get one free/i)).toBeInTheDocument()
  })
})
