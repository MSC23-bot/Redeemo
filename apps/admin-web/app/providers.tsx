'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from '@/lib/auth/useSession'

/**
 * App-wide client providers. React Query is the admin data layer (Phase B+ wires
 * the real queries). One QueryClient per browser session, created lazily so it is
 * never shared across requests on the server. SessionProvider exposes the
 * signed-in admin's auth state ({ isAuthenticated, role, can }) to client
 * components (login flow, protected shell, root redirect).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  )
}
