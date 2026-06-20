'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/lib/auth/session'
import { safeNext } from '@/lib/auth/redirect'

// M1 Slice 5 review fix: bounce an already-authenticated merchant away from the auth
// screens (sign-in / register / otp / forgot / reset / claim). The middleware lets
// these paths through regardless of the session cookie, so a logged-in user could
// otherwise see a redundant login form and start a second login against a live session.
//
// Gated on session.ready so it never fires before refresh-on-mount settles (no flash,
// no redirect of a not-yet-hydrated session). Renders nothing.
export function AuthedRedirect() {
  const router = useRouter()
  const params = useSearchParams()
  const session = useSession()

  useEffect(() => {
    if (session.ready && session.isAuthenticated) {
      router.replace(safeNext(params.get('next')))
    }
  }, [session.ready, session.isAuthenticated, params, router])

  return null
}
