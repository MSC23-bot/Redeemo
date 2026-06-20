import { Suspense, type ReactNode } from 'react'
import { AuthedRedirect } from '@/components/auth/AuthedRedirect'

// M1 Slice 2: the (auth) group layout. A clean centred page (NO MerchantPortalShell),
// distinct from the (app) layout. Public; the middleware excludes these paths.
//
// AuthedRedirect (Slice 5 review fix) bounces an already-authenticated merchant away
// from the auth screens. It reads ?next via useSearchParams, so it lives behind a
// Suspense boundary to avoid forcing the whole route into client-side rendering.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Suspense fallback={null}>
        <AuthedRedirect />
      </Suspense>
      {children}
    </main>
  )
}
