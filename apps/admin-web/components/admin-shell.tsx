'use client'

/**
 * Protected admin shell.
 *
 * Guards the (app) route group: `middleware.ts` gates on the httpOnly session
 * cookie's PRESENCE before this ever paints, but the cookie carries no access
 * token (httpOnly means middleware cannot mint one), so the shell's own
 * `ready` gate here means "the bootstrap refresh-on-mount settled" (G1,
 * lib/auth/useSession.ts), not merely "mounted" — while that first BFF refresh
 * is in flight it shows a quiet loading state; once it settles, an
 * unauthenticated visitor (no valid cookie / refresh failed) is redirected to
 * /login and an authenticated one sees the header ("Redeemo Admin", the
 * signed-in role badge, a Logout button) over the calm brand surface, then the
 * page content.
 *
 * The nav is capability-aware by construction: NAV_ITEMS are filtered by
 * `can(cap)` so each item shows only for roles that hold its capability, and new
 * actioner screens light up automatically per role as they land. The current
 * items are Approval queue (`approval:read`), Merchants (`merchant:read`),
 * Leads and onboarding (`merchant:create-draft`), and Redemptions
 * (`redemption:read`). The filter is fail-closed: a role that lacks an item's
 * capability never sees it (and the backend 403 is the enforcement backstop),
 * so a role with none of these capabilities renders no nav.
 */
import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, LogOut, Loader2 } from 'lucide-react'
import { useSession } from '@/lib/auth/useSession'
import { type AdminCapability } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/notification-bell'

type NavItem = { label: string; href: string; cap: AdminCapability }

// Actioner screens declare the capability they require. Filtered by `can(cap)`
// below, so each nav item shows only for roles that hold its capability.
const NAV_ITEMS: NavItem[] = [
  { label: 'Approval queue', href: '/queue', cap: 'approval:read' },
  { label: 'Merchants', href: '/merchants', cap: 'merchant:read' },
  // C1: gated on merchant:create-draft (the hub's primary action capability),
  // not the lower merchant:read bar the /leads PAGE itself uses: a role that
  // can view merchants but not create a draft never sees this nav entry, even
  // though it could still reach /leads directly and see it read-only.
  { label: 'Leads and onboarding', href: '/leads', cap: 'merchant:create-draft' },
  // D67: read-only cross-merchant redemptions list.
  { label: 'Redemptions', href: '/redemptions', cap: 'redemption:read' },
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
  const { ready, isAuthenticated, role, can, signOut } = useSession()

  // This effect and the not-ready/not-authenticated render guard below are an
  // intentional pair, not redundant: the effect performs the navigation to
  // /login, while the render guard returns a placeholder so protected chrome
  // never flashes before the redirect lands. Removing either would either skip
  // the redirect or briefly expose protected content — keep both. `ready` only
  // flips once the G1 bootstrap refresh-on-mount has settled (see the module
  // doc comment above), so this never fires before that has been tried.
  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.replace('/login')
    }
  }, [ready, isAuthenticated, router])

  // signOut (G2) forwards the captured bearer to the BFF logout route, awaits
  // its bounded cookie-clearing response, then clears local state and
  // navigates to /login — see lib/auth/useSession.ts.
  async function onLogout() {
    await signOut()
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
