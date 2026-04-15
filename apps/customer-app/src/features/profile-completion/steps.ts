export type ProfileStep = 'pc1' | 'pc2' | 'pc3' | 'pc4' | 'done'

const ORDER: ProfileStep[] = ['pc1', 'pc2', 'pc3', 'pc4', 'done']

export function stepIndex(step: ProfileStep): number {
  return ORDER.indexOf(step)
}
