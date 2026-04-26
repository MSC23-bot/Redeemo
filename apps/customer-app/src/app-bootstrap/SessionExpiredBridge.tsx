import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/design-system/motion/Toast'

export function SessionExpiredBridge() {
  const signOut = useAuthStore((s) => s.signOut)
  const toast = useToast()

  useEffect(() => {
    api.onSessionExpired(() => {
      toast.show('Your session has expired. Please sign in again.', 'danger')
      signOut()
    })
  }, [signOut, toast])

  return null
}
