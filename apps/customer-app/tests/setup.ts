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
      ScrollView: React.forwardRef((p: object, r: React.Ref<unknown>) => {
        // Expose scrollTo/scrollToEnd so screens that imperatively call
        // scrollViewRef.current?.scrollTo (e.g. HomeScreen's ?scrollTop=1
        // reset) don't throw under the plain View stub. On device the real
        // Animated.ScrollView ref forwards these from the inner ScrollView.
        React.useImperativeHandle(r, () => ({ scrollTo: () => {}, scrollToEnd: () => {} }), [])
        return React.createElement(View, p)
      }),
      // RNGH calls Animated.createAnimatedComponent() at module-load time to
      // wrap its gesture detector. Stub returns the component unchanged so
      // tests that import gesture-handler don't crash on load.
      createAnimatedComponent: (C: React.ComponentType<unknown>) => C,
    },
    useSharedValue: (v: unknown) => ({ value: v }),
    // Imperative shared value (module-level singletons, e.g. scrollActivity).
    makeMutable: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    // Scroll-linked offset hooks (PR A sticky Home header). useAnimatedRef
    // returns a ref object React mutates on mount; useScrollViewOffset returns
    // a static shared value (worklets don't run under jest, so the collapse
    // fade is device-QA-verified, not unit-asserted).
    useAnimatedRef: () => ({ current: null }),
    useScrollViewOffset: () => ({ value: 0 }),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withRepeat: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
    cancelAnimation: (_v: unknown) => {},
    // RNGH internal hooks — return identity functions so gesture-handler
    // module-load + render code paths don't crash. Tests don't actually
    // exercise gestures.
    useEvent: () => () => {},
    useHandler: () => ({ context: {}, doDependenciesDiffer: false }),
    useAnimatedReaction: () => {},
    useAnimatedScrollHandler: () => () => {},
    useAnimatedGestureHandler: () => () => {},
    // Reduced-motion + interpolation primitives (added 2026-05-06 for
    // VoucherDetail CollapsedHeader). Stubs return safe defaults: no
    // reduced motion, identity interpolation, sentinel Extrapolation
    // values. Components that call these execute their non-reduced-
    // motion / non-clamped paths under jest.
    useReducedMotion: () => false,
    interpolate: (value: number, _input: number[], output: number[]) => {
      // Identity-like fallback: return the first output value so
      // animated styles render without NaN. Tests asserting render
      // (not numeric output) don't depend on the actual interpolation.
      return output[0] ?? value
    },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
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
