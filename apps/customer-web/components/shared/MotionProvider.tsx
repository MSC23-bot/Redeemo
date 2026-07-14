'use client'

import { MotionConfig } from 'framer-motion'

/**
 * Site-wide motion policy: every framer-motion animation respects the visitor's
 * prefers-reduced-motion setting (transforms are skipped; opacity fades remain,
 * which keeps whileInView content from being hidden for reduced-motion visitors).
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
