'use client'

import { passwordChecks } from '@/lib/auth/password'
import { cn } from '@/lib/utils'

// My Account Change Password modal (myaccount-2 prototype): a 4-segment strength
// bar above the existing PasswordRequirements checklist. Strength is derived
// straight from the same passwordChecks() the checklist already uses (count of
// the 5 rules met, out of 5), so the bar and the checklist can never disagree.
export function PasswordStrengthMeter({ password }: { password: string }) {
  const c = passwordChecks(password)
  const metCount = [c.length, c.upper, c.lower, c.digit, c.special].filter(Boolean).length
  // 5 possible rules mapped onto 4 segments: 0 met -> 0 filled, 5 met -> all 4 filled.
  const filled = password.length === 0 ? 0 : Math.max(1, Math.ceil((metCount / 5) * 4))

  const color =
    filled <= 1 ? '#E20C04' : filled === 2 ? '#E84A00' : filled === 3 ? '#D97706' : 'var(--success)'

  return (
    <div
      className="flex gap-1"
      role="img"
      aria-label={`Password strength: ${['too weak', 'weak', 'fair', 'good', 'strong'][filled]}`}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn('h-1 flex-1 rounded-full transition-colors', i < filled ? '' : 'bg-border')}
          style={i < filled ? { background: color } : undefined}
        />
      ))}
    </div>
  )
}
