import '@testing-library/jest-native/extend-expect'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)

// Fix: expo/src/winter/ImportMetaRegistry hangs jest in SDK 53/54 because it tries
// to register import.meta.url for every module, which never resolves in jest.
// Confirmed fix: https://github.com/expo/expo/issues/36831
jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: {
    get url() { return null },
  },
}))

// structuredClone polyfill — required by some expo internals in jest environment
if (typeof global.structuredClone === 'undefined') {
  ;(global as unknown as Record<string, unknown>).structuredClone = (obj: unknown) =>
    JSON.parse(JSON.stringify(obj))
}

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  // Chainable no-op for entering/exiting builders (FadeInDown.delay(120).duration(320) etc.)
  const entering: Record<string, unknown> = {}
  const chainable: Record<string, (...args: unknown[]) => unknown> = {
    delay: () => chainable,
    duration: () => chainable,
    springify: () => chainable,
    damping: () => chainable,
    stiffness: () => chainable,
    mass: () => chainable,
    build: () => entering,
  }
  const makeBuilder = () => chainable
  const createAnimatedComponent = (component: unknown) => component
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      ScrollView: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      createAnimatedComponent,
    },
    createAnimatedComponent,
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withRepeat: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    FadeIn: makeBuilder(),
    FadeInDown: makeBuilder(),
    FadeInUp: makeBuilder(),
    FadeOut: makeBuilder(),
    FadeOutDown: makeBuilder(),
    FadeOutUp: makeBuilder(),
    SlideInDown: makeBuilder(),
    SlideInUp: makeBuilder(),
    SlideOutDown: makeBuilder(),
    SlideOutUp: makeBuilder(),
    ZoomIn: makeBuilder(),
    ZoomOut: makeBuilder(),
    Easing: {
      bezier: () => (x: number) => x,
      inOut: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      linear: (x: number) => x,
    },
  }
})

// RNGH Gesture / GestureDetector stubs (v2 API used in PC2 edge-swipe)
jest.mock('react-native-gesture-handler', () => {
  const React = require('react') as typeof import('react')
  const { View } = require('react-native') as typeof import('react-native')
  const makeGesture = (): Record<string, unknown> => {
    const g: Record<string, unknown> = {}
    ;['activeOffsetX','failOffsetY','onBegin','onEnd','onFinalize','onUpdate',
      'enabled','simultaneousWithExternalGesture','withRef','hitSlop',
      'shouldCancelWhenOutside','minDistance','maxDist','runOnJS',
      'manualActivation','numberOfTaps','minVelocity','maxPointers'].forEach(
      (m) => { g[m] = () => g }
    )
    return g
  }
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: React.forwardRef((p: object, r: unknown) =>
      React.createElement(View, { ...p, ref: r } as any)
    ),
    Gesture: {
      Pan: makeGesture,
      Tap: makeGesture,
      Simultaneous: makeGesture,
      Race: makeGesture,
      Exclusive: makeGesture,
    },
    ScrollView: React.forwardRef((p: object, r: unknown) =>
      React.createElement(View, { ...p, ref: r } as any)
    ),
    State: { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 },
    Directions: { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 },
  }
})

// useIsFocused is called unconditionally by the verify-email/phone polling
// hooks. In production every screen mounts inside a React Navigation context.
// In tests we render hooks/components in isolation outside any nav container,
// so we mock the hook to return `true` (treat all rendered hooks as focused).
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}))
