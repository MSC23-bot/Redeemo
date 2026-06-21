import { render, screen } from '@testing-library/react'
import { ScoreCard } from '@/components/onboarding/vouchers/ScoreCard'
import type { ScoreResult } from '@/lib/voucher/scoring'

// M2 F5 a11y follow-up: the "How this voucher stacks up" results recompute live as the
// merchant types (the score is a useMemo in the parent). The results region carries
// aria-live="polite" so the meter state, strengths, and improvements are announced to
// screen-reader users on change. Advisory only (CC-1): this never gates submit.

function makeScore(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    calKey: 'good',
    label: 'Good',
    desc: 'A solid offer that should do well.',
    belowMinSaving: false,
    tooRestrictive: false,
    becomingRestrictive: false,
    improveCount: 1,
    isGenerous: false,
    titleClear: true,
    descHelpful: true,
    strengths: ['Clear, generous saving'],
    improvements: ['Add a photo so it stands out'],
    meter: ['weak', 'good', 'great'],
    ...overrides,
  }
}

describe('ScoreCard a11y - live region', () => {
  it('wraps the results (meter + strengths + improvements) in an aria-live="polite" region', () => {
    render(<ScoreCard score={makeScore()} />)
    const live = screen.getByTestId('score-results')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveAttribute('aria-atomic', 'true')
  })

  it('the meter sits inside the live region so score transitions are announced', () => {
    render(<ScoreCard score={makeScore({ calKey: 'weak', desc: 'Too weak to stand out.' })} />)
    const live = screen.getByTestId('score-results')
    const meter = screen.getByTestId('score-meter')
    expect(live).toContainElement(meter)
    expect(live).toHaveTextContent(/Too weak/i)
  })

  it('strengths and improvements are inside the live region', () => {
    render(<ScoreCard score={makeScore()} />)
    const live = screen.getByTestId('score-results')
    expect(live).toHaveTextContent('Clear, generous saving')
    expect(live).toHaveTextContent('Add a photo so it stands out')
  })

  it('renders the empty prompt (no live region) before a type is picked', () => {
    render(<ScoreCard score={null} />)
    expect(screen.getByText('Pick what runs first')).toBeInTheDocument()
    expect(screen.queryByTestId('score-results')).not.toBeInTheDocument()
  })
})
