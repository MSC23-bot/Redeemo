import {
  emptyBuilderState,
  toCreatePayload,
  fromDetail,
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
