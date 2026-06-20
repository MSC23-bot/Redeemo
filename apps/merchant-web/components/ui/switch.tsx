'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Switch: a 44x26 toggle for the branch step (F4 per-day open/closed + Open-24h).
// Brand red->coral gradient track when on, neutral when off. Controlled only
// (checked + onCheckedChange). role="switch" + aria-checked for accessibility; the
// `label` becomes the accessible name. data-state ('on'/'off') for assertions.

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Accessible name (aria-label). */
  label: string
  disabled?: boolean
  className?: string
  id?: string
}

export function Switch({ checked, onCheckedChange, label, disabled, className, id }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      data-state={checked ? 'on' : 'off'}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked)
      }}
      className={cn(
        'relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-[#E20C04]/40 disabled:cursor-not-allowed disabled:opacity-50',
        // Brand red->coral gradient track when on (matches the button.tsx convention:
        // the gradient lives in className via a Tailwind arbitrary value), neutral when off.
        checked ? 'bg-[linear-gradient(135deg,#E20C04_0%,#E84A00_100%)]' : 'bg-[#D1D5DB]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none block size-[20px] rounded-full bg-white shadow-[0_1px_3px_rgba(1,12,53,0.3)] transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0',
        )}
      />
    </button>
  )
}
