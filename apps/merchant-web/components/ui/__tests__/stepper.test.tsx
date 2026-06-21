import { render, screen } from '@testing-library/react'
import { Stepper, type Step } from '../stepper'

const STEPS: Step[] = [
  { id: 'account', label: 'Account', state: 'done' },
  { id: 'category', label: 'Category', state: 'current' },
  { id: 'profile', label: 'Profile', state: 'in-progress' },
  { id: 'branch', label: 'Branch', state: 'locked' },
  { id: 'vouchers', label: 'Vouchers', state: 'todo' },
]

describe('Stepper', () => {
  it('renders an ordered list with one item per step and the step labels', () => {
    render(<Stepper steps={STEPS} />)
    const list = screen.getByRole('list')
    expect(list).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(STEPS.length)
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Vouchers')).toBeInTheDocument()
  })

  it('exposes each step state via data-state so consumers can style/assert it', () => {
    render(<Stepper steps={STEPS} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveAttribute('data-state', 'done')
    expect(items[1]).toHaveAttribute('data-state', 'current')
    expect(items[2]).toHaveAttribute('data-state', 'in-progress')
    expect(items[3]).toHaveAttribute('data-state', 'locked')
    expect(items[4]).toHaveAttribute('data-state', 'todo')
  })

  it('marks the current step with aria-current="step"', () => {
    render(<Stepper steps={STEPS} />)
    const current = screen.getAllByRole('listitem')[1]
    expect(current).toHaveAttribute('aria-current', 'step')
    // No other item is aria-current.
    const aria = screen.getAllByRole('listitem').map((el) => el.getAttribute('aria-current'))
    expect(aria.filter((v) => v === 'step')).toHaveLength(1)
  })

  it('renders an accessible progress bar reflecting done steps out of the total', () => {
    // 1 of 5 steps is "done" -> 20%.
    render(<Stepper steps={STEPS} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '20')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('paints the brand red->coral gradient on the progress fill', () => {
    render(<Stepper steps={STEPS} />)
    const fill = screen.getByTestId('stepper-progress-fill')
    // Gradient is a Tailwind arbitrary value on className (jsdom-safe); the dynamic
    // width is inline style (1 of 5 done -> 20%).
    expect(fill.className).toMatch(/E20C04/)
    expect(fill.getAttribute('style') ?? '').toMatch(/20%/)
  })

  it('renders the optional "Setup step N of M" caption when active step / total are given', () => {
    render(<Stepper steps={STEPS} activeStep={2} totalSteps={6} />)
    expect(screen.getByText(/Setup step 2 of 6/i)).toBeInTheDocument()
  })

  it('does not render the caption when activeStep is omitted', () => {
    render(<Stepper steps={STEPS} />)
    expect(screen.queryByText(/Setup step/i)).not.toBeInTheDocument()
  })

  it('reports 100% when every step is done', () => {
    const allDone = STEPS.map((s) => ({ ...s, state: 'done' as const }))
    render(<Stepper steps={allDone} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
