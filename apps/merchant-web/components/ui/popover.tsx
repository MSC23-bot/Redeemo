'use client'
import * as React from 'react'
import { Popover as RadixPopover } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Popover = RadixPopover.Root
export const PopoverTrigger = RadixPopover.Trigger

export function PopoverContent({
  className, align = 'end', sideOffset = 8, ...props
}: React.ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-[18px] border border-border bg-popover p-2 text-popover-foreground',
          'shadow-[0_24px_60px_-24px_rgba(1,12,53,0.4)] outline-none',
          className
        )}
        {...props}
      />
    </RadixPopover.Portal>
  )
}
