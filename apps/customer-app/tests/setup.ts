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
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      ScrollView: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      // RNGH calls Animated.createAnimatedComponent() at module-load time to
      // wrap its gesture detector. Stub returns the component unchanged so
      // tests that import gesture-handler don't crash on load.
      createAnimatedComponent: (C: React.ComponentType<unknown>) => C,
    },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withRepeat: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
    // RNGH internal hooks — return identity functions so gesture-handler
    // module-load + render code paths don't crash. Tests don't actually
    // exercise gestures.
    useEvent: () => () => {},
    useHandler: () => ({ context: {}, doDependenciesDiffer: false }),
    useAnimatedReaction: () => {},
    useAnimatedScrollHandler: () => () => {},
    useAnimatedGestureHandler: () => () => {},
    Easing: {
      bezier: () => (x: number) => x,
      inOut: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      linear: (x: number) => x,
    },
    // Layout-animation entering/exiting helpers — chainable no-op stub.
    // Self-referential so arbitrary chains resolve (e.g. FadeInDown.delay(80)
    // .duration(300).springify()). Each method returns the same object so any
    // sequence of `.delay().duration().springify().damping().mass()` etc.
    // works for the test render without running real animations.
    FadeInDown:  (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    FadeIn:      (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    FadeInUp:    (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    FadeOut:     (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    FadeOutUp:   (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    FadeOutDown: (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    SlideInDown: (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    SlideInUp:   (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    SlideOutDown:(() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
    SlideOutUp:  (() => { const c: any = {}; c.delay = () => c; c.duration = () => c; c.springify = () => c; c.damping = () => c; c.mass = () => c; return c })(),
  }
})
