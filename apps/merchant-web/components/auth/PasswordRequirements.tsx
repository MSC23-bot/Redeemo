import { passwordChecks } from '@/lib/auth/password'
import { cn } from '@/lib/utils'

// M1 Slice 3/4: live password-requirement checklist. Met rules turn brand-success;
// uses a CSS dot marker (no glyph/emoji).
export function PasswordRequirements({ password }: { password: string }) {
  const c = passwordChecks(password)
  const items: Array<[string, boolean]> = [
    ['At least 8 characters', c.length],
    ['An uppercase letter', c.upper],
    ['A lowercase letter', c.lower],
    ['A number', c.digit],
    ['A special character', c.special],
  ]
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
      {items.map(([label, ok]) => (
        <li
          key={label}
          className={cn('flex items-center gap-1.5', ok ? 'text-[var(--success)]' : 'text-muted-foreground')}
        >
          <span
            aria-hidden
            className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', ok ? 'bg-[var(--success)]' : 'bg-border')}
          />
          {label}
        </li>
      ))}
    </ul>
  )
}
