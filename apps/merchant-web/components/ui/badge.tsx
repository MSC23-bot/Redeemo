import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide',
  {
    variants: {
      variant: {
        neutral: 'bg-[#F3F4F6] text-[#6B7390]',
        caution: 'bg-[#FEF6EC] text-[#B45309]',
        restrictive: 'bg-[#FEECEC] text-[#B91C1C]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
)

export function Badge({
  className, variant = 'neutral', ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-variant={variant} className={cn(badgeVariants({ variant, className }))} {...props} />
}
