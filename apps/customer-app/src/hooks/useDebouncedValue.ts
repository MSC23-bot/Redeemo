import { useEffect, useState } from 'react'

/**
 * Generic value debouncer. Returns `value` after it has been stable for
 * `delayMs` — used for typed search input (SearchScreen) and, from Map
 * Phase 2 S5a, for FilterSheet's draft-filter live result-count preview
 * (`useFilterPreviewCount`).
 *
 * Extracted from SearchScreen's previously-local `useDebounce` so the two
 * consumers share one implementation instead of drifting copies (Map
 * Phase 2 S5a — "extract shared pieces rather than duplicating").
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
