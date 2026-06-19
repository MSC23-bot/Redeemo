import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Signature primary: red-to-coral 135deg gradient + brand-rose glow.
        gradient:
          "text-white border-0 bg-[linear-gradient(135deg,#E20C04_0%,#E84A00_100%)] shadow-[0_14px_30px_-12px_rgba(226,12,4,0.6)] hover:brightness-105 hover:-translate-y-px",
        // Solid brand-red (shadcn default mapping).
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Navy secondary CTA (e.g. Validate a code).
        navy: "bg-navy text-white border border-navy hover:bg-[#1b264f]",
        // White + hairline border.
        secondary:
          "bg-card text-foreground border border-border shadow-[var(--shadow-sm)] hover:bg-[#F8F9FA]",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "gradient", size: "default" },
  }
)

function Button({
  className,
  variant = "gradient",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button"
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
