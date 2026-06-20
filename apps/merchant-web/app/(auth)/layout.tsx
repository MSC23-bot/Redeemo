import { type ReactNode } from 'react'

// M1 Slice 2: the (auth) group layout. A clean centred page (NO MerchantPortalShell),
// distinct from the (app) layout. Public; the middleware excludes these paths.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      {children}
    </main>
  )
}
