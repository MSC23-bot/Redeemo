import * as React from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />
}
export function THead({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('text-left text-[12px] font-extrabold uppercase tracking-wide text-[#8089A4]', className)} {...props} />
}
export function TBody(props: React.ComponentProps<'tbody'>) { return <tbody {...props} /> }
export function TR({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border', className)} {...props} />
}
export function TH({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('px-3 py-2', className)} {...props} />
}
export function TD({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('px-3 py-3', className)} {...props} />
}
export function TableEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-10 text-center text-sm text-muted-foreground">{children}</div>
}
