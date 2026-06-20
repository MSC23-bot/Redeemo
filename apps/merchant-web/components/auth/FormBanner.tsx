import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// M1 Slice 2: inline form feedback banner. role=alert for the error/success tones so
// the message is announced; info is a quiet helper.
const TONES: Record<'error' | 'success' | 'info', string> = {
  error: 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-bg)] text-[var(--danger)]',
  success: 'border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[#EAF7EF] text-[var(--success)]',
  info: 'border-border bg-tint text-foreground',
}

export function FormBanner({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info'
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={cn('rounded-md border px-3 py-2 text-sm', TONES[tone])}
    >
      {children}
    </div>
  )
}
