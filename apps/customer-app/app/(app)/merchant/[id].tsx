// Route file. Thin wrapper that reads the dynamic id segment and hands off
// to the screen component. Real UI lives in the screen file (M1 ships only
// the data-layer skeleton; M2 wires the full surface).
import { useLocalSearchParams } from 'expo-router'
import { MerchantProfileScreen } from '@/features/merchant/screens/MerchantProfileScreen'

export default function MerchantProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <MerchantProfileScreen id={typeof id === 'string' ? id : undefined} />
}
