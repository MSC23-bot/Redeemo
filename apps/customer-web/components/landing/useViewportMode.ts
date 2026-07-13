'use client'

import { useEffect, useState } from 'react'

/**
 * Layout mode for the pinned cinema sections. The Tailwind lg breakpoint
 * alone breaks on landscape phones (owner 2026-07-13): a 930x330 viewport
 * is "mobile width" but has nothing like a portrait phone's height, so
 * stacked pinned stages clip. 'short' wins over everything: any squat
 * viewport (landscape phones, small tablet-landscape windows) gets a
 * side-by-side treatment sized against height, not width.
 */
export type ViewportMode = 'desktop' | 'tablet' | 'mobile' | 'short'

export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>('mobile')

  useEffect(() => {
    const short = window.matchMedia('(max-height: 540px)')
    const desktop = window.matchMedia('(min-width: 1024px)')
    const tablet = window.matchMedia('(min-width: 768px)')
    const update = () =>
      setMode(short.matches ? 'short' : desktop.matches ? 'desktop' : tablet.matches ? 'tablet' : 'mobile')
    update()
    for (const mq of [short, desktop, tablet]) mq.addEventListener('change', update)
    return () => {
      for (const mq of [short, desktop, tablet]) mq.removeEventListener('change', update)
    }
  }, [])

  return mode
}
