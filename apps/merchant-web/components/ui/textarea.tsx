'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Textarea with a live character counter, for the profile description (F3, max 600)
// and voucher fields (F5). Renders a labelled textarea plus an "N / max" counter
// driven off the controlled value length. The native `maxLength` hard-caps input;
// the counter flags `data-over=true` when the value reaches/exceeds the cap so
// consumers can tint it. Forwards through to the underlying <textarea>.

interface TextareaProps
  extends Omit<React.ComponentProps<'textarea'>, 'maxLength'> {
  label: string
  maxLength: number
  /** id for the textarea (defaults to a label-derived id). */
  id?: string
  /** Optional helper line under the field. */
  hint?: string
}

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function Textarea({
  label,
  maxLength,
  id,
  hint,
  className,
  value,
  defaultValue,
  ...props
}: TextareaProps) {
  const fieldId = id ?? `textarea-${slugify(label)}`
  // Length is derived from the controlled value when provided, else tracked locally
  // for the uncontrolled case (so the counter still works without a parent state).
  const [localLen, setLocalLen] = React.useState(
    typeof defaultValue === 'string' ? defaultValue.length : 0,
  )
  const len =
    typeof value === 'string' ? value.length : value != null ? String(value).length : localLen
  const over = len >= maxLength

  return (
    <div data-slot="textarea" className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className="text-sm font-medium text-[#010C35]">
        {label}
      </label>
      <textarea
        id={fieldId}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          if (value === undefined) setLocalLen(e.target.value.length)
          props.onChange?.(e)
        }}
        className="min-h-24 w-full rounded-[14px] border border-[#D1D5DB] bg-white px-3.5 py-2.5 text-sm text-[#010C35] outline-none transition-[border-color,box-shadow] placeholder:text-[#8089A4] focus-visible:border-[#E20C04] focus-visible:ring-[3px] focus-visible:ring-[#E20C04]/20"
        {...props}
      />
      <div className="flex items-center justify-between">
        {hint ? <span className="text-xs text-[#6B7390]">{hint}</span> : <span />}
        <span
          data-over={over}
          className={cn('text-xs tabular-nums', over ? 'font-semibold text-[#B45309]' : 'text-[#6B7390]')}
        >
          {len} / {maxLength}
        </span>
      </div>
    </div>
  )
}
