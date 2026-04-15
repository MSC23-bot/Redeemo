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

let queryClient: QueryClient | null = null

function getQueryClient(): QueryClient {
  if (!queryClient) queryClient = new QueryClient()
  return queryClient
}

export default function RootLayout() {
  const qc = getQueryClient()
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
      // Best-effort: hide splash screen when ready
      import('expo-splash-screen').then((m) => m.hideAsync()).catch(() => {})
    }
  }, [fontsReady, status])

  if (!fontsReady || status === 'bootstrapping') return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={qc}>
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
