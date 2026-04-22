import React from 'react'
import { FadeInDown } from './FadeIn'
import { motion } from '../tokens'

export function StaggerList({ children, step = motion.stagger }: { children: React.ReactNode; step?: number }) {
  const items = React.Children.toArray(children)
  return (
    <>
      {items.map((c, i) => (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <FadeInDown key={(c as any).key ?? i} delay={i * step}>{c}</FadeInDown>
      ))}
    </>
  )
}
