import React, { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { useFonts } from 'expo-font'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/design-system/motion/Toast'
import { useAuthStore } from '@/stores/auth'
import { DeepLinkListener } from '@/app-bootstrap/DeepLinkListener'
import { ReduceMotionListener } from '@/app-bootstrap/ReduceMotionListener'
import { SessionExpiredBridge } from '@/app-bootstrap/SessionExpiredBridge'

let queryClient: InstanceType<typeof QueryClient> | null = null

export default function RootLayout() {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!queryClient) queryClient = new QueryClient()
  const [fontsReady] = useFonts({
    'MusticaPro-SemiBold': require('../assets/fonts/MusticaPro-SemiBold.otf'),
    'Lato-Regular': require('../assets/fonts/Lato-Regular.ttf'),
    'Lato-Medium': require('../assets/fonts/Lato-Medium.ttf'),
    'Lato-SemiBold': require('../assets/fonts/Lato-SemiBold.ttf'),
    'Lato-Bold': require('../assets/fonts/Lato-Bold.ttf'),
  })

  const bootstrap = useAuthStore((s) => s.bootstrap)
  const status = useAuthStore((s) => s.status)
  const splashHidden = useRef(false)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (fontsReady && status !== 'bootstrapping' && !splashHidden.current) {
      splashHidden.current = true
      // Hide splash screen when ready (expo-splash-screen may not be installed in all envs)
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SplashScreen = require('expo-splash-screen') as { hideAsync: () => Promise<void> }
        SplashScreen.hideAsync().catch(() => {})
      } catch { /* not installed */ }
    }
  }, [fontsReady, status])

  if (!fontsReady || status === 'bootstrapping') return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <View style={{ flex: 1 }}>
              <DeepLinkListener />
              <ReduceMotionListener />
              <SessionExpiredBridge />
              <StatusBar style="auto" />
              <Slot />
            </View>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
