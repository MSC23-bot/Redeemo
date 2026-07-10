/**
 * Badge — shared tone-aware status pill used across the admin panel.
 *
 * Tones:
 *   neutral  -> grey / muted
 *   info     -> blue
 *   warn     -> amber
 *   success  -> green
 *   danger   -> red
 *   cyan     -> cyan (Approval Queue B1: onboarding type-chip group)
 *   violet   -> violet (Approval Queue B1: voucher type-chip group)
 *
 * cyan/violet were added for the Approval Queue two-court row treatments
 * (see `lib/ui/adminTones.ts`): the design spec calls for four visually
 * distinct type-chip hues (onboarding/voucher/merchant-edit/branch-lifecycle)
 * and only two hues (blue via `info`, green via `success`) already existed
 * here. Both new tones reuse Tailwind's own colour scale in the SAME
 * border-200/bg-50/text-700 pattern as every tone above — no bespoke hex
 * values, no parallel colour system.
 */
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'info' | 'warn' | 'success' | 'danger' | 'cyan' | 'violet'

interface BadgeProps {
  tone: BadgeTone
  children: ReactNode
  className?: string
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border border-border bg-secondary text-secondary-foreground',
  info: 'border border-blue-200 bg-blue-50 text-blue-700',
  warn: 'border border-amber-200 bg-amber-50 text-amber-700',
  success: 'border border-green-200 bg-green-50 text-green-700',
  danger: 'border border-red-200 bg-red-50 text-red-700',
  cyan: 'border border-cyan-200 bg-cyan-50 text-cyan-700',
  violet: 'border border-violet-200 bg-violet-50 text-violet-700',
}

export function Badge({ tone, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
