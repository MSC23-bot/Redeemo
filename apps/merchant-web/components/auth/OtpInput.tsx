'use client'

import { Input } from '@/components/ui/input'

// M1 Slice 2: a single numeric 6-digit OTP field (one-time-code autocomplete so the
// OS keyboard / SMS-autofill offers the code; non-digits stripped; capped at 6).
export function OtpInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      aria-label="6-digit code"
      className="h-12 text-center text-2xl font-semibold tracking-[0.4em]"
    />
  )
}
