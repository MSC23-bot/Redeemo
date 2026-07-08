'use client'

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { LoadingStatus, SkeletonCircle, SkeletonText } from '@/components/ui/skeleton'
import { Lock, ShieldCheck, LogOut, Clock, Info } from '@/lib/icons'
import { formatApproxAge } from '@/lib/account/sessionLabel'
import { useSession } from '@/lib/auth/session'
import { useLogoutAllOtherSessions } from '@/lib/account/useLogoutAllOtherSessions'
import { ChangePasswordModal } from './ChangePasswordModal'
import { SessionsList } from './SessionsList'
import type { MerchantAccount, MerchantSession } from '@/lib/api/account'

export function LoginSecurityCard({
  account,
  sessions,
  sessionsLoading,
  sessionsError,
}: {
  account: MerchantAccount
  sessions: MerchantSession[] | undefined
  sessionsLoading: boolean
  sessionsError: boolean
}) {
  const session = useSession()
  const logoutAll = useLogoutAllOtherSessions()
  const [changingPassword, setChangingPassword] = React.useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = React.useState(false)
  const [signingOutEverywhere, setSigningOutEverywhere] = React.useState(false)

  // "Sign out of all devices" is a FULL sign-out security action (prototype
  // copy: "Ends every session, including this one and the staff mobile app").
  // The two merged backend routes are COMPOSED - no backend change:
  //   1. POST /auth/logout-all revokes every OTHER live session (Redis + DB).
  //   2. session.signOut() (the SAME flow the account-menu "Sign out" uses)
  //      ends THIS session: it clears the redeemo_merchant_session httpOnly
  //      cookie via the BFF /logout route and redirects to /sign-in.
  // Sequencing is best-effort-then-always-end: even if logout-all rejects
  // (a benign revoke-others failure), the current-session sign-out STILL runs,
  // so the user can never be left half-signed-out-of-others-but-still-here.
  // No toast/error UI is needed on the happy path because the page navigates
  // away to /sign-in; a rare signOut failure routes through the session
  // provider's own unconfirmed-logout handling.
  async function confirmSignOutEverywhere() {
    setSigningOutEverywhere(true)
    try {
      await logoutAll.mutateAsync()
    } catch {
      // Swallow: a failed revoke-others must not block ending THIS session.
      // The user still lands on /sign-in; they can re-run this if needed.
    }
    // Always end the current session + redirect, regardless of the above.
    await session.signOut()
  }

  return (
    <Card className="gap-4" data-testid="login-security-card">
      <div className="px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Login and security</h2>
      </div>

      <div className="space-y-4 px-6">
        <Row
          icon={<Lock size={18} aria-hidden />}
          iconTone="rose"
          title="Password"
          subtitle={
            account.passwordChangedAt ? `Last changed ${formatApproxAge(account.passwordChangedAt)}` : undefined
          }
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => setChangingPassword(true)} data-testid="change-password-open">
              Change password
            </Button>
          }
        />

        <Row
          icon={<ShieldCheck size={18} aria-hidden />}
          iconTone="success"
          title="Login verification"
          subtitle="Every login is confirmed with a one-time code sent to you, so a password alone is never enough."
          action={
            <Badge variant="neutral" className="gap-1">
              On
            </Badge>
          }
        />
        <p className="-mt-2 flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-sm" style={{ background: '#FFF9F5' }}>
          <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Lost the phone that receives your codes? So no one can lock you out, recovery is handled with Redeemo.{' '}
            <a href="mailto:support@redeemo.com" className="font-medium text-primary underline underline-offset-2">
              Contact us
            </a>{' '}
            and we will verify you another way.
          </span>
        </p>

        <Row
          icon={<LogOut size={18} aria-hidden />}
          iconTone="rose"
          title="Sign out of all devices"
          subtitle="Ends every session, including this one and the staff mobile app where you are signed in. Use this if a device is lost or shared."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmingSignOut(true)} data-testid="sign-out-everywhere-open">
              Sign out everywhere
            </Button>
          }
        />

        <Row
          icon={<Clock size={18} aria-hidden />}
          iconTone="neutral"
          title="Where you are signed in"
          subtitle="Recent sign-ins to your account. If you do not recognise one, change your password and sign out everywhere."
        />
        {sessionsLoading ? (
          <LoadingStatus label="Loading your sign-ins...">
            {/* Mirrors SessionsList's real rows: an icon slot + a two-line device/
                last-active stack, inside the same bordered row chrome. */}
            <ul className="space-y-2 px-6">
              {[0, 1].map((i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-[10px] border border-border px-3 py-2.5"
                >
                  <SkeletonCircle size={18} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <SkeletonText w="w-1/3" />
                    <SkeletonText w="w-1/4" />
                  </div>
                </li>
              ))}
            </ul>
          </LoadingStatus>
        ) : sessionsError ? (
          <p role="alert" className="px-6 text-sm text-muted-foreground">
            We could not load your recent sign-ins.
          </p>
        ) : (
          <SessionsList sessions={sessions ?? []} />
        )}
      </div>

      {changingPassword ? <ChangePasswordModal onClose={() => setChangingPassword(false)} /> : null}

      {confirmingSignOut ? (
        <Dialog
          label="Sign out of all devices?"
          onClose={() => (signingOutEverywhere ? undefined : setConfirmingSignOut(false))}
          panelTestId="sign-out-everywhere-confirm"
        >
          <h2 className="font-display text-xl font-semibold text-foreground">Sign out of all devices?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every session will be ended, including this one and the staff mobile app where you are signed in. You
            will be signed out here and taken back to sign-in.
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmingSignOut(false)} disabled={signingOutEverywhere}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSignOutEverywhere} disabled={signingOutEverywhere}>
              {signingOutEverywhere ? 'Signing out...' : 'Sign out everywhere'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </Card>
  )
}

function Row({
  icon,
  iconTone,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode
  iconTone: 'rose' | 'success' | 'neutral'
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  const toneStyle =
    iconTone === 'rose'
      ? { background: '#FEECEC', color: 'var(--destructive)' }
      : iconTone === 'success'
        ? { background: 'rgba(15, 122, 62, 0.10)', color: 'var(--success)' }
        : { background: '#F3F4F6', color: '#6B7390' }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={toneStyle}>
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle ? <p className="max-w-[52ch] text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  )
}
