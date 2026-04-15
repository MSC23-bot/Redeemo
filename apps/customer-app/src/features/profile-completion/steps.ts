export const PROFILE_STEPS = ['pc1', 'pc2', 'pc3', 'pc4'] as const
export type ProfileStep = typeof PROFILE_STEPS[number] | 'done'

export function stepIndex(step: ProfileStep): number {
  return step === 'done' ? PROFILE_STEPS.length : PROFILE_STEPS.indexOf(step as typeof PROFILE_STEPS[number])
}

export function nextStep(current: ProfileStep): ProfileStep {
  const idx = stepIndex(current)
  if (idx < 0 || idx >= PROFILE_STEPS.length - 1) return 'done'
  return PROFILE_STEPS[idx + 1]!
}
