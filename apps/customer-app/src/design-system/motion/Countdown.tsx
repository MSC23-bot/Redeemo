import React, { useEffect, useRef, useState } from 'react'
import { Text } from '../Text'

export function Countdown({ seconds, onDone, format }: { seconds: number; onDone?: () => void; format?: (n: number) => string }) {
  const [remaining, setRemaining] = useState(seconds)
  const doneRef = useRef(false)
  useEffect(() => { setRemaining(seconds); doneRef.current = false }, [seconds])
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          if (!doneRef.current) { doneRef.current = true; onDone?.() }
          clearInterval(id)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [onDone])
  return <Text variant="label.md" color="secondary" accessibilityLiveRegion="polite">{format ? format(remaining) : `${remaining}s`}</Text>
}
