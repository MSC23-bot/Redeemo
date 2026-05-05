import React from 'react'
import { render } from '@testing-library/react-native'
import { RedeemoLoader } from '@/design-system/motion/RedeemoLoader'

// Structural tests for the brand loading primitive. The actual orbit
// motion runs on the Reanimated UI thread under `withRepeat` and is
// not exercised under jest (the test setup mocks Reanimated to
// identity stubs). What we pin here is the contract the consumers
// rely on: presence, sizing, accessibility, and the static-fallback
// path under reduced-motion.

// Force motionScale to 1 (animations on) by default. Individual
// tests can re-mock to 0 to exercise the reduced-motion path.
let mockMotionScale = 1
jest.mock('@/design-system/useMotionScale', () => ({
  useMotionScale: () => mockMotionScale,
}))

describe('RedeemoLoader', () => {
  beforeEach(() => {
    mockMotionScale = 1
  })

  it('renders with the progressbar accessibility role and a default label', () => {
    const { getByLabelText } = render(<RedeemoLoader />)
    const root = getByLabelText('Loading')
    expect(root).toBeTruthy()
    // accessibilityState `busy: true` is set on the root container so
    // assistive tech announces an in-progress operation.
    expect(root.props.accessibilityState).toEqual({ busy: true })
    expect(root.props.accessibilityRole).toBe('progressbar')
  })

  it('accepts a custom accessibility label for screen readers', () => {
    const { getByLabelText } = render(
      <RedeemoLoader accessibilityLabel="Loading reviews" />,
    )
    expect(getByLabelText('Loading reviews')).toBeTruthy()
  })

  it('sizes itself to the "md" preset (48pt) by default', () => {
    const { getByLabelText } = render(<RedeemoLoader />)
    const root = getByLabelText('Loading')
    // Style is an array — flatten and check width/height
    const style = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean) as object[])
      : root.props.style
    expect(style.width).toBe(48)
    expect(style.height).toBe(48)
  })

  it('honours the "sm" preset (32pt)', () => {
    const { getByLabelText } = render(<RedeemoLoader size="sm" />)
    const root = getByLabelText('Loading')
    const style = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean) as object[])
      : root.props.style
    expect(style.width).toBe(32)
    expect(style.height).toBe(32)
  })

  it('honours the "lg" preset (80pt)', () => {
    const { getByLabelText } = render(<RedeemoLoader size="lg" />)
    const root = getByLabelText('Loading')
    const style = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean) as object[])
      : root.props.style
    expect(style.width).toBe(80)
    expect(style.height).toBe(80)
  })

  it('accepts an explicit numeric size override', () => {
    const { getByLabelText } = render(<RedeemoLoader size={22} />)
    const root = getByLabelText('Loading')
    const style = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean) as object[])
      : root.props.style
    expect(style.width).toBe(22)
    expect(style.height).toBe(22)
  })

  it('still renders the loader content under reduced motion (static fallback)', () => {
    mockMotionScale = 0
    const { getByLabelText } = render(<RedeemoLoader />)
    // Container is still present, accessibility surface intact —
    // user still sees a visible "loading" indicator even when
    // animation is disabled.
    expect(getByLabelText('Loading')).toBeTruthy()
  })
})
