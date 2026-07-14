import { describe, it, expect } from 'vitest'
import {
  normalizeInviterEmail,
  slugForPlaceKey,
  buildPlaceKey,
  hashInviteIp,
  validateInviteNote,
  HELD_REVIEW_TERMS,
} from '../../../../src/api/customer/invites/identity'

describe('normalizeInviterEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeInviterEmail('  Jo.Owner@Example.COM  ')).toBe('jo.owner@example.com')
  })

  it('is idempotent', () => {
    const once = normalizeInviterEmail('  A@B.Com ')
    expect(normalizeInviterEmail(once)).toBe(once)
  })
})

describe('slugForPlaceKey', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugForPlaceKey('Bloom Cafe')).toBe('bloom-cafe')
  })

  it('strips diacritics (NFD + combining-mark removal)', () => {
    expect(slugForPlaceKey('Café Île-de-Beauté')).toBe('cafe-ile-de-beaute')
  })

  it('collapses runs of non-alphanumeric characters to a single hyphen', () => {
    expect(slugForPlaceKey('A&&&B   C!!D')).toBe('a-b-c-d')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugForPlaceKey('  --Hello World--  ')).toBe('hello-world')
  })

  it('empty input maps to "unknown"', () => {
    expect(slugForPlaceKey('')).toBe('unknown')
  })

  it('input that slugifies to nothing (pure punctuation) maps to "unknown"', () => {
    expect(slugForPlaceKey('!!!')).toBe('unknown')
  })
})

describe('buildPlaceKey', () => {
  it('uses gp:<googlePlaceId> when googlePlaceId is truthy', () => {
    expect(buildPlaceKey({ googlePlaceId: 'ChIJabc123', businessName: 'Bloom Cafe', locality: 'SW1' })).toBe(
      'gp:ChIJabc123',
    )
  })

  it('falls back to fz:<name-slug>:<locality-slug> when no googlePlaceId', () => {
    expect(buildPlaceKey({ businessName: 'Bloom Cafe', locality: 'SW1' })).toBe('fz:bloom-cafe:sw1')
  })

  it('empty/absent locality slugs to "unknown"', () => {
    expect(buildPlaceKey({ businessName: 'Bloom Cafe', locality: null })).toBe('fz:bloom-cafe:unknown')
    expect(buildPlaceKey({ businessName: 'Bloom Cafe', locality: '' })).toBe('fz:bloom-cafe:unknown')
    expect(buildPlaceKey({ businessName: 'Bloom Cafe' })).toBe('fz:bloom-cafe:unknown')
  })

  it('null/empty googlePlaceId is treated as falsy (fuzzy fallback)', () => {
    expect(buildPlaceKey({ googlePlaceId: null, businessName: 'Bloom Cafe', locality: 'SW1' })).toBe(
      'fz:bloom-cafe:sw1',
    )
    expect(buildPlaceKey({ googlePlaceId: '', businessName: 'Bloom Cafe', locality: 'SW1' })).toBe(
      'fz:bloom-cafe:sw1',
    )
  })
})

describe('hashInviteIp', () => {
  it('produces a 32-char hex hash', () => {
    const h = hashInviteIp('203.0.113.5')
    expect(h).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is deterministic for the same ip', () => {
    expect(hashInviteIp('203.0.113.5')).toBe(hashInviteIp('203.0.113.5'))
  })

  it('trims before hashing (whitespace-insensitive)', () => {
    expect(hashInviteIp('  203.0.113.5  ')).toBe(hashInviteIp('203.0.113.5'))
  })

  it('different ips hash differently', () => {
    expect(hashInviteIp('203.0.113.5')).not.toBe(hashInviteIp('203.0.113.6'))
  })
})

describe('validateInviteNote', () => {
  it('undefined -> ok, note null, held false', () => {
    expect(validateInviteNote(undefined)).toEqual({ ok: true, note: null, held: false })
  })

  it('null -> ok, note null, held false', () => {
    expect(validateInviteNote(null)).toEqual({ ok: true, note: null, held: false })
  })

  it('empty-after-trim -> ok, note null, held false', () => {
    expect(validateInviteNote('    ')).toEqual({ ok: true, note: null, held: false })
  })

  it('240 chars exactly is ok', () => {
    const note = 'a'.repeat(240)
    const res = validateInviteNote(note)
    expect(res).toEqual({ ok: true, note, held: false })
  })

  it('241 chars is not ok (INVITE_NOTE_INVALID)', () => {
    const note = 'a'.repeat(241)
    expect(validateInviteNote(note)).toEqual({ ok: false, code: 'INVITE_NOTE_INVALID' })
  })

  it('240 chars after trimming surrounding whitespace is ok', () => {
    const note = `  ${'a'.repeat(240)}  `
    const res = validateInviteNote(note)
    expect(res).toEqual({ ok: true, note: 'a'.repeat(240), held: false })
  })

  it.each([
    'Check this out http://example.com',
    'Check this out https://example.com/path?x=1',
    'visit www.example.com for more',
    'WWW.EXAMPLE.COM',
    'HTTP://EXAMPLE.COM',
  ])('rejects a note containing a URL variant: %s', (note) => {
    expect(validateInviteNote(note)).toEqual({ ok: false, code: 'INVITE_NOTE_INVALID' })
  })

  it('does not false-positive on a note with no URL', () => {
    const res = validateInviteNote('Great little coffee shop, would love this on Redeemo')
    expect(res.ok).toBe(true)
  })

  it.each(HELD_REVIEW_TERMS)('holds a note containing the term "%s" (case-insensitive) for review', (term) => {
    const note = `This place is a total ${term.toUpperCase()} honestly`
    const res = validateInviteNote(note)
    expect(res).toEqual({ ok: true, note, held: true })
  })

  it('trims the note before storing even when held', () => {
    const res = validateInviteNote('  this is a scam  ')
    expect(res).toEqual({ ok: true, note: 'this is a scam', held: true })
  })

  it('an ordinary short note is ok and not held', () => {
    const res = validateInviteNote('They do great pastries')
    expect(res).toEqual({ ok: true, note: 'They do great pastries', held: false })
  })
})
