import {
  deriveDisplayState,
  filterBucketOf,
  matchesFilter,
  isEditable,
  DISPLAY_STATE_LABEL,
  DISPLAY_STATE_BADGE,
  type VoucherDisplayState,
  type VoucherFilterId,
} from '../displayState'

// Day-2 Vouchers B-4: a table-driven exercise of the full (status, approvalStatus)
// -> deriveDisplayState -> filterBucketOf -> labels matrix. Pins every branch
// (including the ones the page/actions suites never assert: draft,
// changes-requested, finished, EXPIRED, the unknown fallback) + the bucket
// groupings (changes-requested -> draft, approved-waiting -> in-review, rejected
// -> finished) + the matchesFilter('all') always-true contract.

type Case = {
  status: string
  approvalStatus: string
  state: VoucherDisplayState
  bucket: VoucherFilterId
}

const CASES: Case[] = [
  { status: 'ACTIVE', approvalStatus: 'APPROVED', state: 'live', bucket: 'live' },
  { status: 'PENDING_APPROVAL', approvalStatus: 'APPROVED', state: 'approved-waiting', bucket: 'in-review' },
  { status: 'PENDING_APPROVAL', approvalStatus: 'PENDING', state: 'in-review', bucket: 'in-review' },
  { status: 'DRAFT', approvalStatus: 'PENDING', state: 'draft', bucket: 'draft' },
  { status: 'DRAFT', approvalStatus: 'CHANGES_REQUESTED', state: 'changes-requested', bucket: 'draft' },
  { status: 'INACTIVE', approvalStatus: 'REJECTED', state: 'rejected', bucket: 'finished' },
  { status: 'INACTIVE', approvalStatus: 'APPROVED', state: 'finished', bucket: 'finished' },
  { status: 'EXPIRED', approvalStatus: 'APPROVED', state: 'finished', bucket: 'finished' },
  // The unknown fallback for any status the model does not recognise.
  { status: 'SOMETHING_ELSE', approvalStatus: 'PENDING', state: 'unknown', bucket: 'finished' },
]

describe('deriveDisplayState (table-driven, all branches)', () => {
  it.each(CASES)(
    'status=$status approvalStatus=$approvalStatus -> $state (bucket $bucket)',
    ({ status, approvalStatus, state, bucket }) => {
      const derived = deriveDisplayState({ status, approvalStatus })
      expect(derived).toBe(state)
      expect(filterBucketOf(derived)).toBe(bucket)
    },
  )
})

describe('display labels + badges cover every state', () => {
  const allStates: VoucherDisplayState[] = [
    'live',
    'approved-waiting',
    'in-review',
    'draft',
    'changes-requested',
    'rejected',
    'finished',
    'unknown',
  ]
  it.each(allStates)('%s has a non-empty full label and badge', (state) => {
    expect(DISPLAY_STATE_LABEL[state]).toBeTruthy()
    expect(DISPLAY_STATE_BADGE[state]).toBeTruthy()
  })

  it('approved-waiting keeps its distinct (not customer-visible "live") label', () => {
    expect(DISPLAY_STATE_LABEL['approved-waiting']).toMatch(/goes live when your business is live/i)
    expect(DISPLAY_STATE_BADGE['approved-waiting']).toMatch(/approved, waiting/i)
  })
})

describe('the bucket groupings (spec 3.3)', () => {
  it('changes-requested groups with Draft (it is still editable)', () => {
    expect(filterBucketOf('changes-requested')).toBe('draft')
  })
  it('approved-waiting groups with In review (not yet live)', () => {
    expect(filterBucketOf('approved-waiting')).toBe('in-review')
  })
  it('rejected groups with Finished (terminal)', () => {
    expect(filterBucketOf('rejected')).toBe('finished')
  })
  it('unknown falls back to Finished', () => {
    expect(filterBucketOf('unknown')).toBe('finished')
  })
})

describe('matchesFilter', () => {
  it("'all' always matches every state", () => {
    const states: VoucherDisplayState[] = [
      'live',
      'approved-waiting',
      'in-review',
      'draft',
      'changes-requested',
      'rejected',
      'finished',
      'unknown',
    ]
    for (const s of states) {
      expect(matchesFilter(s, 'all')).toBe(true)
    }
  })

  it('matches only states in the requested bucket', () => {
    expect(matchesFilter('changes-requested', 'draft')).toBe(true)
    expect(matchesFilter('changes-requested', 'live')).toBe(false)
    expect(matchesFilter('approved-waiting', 'in-review')).toBe(true)
    expect(matchesFilter('approved-waiting', 'live')).toBe(false)
    expect(matchesFilter('rejected', 'finished')).toBe(true)
    expect(matchesFilter('rejected', 'draft')).toBe(false)
  })
})

describe('isEditable (mirrors backend EDITABLE_STATUSES = ["DRAFT"])', () => {
  it('only DRAFT is editable', () => {
    expect(isEditable('DRAFT')).toBe(true)
    expect(isEditable('ACTIVE')).toBe(false)
    expect(isEditable('PENDING_APPROVAL')).toBe(false)
    expect(isEditable('INACTIVE')).toBe(false)
    expect(isEditable('EXPIRED')).toBe(false)
  })
})
