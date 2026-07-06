'use client'

// Business Profile M2: the "Business contact" card (prototype 01/03) - the
// account OWNER's own personal contact (Business Profile M1's ownerContact block,
// resolved by merchantId so every active member sees the same owner details). Pure
// read-only, no edit affordance at all: the note + link route to My account, which
// owns the owner's own personal-details editing.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Mail, Phone } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { businessInitials } from '@/components/shell/AccountMenu'
import { formatOwnerName, formatOwnerPhone } from '@/lib/business-profile/format'
import type { MerchantProfile } from '@/lib/api/profile'

export function BusinessContactCard({ profile }: { profile: MerchantProfile }) {
  const owner = profile.ownerContact ?? null
  const name = owner ? formatOwnerName(owner.firstName, owner.lastName) : ''
  const phone = owner ? formatOwnerPhone(owner.phone, owner.phoneCountryCode) : null
  const email = owner?.email?.trim() || null
  const roleLine = owner?.jobTitle?.trim() || 'Owner'
  const initials = businessInitials(name || null)

  return (
    <Card className="gap-4" data-testid="business-profile-contact-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Business contact</h2>
        <Badge variant="neutral">Read only</Badge>
      </div>

      <div className="space-y-4 px-6">
        {owner ? (
          <>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: 'var(--navy)' }}
              >
                {initials}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{name || 'Account owner'}</p>
                <p className="text-xs text-muted-foreground">{roleLine}</p>
              </div>
            </div>

            <div className="space-y-2">
              {email ? (
                <ContactRow icon={<Mail size={16} aria-hidden />} value={email} />
              ) : null}
              {phone ? (
                <ContactRow icon={<Phone size={16} aria-hidden />} value={phone} />
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">We could not find an account owner for this business.</p>
        )}

        <div
          className="flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-xs"
          style={{ background: 'var(--tint)', color: 'var(--text-secondary)' }}
        >
          <span>
            These are the account owner&rsquo;s own details. Edit them under{' '}
            <Link href="/account" className="font-semibold underline" style={{ color: 'var(--rose)' }}>
              My account
            </Link>
            .
          </span>
        </div>
      </div>
    </Card>
  )
}

function ContactRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span aria-hidden style={{ color: 'var(--text-tertiary)' }}>
        {icon}
      </span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}
