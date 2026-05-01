import { useRef, useState } from 'react'
import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { PROFILE_STEPS, type ProfileStep } from '@/features/profile-completion/steps'

// Sequential step map — always advances to the next step in wizard order.
// firstIncompleteRequiredStep belongs only in resolveRedirect (wizard entry),
// not here: using it here caused PC2 to be skipped when postcode was already
// saved from a previous run-through.
function nextRouteAfter(step: ProfileStep): string {
  if (step === 'pc1')             return '/(auth)/profile-completion/address'
  if (step === 'pc2')             return '/(auth)/profile-completion/interests'
  if (step === 'pc3')             return '/(auth)/profile-completion/avatar'
  /* pc4 | done */                return '/(auth)/onboarding-success'
}

export function useProfileCompletion() {
  const onboarding  = useAuthStore((s) => s.onboarding)
  const advance     = useAuthStore((s) => s.advanceProfileStep)
  const mark        = useAuthStore((s) => s.markProfileCompletion)
  const refreshUser = useAuthStore((s) => s.refreshUser)

  // Ref provides immediate synchronous dedup; state drives UI disabled feedback.
  const inFlightRef  = useRef(false)
  const [isNavigating, setIsNavigating] = useState(false)

  async function markStepComplete(step: ProfileStep) {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsNavigating(true)
    try {
      await refreshUser()
      await advance(step)
      const target = nextRouteAfter(step)
      const isExiting = target === '/(auth)/onboarding-success'
      if (isExiting) {
        await mark('completed')
        router.replace(target as Parameters<typeof router.replace>[0])
      } else {
        router.push(target as Parameters<typeof router.push>[0])
      }
    } finally {
      inFlightRef.current = false
      setIsNavigating(false)
    }
  }

  async function dismiss() {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsNavigating(true)
    try {
      await refreshUser()
      await mark('dismissed')
      router.replace('/(auth)/onboarding-success')
    } finally {
      inFlightRef.current = false
      setIsNavigating(false)
    }
  }

  return {
    currentStep: onboarding.furthestStep,
    totalSteps: PROFILE_STEPS.length,
    isNavigating,
    markStepComplete,
    dismiss,
  }
}
