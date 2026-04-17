import { router } from 'expo-router'
import { useAuthStore } from '@/stores/auth'
import { PROFILE_STEPS, nextStep, stepIndex, type ProfileStep } from '@/features/profile-completion/steps'

const stepToRoute: Record<string, string> = {
  pc1: 'about',
  pc2: 'address',
  pc3: 'interests',
  pc4: 'avatar',
}

export function useProfileCompletion() {
  const onboarding = useAuthStore((s) => s.onboarding)
  const advance = useAuthStore((s) => s.advanceProfileStep)
  const mark = useAuthStore((s) => s.markProfileCompletion)

  async function markStepComplete(step: ProfileStep) {
    const next = nextStep(step)
    if (next === 'done') {
      await advance(step)
      await mark('completed')
      router.replace('/(auth)/subscribe-prompt')
    } else {
      await advance(next)
      const route = stepToRoute[next] ?? 'about'
      router.replace(`/(auth)/profile-completion/${route}`)
    }
  }

  async function dismiss() {
    await mark('dismissed')
    router.replace('/(auth)/subscribe-prompt')
  }

  return { currentStep: onboarding.furthestStep, totalSteps: PROFILE_STEPS.length, markStepComplete, dismiss }
}
