import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { PROFILE_STEPS, nextStep, stepIndex, type ProfileStep } from '@/features/profile-completion/steps'

export function useProfileCompletion() {
  const onboarding = useAuthStore((s) => s.onboarding)
  const advance = useAuthStore((s) => s.advanceProfileStep)
  const mark = useAuthStore((s) => s.markProfileCompletion)

  async function markStepComplete(step: ProfileStep) {
    const currentIdx = stepIndex(onboarding.furthestStep)
    const newIdx = stepIndex(step)
    if (newIdx > currentIdx) await advance(step)
    const next = nextStep(step)
    if (next === 'done') {
      await mark('completed')
      router.replace('/(auth)/subscribe-prompt')
    } else {
      router.push(`/(auth)/profile-completion/${next}`)
    }
  }

  async function dismiss() {
    await mark('dismissed')
    router.replace('/(auth)/subscribe-prompt')
  }

  return { currentStep: onboarding.furthestStep, totalSteps: PROFILE_STEPS.length, markStepComplete, dismiss }
}
