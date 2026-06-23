'use client'

/**
 * Staff & Access (v1) PR-C C5: the invite-delivery confirmation, driven by the
 * API's NON-SECRET `inviteDelivery` status (spec §5.1.2). It NEVER claims an email
 * was delivered while delivery is dark, and it NEVER renders a token / claim link
 * (the API does not return one).
 *
 *   EMAIL_DARK : generic operator copy ("Invite created. Email delivery is not live
 *                yet ...") - must not say "email sent" / "delivered".
 *   QUEUED     : "Invite email queued for {email}." (queued != delivered).
 *
 * House style: brand tokens, no em-dashes, SVG icons not emojis.
 */
import * as React from 'react'
import { CheckCircle2, Info } from '@/lib/icons'

export interface InviteDelivery {
  inviteDelivery: 'EMAIL_DARK' | 'QUEUED'
  email: string
}

export function InviteDeliveryNotice({ result }: { result: InviteDelivery }) {
  const dark = result.inviteDelivery === 'EMAIL_DARK'
  return (
    <div
      role="status"
      data-testid="invite-delivery-notice"
      data-delivery={result.inviteDelivery}
      className="flex items-start gap-3 rounded-[14px] p-4"
      style={
        dark
          ? { background: 'var(--warning-bg)', border: '1px solid #F3D8AE' }
          : { background: 'var(--tint)', border: '1px solid var(--border-subtle)' }
      }
    >
      {dark ? (
        <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
      ) : (
        <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
      )}
      <div className="text-sm" style={{ color: dark ? 'var(--warning)' : 'var(--text-secondary)' }}>
        {dark ? (
          <>
            <p className="font-semibold">Invite created.</p>
            <p>
              Email delivery is not live yet, so {result.email} has not received a sign-in link. An admin
              will share the link with them directly.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Invite email queued for {result.email}.</p>
            <p>They will receive a sign-in link to set their own password.</p>
          </>
        )}
      </div>
    </div>
  )
}
