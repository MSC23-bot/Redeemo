import { useEffect } from 'react'
import * as Linking from 'expo-linking'
import { router } from 'expo-router'
import { parseResetPasswordUrl } from '@/lib/deep-link'

export function DeepLinkListener() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return
      const token = parseResetPasswordUrl(url)
      if (token) router.replace({ pathname: '/(auth)/reset-password', params: { token } })
    }
    Linking.getInitialURL().then(handle)
    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [])
  return null
}
