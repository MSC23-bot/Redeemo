/**
 * pipelineFormat — pure display-derivation helpers for the prospect board.
 */
import {
  sourceLabel,
  isFutureIntake,
  categoryLocationLine,
  isOverdue,
  formatDueDate,
  nextLane,
  prevLane,
  splitContactName,
} from '../pipelineFormat'

describe('sourceLabel', () => {
  it('labels every backend source', () => {
    expect(sourceLabel('REP_VISIT')).toBe('Rep visit')
    expect(sourceLabel('INBOUND_ENQUIRY')).toBe('Inbound enquiry')
    expect(sourceLabel('PHONE')).toBe('Phone')
    expect(sourceLabel('SOCIAL')).toBe('Social')
    expect(sourceLabel('EMAIL_CAMPAIGN')).toBe('Email campaign')
    expect(sourceLabel('CUSTOMER_REQUEST')).toBe('Customer request')
  })

  it('returns null for a null source', () => {
    expect(sourceLabel(null)).toBeNull()
  })

  it('falls back to the raw token for an unknown source', () => {
    expect(sourceLabel('WHATSAPP')).toBe('WHATSAPP')
  })
})

describe('isFutureIntake', () => {
  it('is true only for CUSTOMER_REQUEST (the deferred customer-app intake)', () => {
    expect(isFutureIntake('CUSTOMER_REQUEST')).toBe(true)
    expect(isFutureIntake('REP_VISIT')).toBe(false)
    expect(isFutureIntake(null)).toBe(false)
  })
})

describe('categoryLocationLine', () => {
  it('suffixes the category with "(guess)" and joins with the location', () => {
    expect(categoryLocationLine('Food and drink', 'Bristol BS1')).toBe('Food and drink (guess) · Bristol BS1')
  })

  it('shows just the category (guess) when no location', () => {
    expect(categoryLocationLine('Retail', null)).toBe('Retail (guess)')
  })

  it('shows just the location when no category', () => {
    expect(categoryLocationLine(null, 'Bath')).toBe('Bath')
  })

  it('returns null when neither is present', () => {
    expect(categoryLocationLine(null, null)).toBeNull()
  })
})

describe('isOverdue', () => {
  const NOW = new Date('2026-07-13T12:00:00.000Z')

  it('is true for a due date strictly in the past', () => {
    expect(isOverdue('2026-07-10T00:00:00.000Z', NOW)).toBe(true)
  })

  it('is false for a future due date', () => {
    expect(isOverdue('2026-07-20T00:00:00.000Z', NOW)).toBe(false)
  })

  it('is false for a null / unparseable due date', () => {
    expect(isOverdue(null, NOW)).toBe(false)
    expect(isOverdue('not-a-date', NOW)).toBe(false)
  })
})

describe('formatDueDate', () => {
  it('formats an ISO date as en-GB "20 Jul 2026"', () => {
    expect(formatDueDate('2026-07-20T00:00:00.000Z')).toBe('20 Jul 2026')
  })

  it('returns null for null / unparseable input', () => {
    expect(formatDueDate(null)).toBeNull()
    expect(formatDueDate('garbage')).toBeNull()
  })
})

describe('nextLane / prevLane', () => {
  it('advances Lead -> Contacted -> Visit booked; Visit booked has no forward move', () => {
    expect(nextLane('LEAD')).toBe('CONTACTED')
    expect(nextLane('CONTACTED')).toBe('VISIT_BOOKED')
    expect(nextLane('VISIT_BOOKED')).toBeNull()
  })

  it('regresses Visit booked -> Contacted -> Lead; Lead has no back move', () => {
    expect(prevLane('VISIT_BOOKED')).toBe('CONTACTED')
    expect(prevLane('CONTACTED')).toBe('LEAD')
    expect(prevLane('LEAD')).toBeNull()
  })
})

describe('splitContactName', () => {
  it('splits a two-part name into first + last', () => {
    expect(splitContactName('Marta Vane')).toEqual({ first: 'Marta', last: 'Vane' })
  })

  it('keeps a multi-word surname together', () => {
    expect(splitContactName('Ana Maria De La Cruz')).toEqual({ first: 'Ana', last: 'Maria De La Cruz' })
  })

  it('puts a single token in first, empty last', () => {
    expect(splitContactName('Cher')).toEqual({ first: 'Cher', last: '' })
  })

  it('returns empty strings for a null name', () => {
    expect(splitContactName(null)).toEqual({ first: '', last: '' })
  })
})
