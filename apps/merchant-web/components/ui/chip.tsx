import * as React from 'react'
import { cn } from '@/lib/utils'

export type VoucherType =
  | 'bogo' | 'discount' | 'freebie' | 'spendsave' | 'package' | 'timelimited' | 'reusable'

const ACCENT: Record<VoucherType, string> = {
  bogo: '#7C3AED', discount: '#E20C04', freebie: '#16A34A', spendsave: '#E84A00',
  package: '#2563EB', timelimited: '#D97706', reusable: '#0D9488',
}

/** Voucher-type chip. Accent comes from the type map; usage (which voucher) is M4. */
export function Chip({
  type, className, children, ...props
}: React.ComponentProps<'span'> & { type: VoucherType }) {
  const accent = ACCENT[type]
  return (
    <span
      data-type={type}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', className)}
      style={{ background: `${accent}1A`, color: accent }}
      {...props}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: accent }} />
      {children}
    </span>
  )
}
