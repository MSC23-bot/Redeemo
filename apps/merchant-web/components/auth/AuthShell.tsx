import { type ReactNode } from 'react'
import { Card } from '@/components/ui/card'

// M1 Slice 2: shared chrome for every (auth) screen. Brand lockup + a single card
// holding the title, optional subtitle, and the screen's form. Centred by the
// (auth) layout.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <span
          className="font-display text-2xl font-semibold"
          style={{
            backgroundImage: 'var(--brand-gradient)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          Redeemo
        </span>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">for Business</p>
      </div>
      <Card>
        <div className="space-y-1 px-6">
          <h1 className="font-display text-xl font-semibold text-foreground">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="px-6">{children}</div>
      </Card>
      {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  )
}
