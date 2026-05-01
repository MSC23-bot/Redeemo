import { Dimensions } from 'react-native'

const { width: SCREEN_W } = Dimensions.get('window')
const BASE_W = 375

const RATIO = Math.max(1, SCREEN_W / BASE_W)

export function scale(n: number): number {
  return RATIO * n
}

export function ms(n: number, factor = 0.5): number {
  return n + (RATIO * n - n) * factor
}
