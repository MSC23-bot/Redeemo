/**
 * Badge — shared tone-aware status pill used across the admin panel.
 *
 * Tones:
 *   neutral  -> grey / muted
 *   info     -> blue
 *   warn     -> amber
 *   success  -> green
 *   danger   -> red
 */
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'info' | 'warn' | 'success' | 'danger'

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
