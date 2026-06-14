'use client'

/**
 * Protected admin shell.
 *
 * Guards the (app) route group: while the session is still resolving from
 * localStorage it shows a quiet loading state; once resolved, an unauthenticated
 * visitor is redirected to /login and an authenticated one sees the header
 * ("Redeemo Admin", the signed-in role badge, a Logout button) over the calm
 * brand surface, then the page content.
 *
 * The nav is capability-aware by construction: NAV_ITEMS are filtered by
 * `can(cap)` so future actioner screens light up automatically per role. M1 ships
 * no actioner items, so the filtered list is empty and no nav renders yet.
 */
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, LogOut, Loader2 } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { authApi } from '@/lib/api/auth'
import { clearSession, type AdminCapability } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/notification-bell'

type NavItem = { label: string; href: string; cap: AdminCapability }

// Future actioner screens declare the capability they require. Filtered by
// `can(cap)` below.
const NAV_ITEMS: NavItem[] = [
  { label: 'Approval queue', href: '/queue', cap: 'approval:read' },
]

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
      {role}
    </span>
  )
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { ready, isAuthenticated, role, can } = useSession()

  // This effect and the not-ready/not-authenticated render guard below are an
  // intentional pair, not redundant: the effect performs the navigation to
  // /login, while the render guard returns a placeholder so protected chrome
  // never flashes before the redirect lands. Removing either would either skip
  // the redirect or briefly expose protected content — keep both.
  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/login')
    }
  }, [ready, isAuthenticated, router])

  async function onLogout() {
    try {
      await authApi.logout()
    } catch {
      // Best-effort: even if the server call fails, clear locally and leave.
    } finally {
      clearSession()
      router.replace('/login')
    }
  }

  // Still reading storage, or about to bounce to /login: show a calm placeholder
  // rather than flashing protected chrome. Paired with the redirect effect above
  // (the effect navigates; this guard prevents the protected content flash) —
  // neither is redundant.
  if (!ready || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-label="Loading"
        />
      </div>
    )
  }

  const navItems = NAV_ITEMS.filter((item) => can(item.cap))

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <span className="font-semibold text-foreground">Redeemo Admin</span>
          </div>

          {navItems.length > 0 ? (
            <nav className="flex items-center gap-4 text-sm">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          ) : null}

          <div className="flex items-center gap-3">
            <NotificationBell />
            {role ? <RoleBadge role={role} /> : null}
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="size-4" aria-hidden="true" />
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  )
}
