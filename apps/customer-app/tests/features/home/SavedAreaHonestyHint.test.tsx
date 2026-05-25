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
    // §DF device-QA Round 5 — owner-locked structural rework.
    // Round 4 shipped a single sentence; Round 5 stacks the surface
    // into a status title + body line.  Locked copy:
    //   Title: "Your location is off"
    //   Body:  "Showing offers near {city} from your profile location."
    expect(getByText('Your location is off')).toBeTruthy()
    expect(getByText(/from your profile location/)).toBeTruthy()
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
    // §DF Round 5 — refreshed structure preserved on the city fallback.
    expect(getByText('Your location is off')).toBeTruthy()
    expect(getByText(/from your profile location/)).toBeTruthy()
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
    // §DF device-QA Round 5 — a11y label updated to match the new
    // stacked title + body structure.  Status framing leads ("Your
    // location is off"), city context follows ("Showing offers near
    // {city} from your profile location.").
    expect(target.props.accessibilityLabel).toMatch(/Your location is off/i)
    expect(target.props.accessibilityLabel).toMatch(/from your profile location/i)
    expect(target.props.accessibilityLabel).toMatch(/Showing offers near/i)
    // Defensive: no em dashes in the a11y label.
    expect(target.props.accessibilityLabel).not.toMatch(/—/)
  })

  // §DF Round 5 — pin the stacked structure via separate testID hooks
  // for title + body.  Silent-regression risk: a refactor that collapses
  // back to one Text node would lose the typography distinction (title
  // is heading.sm Lato Semibold 16/22 navy, body is body.sm Lato Regular
  // 14/20 secondary).
  it('renders the title and body as separate Text nodes (stacked structure)', () => {
    const { getByTestId } = render(
      <SavedAreaHonestyHint
        locationContext={{
          source: 'profile',
          city: 'Kirklees',
          locality: { id: 'loc-huddersfield', name: 'Huddersfield' },
        }}
      />,
    )
    expect(getByTestId('saved-area-honesty-hint-title')).toBeTruthy()
    expect(getByTestId('saved-area-honesty-hint-body')).toBeTruthy()
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
