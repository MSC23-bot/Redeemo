import { useFonts as useExpoFonts } from 'expo-font'

export function useFonts() {
  const [loaded, error] = useExpoFonts({
    'MusticaPro-SemiBold': require('../../assets/fonts/MusticaPro-SemiBold.otf'),
    'Lato-Regular':        require('../../assets/fonts/Lato-Regular.ttf'),
    'Lato-Medium':         require('../../assets/fonts/Lato-Medium.ttf'),
    'Lato-SemiBold':       require('../../assets/fonts/Lato-SemiBold.ttf'),
    'Lato-Bold':           require('../../assets/fonts/Lato-Bold.ttf'),
  })
  return { loaded, error }
}
