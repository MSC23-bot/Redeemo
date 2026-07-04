import type { Metadata } from 'next'
import { CheckCircle2 } from '@/lib/icons'
import { ComingSoonModule } from '@/components/shell/ComingSoonModule'

export const metadata: Metadata = { title: 'Payments & billing · Redeemo for Business' }

export default function BillingPage() {
  return (
    <ComingSoonModule
      eyebrow="Grow your business"
      title="Payments & billing"
      intro="Invoices, payment methods and statements for paid Redeemo services will live here once Promote opens."
      footnote="Nothing here is live or chargeable yet. We will let you know before any paid feature opens."
    >
      <div className="flex items-start gap-4 rounded-[18px] border border-[#FBE0D4] bg-gradient-to-br from-[#FFF6F1] to-[#FFFBF8] p-5">
        <span aria-hidden className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[#0F7A3E]">
          <CheckCircle2 size={20} />
        </span>
        <div>
          <h2 className="font-display text-[18px] font-semibold text-foreground">Being listed on Redeemo is free</h2>
          <p className="mt-1 max-w-[58ch] text-[13.5px] leading-relaxed text-[#566079]">
            Your listing, branches, vouchers and redemptions never cost anything. Billing will only ever apply to optional paid Promote features you choose to switch on.
          </p>
        </div>
      </div>
    </ComingSoonModule>
  )
}
