'use client'

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { Lock, ShieldCheck, LogOut, Clock, Info } from '@/lib/icons'
import { formatApproxAge } from '@/lib/account/sessionLabel'
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
  const { toast } = useToast()
  const logoutAll = useLogoutAllOtherSessions()
  const [changingPassword, setChangingPassword] = React.useState(false)
  const [confirmingSignOut, setConfirmingSignOut] = React.useState(false)
  const [signOutError, setSignOutError] = React.useState<string | null>(null)

  async function confirmSignOutEverywhere() {
    setSignOutError(null)
    try {
      await logoutAll.mutateAsync()
      setConfirmingSignOut(false)
      toast({ message: 'Signed out of your other devices.', variant: 'success' })
    } catch {
      setSignOutError('We could not sign out your other devices. Please try again.')
    }
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
          subtitle="Signs out every other session, including the staff mobile app where you are signed in, and keeps this one signed in. Use this if a device is lost or shared."
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
          <p role="status" className="px-6 text-sm text-muted-foreground">
            Loading your sign-ins...
          </p>
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
          label="Sign out of your other devices?"
          onClose={() => setConfirmingSignOut(false)}
          panelTestId="sign-out-everywhere-confirm"
        >
          <h2 className="font-display text-xl font-semibold text-foreground">Sign out of your other devices?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Every other signed-in session (including the staff mobile app) will be ended. This session stays
            signed in.
          </p>
          {signOutError ? (
            <p role="alert" className="mt-3 text-sm font-medium" style={{ color: 'var(--destructive)' }}>
              {signOutError}
            </p>
          ) : null}
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmingSignOut(false)} disabled={logoutAll.isPending}>
              Stay signed in everywhere
            </Button>
            <Button type="button" onClick={confirmSignOutEverywhere} disabled={logoutAll.isPending}>
              {logoutAll.isPending ? 'Signing out...' : 'Sign out everywhere'}
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
