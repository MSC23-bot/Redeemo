'use client'

import { useSpring, type MotionValue } from 'framer-motion'

/**
 * Keeps a scroll-linked value on the JS animation path. Chrome promotes
 * directly-bound scroll transforms to native ScrollTimeline animations, and
 * that promotion misbinds for stacked layers (inline style froze at 1 while
 * the native animation drove the computed value elsewhere). The spring both
 * defeats the promotion and softens the motion.
 */
export function useScrollLinked(value: MotionValue<number>) {
  return useSpring(value, { stiffness: 320, damping: 40, mass: 0.5 })
}
