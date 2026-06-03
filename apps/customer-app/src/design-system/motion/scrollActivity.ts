import { makeMutable } from 'react-native-reanimated'

/**
 * Global UI-thread flag: 1 while a long feed (e.g. Home) is actively scrolling.
 *
 * The looping animations (PulsingDot, TrendingFlame, RailIconMotion) watch this
 * and PAUSE while it's 1, so dozens of per-frame transform updates don't compete
 * with the scroll for the UI thread (which produced the micro-stutter). The
 * scrolling screen flips it via its scroll handlers (begin → 1, fully stopped →
 * 0); it stays 0 everywhere else, so off-feed animations run normally.
 *
 * It's a `makeMutable` singleton (not a hook) so any component can read it on the
 * UI thread without prop-drilling or context re-renders.
 */
export const scrollActivity = makeMutable<number>(0)
