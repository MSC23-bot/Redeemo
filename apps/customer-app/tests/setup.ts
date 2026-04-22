import '@testing-library/jest-native/extend-expect'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
      ScrollView: React.forwardRef((p: object, r: unknown) => React.createElement(View, { ...p, ref: r })),
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
    Easing: {
      bezier: () => (x: number) => x,
      inOut: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      linear: (x: number) => x,
    },
  }
})
