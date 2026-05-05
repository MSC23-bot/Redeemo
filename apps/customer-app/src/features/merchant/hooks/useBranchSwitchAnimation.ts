import { useEffect, useRef } from 'react'

/**
 * Single-trigger coordinator for branch-switch animations.
 *
 * Watches `branchId`. On the FIRST render, captures the initial value and
 * does NOT call `onFire` (skip-on-mount per spec §8.1). On every subsequent
 * change, calls `onFire` synchronously inside `useEffect` so the caller can
 * drive its Reanimated shared values in parallel from a single timeline.
 *
 * Cancel-on-rapid: the caller is responsible for cancelling its in-progress
 * animations and snapping to final state before starting new ones — the
 * standard Reanimated `withTiming(target)` pattern does this automatically
 * because re-assignment to a shared value interrupts any in-flight timing.
 */
export function useBranchSwitchAnimation(branchId: string | null, onFire: () => void): void {
  const previousId = useRef<string | null>(branchId)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      previousId.current = branchId
      return
    }
    if (branchId !== previousId.current) {
      previousId.current = branchId
      onFire()
    }
  }, [branchId, onFire])
}
