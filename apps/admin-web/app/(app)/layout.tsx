import type { ReactNode } from 'react'
import { AdminShell } from '@/components/admin-shell'

/**
 * Layout for the protected (app) route group. AdminShell enforces auth (redirect
 * to /login when signed out) and renders the header + brand surface around the
 * page content.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
