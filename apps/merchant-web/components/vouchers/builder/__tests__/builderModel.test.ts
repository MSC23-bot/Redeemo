import {
  emptyBuilderState,
  toCreatePayload,
  fromDetail,
  normalizeExpiryDate,
  type BuilderState,
} from '@/components/vouchers/builder/builderModel'
import type { AvailabilityWindow } from '@/lib/api/voucher'

// Day-2 Vouchers B-1: the TIME_LIMITED availability-window round-trip + the
// defensive omit-when-not-loaded guard. The backend treats a present
// availabilityWindows key as a wholesale replace, so a TIME_LIMITED edit whose
// editor never loaded any windows MUST omit the key (never send []), or it
// silently wipes the merchant's existing windows.

const WINDOW: AvailabilityWindow = { dayOfWeek: 1, openTime: '14:00', closeTime: '17:00' }

describe('builderModel toCreatePayload - TIME_LIMITED windows', () => {
  it('CREATE: sends availabilityWindows (the loaded array, here empty) for a fresh time voucher', () => {
    const state = emptyBuilderState('time')
    const payload = toCreatePayload(state)
    expect(payload.type).toBe('TIME_LIMITED')
    // A fresh builder always knows its window state (loaded, starts empty); CREATE
    // carries it so the backend persists whatever the merchant added.
    expect(payload).toHaveProperty('availabilityWindows')
    expect(payload.availabilityWindows).toEqual([])
  })

  it('CREATE: carries the windows the merchant added', () => {
    const state: BuilderState = { ...emptyBuilderState('time'), availabilityWindows: [WINDOW] }
    const payload = toCreatePayload(state)
    expect(payload.availabilityWindows).toEqual([WINDOW])
  })

  it('EDIT with loaded windows: a description-only change still carries the same windows (never [])', () => {
    // fromDetail with a populated availabilityWindows marks the state as loaded.
    const state = fromDetail({
      type: 'TIME_LIMITED',
      title: 'Happy hour',
      description: 'Old description',
      estimatedSaving: 5,
      availabilityWindows: [WINDOW],
    })
    // The merchant only edits the description; the windows are untouched.
    state.descriptionOverride = 'A fresh new description'
    const payload = toCreatePayload(state)
    expect(payload).toHaveProperty('availabilityWindows')
    expect(payload.availabilityWindows).toEqual([WINDOW])
    expect(payload.availabilityWindows).not.toEqual([])
  })

  it('EDIT with windows NOT loaded: OMITS availabilityWindows so the backend leaves them untouched', () => {
    // fromDetail with availabilityWindows:null (not loaded) must NOT send [].
    const state = fromDetail({
      type: 'TIME_LIMITED',
      title: 'Happy hour',
      description: 'Old description',
      estimatedSaving: 5,
      availabilityWindows: null,
    })
    const payload = toCreatePayload(state)
    expect(payload).not.toHaveProperty('availabilityWindows')
  })

  it('EDIT with windows loaded as an explicit empty array: STILL sends [] (intentional clear)', () => {
    const state = fromDetail({
      type: 'TIME_LIMITED',
      title: 'Happy hour',
      estimatedSaving: 5,
      availabilityWindows: [],
    })
    const payload = toCreatePayload(state)
    expect(payload).toHaveProperty('availabilityWindows')
    expect(payload.availabilityWindows).toEqual([])
  })
})

describe('builderModel fromDetail - duplicate carries windows', () => {
  it('rehydrates the windows from the detail payload', () => {
    const state = fromDetail({
      type: 'TIME_LIMITED',
      title: 'Happy hour',
      estimatedSaving: 5,
      availabilityWindows: [WINDOW],
    })
    expect(state.pickerId).toBe('time')
    expect(state.availabilityWindows).toEqual([WINDOW])
  })
})

// Nullable-clear contract (spec 2026-07-05, D1): the three-state imageUrl /
// expiryDate representation on BuilderState + the independent per-field
// toCreatePayload coercions. `null` is the EXPLICIT clear signal and must
// survive to the outgoing payload literally; every other falsy/absent shape
// still coerces to omission (`undefined`). The two fields are independent -
// each pin below clears one field while asserting the OTHER still carries
// its saved value, guarding against the originating proposal's coupled-field
// defect (expiryDate gated on state.imageUrl).
describe('builderModel normalizeExpiryDate - nullable-clear', () => {
  it('passes an explicit null straight through (the clear signal)', () => {
    expect(normalizeExpiryDate(null)).toBeNull()
  })

  it('still coerces undefined/empty to undefined (omission, unchanged behaviour)', () => {
    expect(normalizeExpiryDate(undefined)).toBeUndefined()
    expect(normalizeExpiryDate('')).toBeUndefined()
  })

  it('still normalizes a date-only value to UTC-midnight ISO (unchanged behaviour)', () => {
    expect(normalizeExpiryDate('2026-09-30')).toBe('2026-09-30T00:00:00.000Z')
  })
})

describe('builderModel toCreatePayload - nullable-clear independence', () => {
  it('imageUrl: null clears the photo while a saved expiryDate is retained verbatim', () => {
    const state: BuilderState = {
      ...emptyBuilderState('freebie'),
      imageUrl: null,
      savedImageUrl: 'https://cdn.example/saved.png',
      expiryDate: '2026-12-01T00:00:00.000Z',
      savedExpiryDate: '2026-12-01T00:00:00.000Z',
    }
    const payload = toCreatePayload(state, 'food_drink')
    expect(payload.imageUrl).toBeNull()
    expect(payload.expiryDate).toBe('2026-12-01T00:00:00.000Z')
  })

  it('expiryDate: null clears the end date while a saved imageUrl is retained verbatim (mirror)', () => {
    const state: BuilderState = {
      ...emptyBuilderState('freebie'),
      imageUrl: 'https://cdn.example/saved.png',
      savedImageUrl: 'https://cdn.example/saved.png',
      expiryDate: null,
      savedExpiryDate: '2026-12-01T00:00:00.000Z',
    }
    const payload = toCreatePayload(state, 'food_drink')
    expect(payload.expiryDate).toBeNull()
    expect(payload.imageUrl).toBe('https://cdn.example/saved.png')
  })

  it('undefined (never set) still coerces to omission for both fields on a fresh CREATE', () => {
    const state = emptyBuilderState('freebie')
    const payload = toCreatePayload(state, 'food_drink')
    expect(payload.imageUrl).toBeUndefined()
    expect(payload.expiryDate).toBeUndefined()
  })
})
