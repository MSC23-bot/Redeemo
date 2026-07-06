import { resolveVerificationBadge } from '@/lib/business-profile/verificationBadge'

describe('resolveVerificationBadge', () => {
  it('maps live + live_new to the success "Verified by Redeemo" badge', () => {
    expect(resolveVerificationBadge('live')).toEqual({
      label: 'Verified by Redeemo', tone: 'success', bg: '#E9F7EF', fg: '#0F7A3E',
    })
    expect(resolveVerificationBadge('live_new').label).toBe('Verified by Redeemo')
  })

  it('maps every pre-live state (setup / submitted / in_review / changes) to "Verification in progress"', () => {
    for (const state of ['setup', 'submitted', 'in_review', 'changes'] as const) {
      expect(resolveVerificationBadge(state)).toEqual({
        label: 'Verification in progress', tone: 'warning', bg: '#FEF6EC', fg: '#B45309',
      })
    }
  })

  it('maps suspended to a red "Suspended" badge', () => {
    expect(resolveVerificationBadge('suspended')).toEqual({
      label: 'Suspended', tone: 'danger', bg: '#FEECEC', fg: '#B91C1C',
    })
  })

  it('maps rejected to a red "Not approved" badge', () => {
    expect(resolveVerificationBadge('rejected')).toEqual({
      label: 'Not approved', tone: 'danger', bg: '#FEECEC', fg: '#B91C1C',
    })
  })
})
