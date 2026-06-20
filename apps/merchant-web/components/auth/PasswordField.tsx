'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

// M1 Slice 3/4: password input with a show/hide toggle.
export function PasswordField({
  id,
  value,
  onChange,
  disabled,
  autoComplete = 'new-password',
  placeholder,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  autoComplete?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pr-14"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
