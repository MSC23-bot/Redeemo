import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SavedAreaHonestyHint } from '@/features/home/components/SavedAreaHonestyHint'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock')
  return {
    ...actual,
    useReducedMotion: () => true,
  }
})

describe('<SavedAreaHonestyHint>', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('renders nothing when source is coordinates', () => {
    const { queryByTestId } = render(
      <SavedAreaHonestyHint
        locationContext={{ source: 'coordinates', city: 'London', locality: null }}
      />,
    )
    expect(queryByTestId('saved-area-honesty-hint')).toBeNull()
  })

  it('renders nothing when source is none', () => {
    const { queryByTestId } = render(
      <SavedAreaHonestyHint
        locationContext={{ source: 'none', city: null, locality: null }}
      />,
    )
    expect(queryByTestId('saved-area-honesty-hint')).toBeNull()
  })

  it('renders hint with locality.name when source is profile and locality is set', () => {
    const { getByTestId, getByText } = render(
      <SavedAreaHonestyHint
        locationContext={{
          source: 'profile',
          city: 'Kirklees',
          locality: { id: 'loc-huddersfield', name: 'Huddersfield' },
        }}
      />,
    )
    expect(getByTestId('saved-area-honesty-hint')).toBeTruthy()
    expect(getByText(/Huddersfield/)).toBeTruthy()
    // §DF device-QA Round 4 — copy refreshed to single sentence
    // "Showing offers near {city} while location is off."  Drops the
    // Round 3 em-dash separator + double-clause structure.  No em
    // dashes anywhere in UI copy per DESIGN.md lock 2026-05-02.
    expect(getByText(/while location is off/)).toBeTruthy()
    expect(getByText(/Showing offers near/)).toBeTruthy()
  })

  it('falls back to city when locality is null but city is set', () => {
    const { getByTestId, getByText } = render(
      <SavedAreaHonestyHint
        locationContext={{ source: 'profile', city: 'Huddersfield', locality: null }}
      />,
    )
    expect(getByTestId('saved-area-honesty-hint')).toBeTruthy()
    expect(getByText(/Huddersfield/)).toBeTruthy()
    expect(getByText(/while location is off/)).toBeTruthy()
    expect(getByText(/Showing offers near/)).toBeTruthy()
  })

  it('renders gracefully (hidden) when both locality and city are null', () => {
    const { queryByTestId } = render(
      <SavedAreaHonestyHint
        locationContext={{ source: 'profile', city: null, locality: null }}
      />,
    )
    expect(queryByTestId('saved-area-honesty-hint')).toBeNull()
  })

  it('tap on row routes to /saved-area via router.push', () => {
    const { getByTestId } = render(
      <SavedAreaHonestyHint
        locationContext={{
          source: 'profile',
          city: null,
          locality: { id: 'loc-huddersfield', name: 'Huddersfield' },
        }}
      />,
    )
    fireEvent.press(getByTestId('saved-area-honesty-hint'))
    expect(mockPush).toHaveBeenCalledWith('/saved-area')
  })

  it('exposes a single combined a11y label on the tap target', () => {
    const { getByTestId } = render(
      <SavedAreaHonestyHint
        locationContext={{
          source: 'profile',
          city: null,
          locality: { id: 'loc-huddersfield', name: 'Huddersfield' },
        }}
      />,
    )
    const target = getByTestId('saved-area-honesty-hint')
    expect(target.props.accessibilityRole).toBe('button')
    expect(typeof target.props.accessibilityLabel).toBe('string')
    expect(target.props.accessibilityLabel).toMatch(/Huddersfield/)
    expect(target.props.accessibilityLabel).toMatch(/update/i)
    // §DF device-QA Round 4 — a11y label includes the "while
    // location is off" disclosure so screen-reader users get the
    // same fallback context as sighted users.  Copy refreshed from
    // Round 3's "Location is off — showing offers near…" (em-dash
    // construction) to a single sentence "Showing offers near
    // {city} while location is off."
    expect(target.props.accessibilityLabel).toMatch(/while location is off/i)
    expect(target.props.accessibilityLabel).toMatch(/Showing offers near/i)
    // Defensive: no em dashes in the a11y label.
    expect(target.props.accessibilityLabel).not.toMatch(/—/)
  })

  it('renders the Update label and prefers locality.name over city', () => {
    const { getByTestId, getByText } = render(
      <SavedAreaHonestyHint
        locationContext={{
          source: 'profile',
          city: 'Kirklees',
          locality: { id: 'loc-huddersfield', name: 'Huddersfield' },
        }}
      />,
    )
    expect(getByTestId('saved-area-honesty-hint')).toBeTruthy()
    expect(getByText(/Huddersfield/)).toBeTruthy()
    expect(getByText('Update')).toBeTruthy()
  })

  // The honesty hint's central promise is: it disappears once GPS lands
  // and Discovery flips `locationContext.source` from 'profile' back to
  // 'coordinates'. The transition relies on the `wasEligibleRef` /
  // `mounted` useEffect at line 79 of the component. Reduced-motion
  // collapses the exit animation to an instant unmount via setMounted
  // (false). Silent-regression risk: dropping the transition useEffect
  // would leave the banner mounted forever after a 'profile' → 'coords'
  // flip, which is the headline UX promise of the surface.
  it('unmounts when source transitions from profile → coordinates (reduced-motion path)', () => {
    const { rerender, getByTestId, queryByTestId } = render(
      <SavedAreaHonestyHint
        locationContext={{
          source: 'profile',
          city: null,
          locality: { id: 'loc-huddersfield', name: 'Huddersfield' },
        }}
      />,
    )
    // Steady eligible-state — banner mounted.
    expect(getByTestId('saved-area-honesty-hint')).toBeTruthy()

    // GPS grants → backend flips source to 'coordinates'. Under the
    // reduced-motion mock at the top of this file, the unmount is
    // synchronous (no withTiming callback chain).
    rerender(
      <SavedAreaHonestyHint
        locationContext={{ source: 'coordinates', city: 'Huddersfield', locality: null }}
      />,
    )
    expect(queryByTestId('saved-area-honesty-hint')).toBeNull()
  })
})
