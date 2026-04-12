import { VoucherCard } from './VoucherCard'

type Voucher = {
  id: string; title: string; type: string; description: string | null
  terms: string | null; imageUrl: string | null; estimatedSaving: unknown; expiryDate: Date | string | null
}

export function VouchersSection({ vouchers }: { vouchers: Voucher[] }) {
  if (vouchers.length === 0) {
    return (
      <section id="vouchers" className="px-6 py-10">
        <h2 className="font-display text-[22px] text-navy mb-6">Vouchers</h2>
        <p className="text-[14px] text-navy/45">No active vouchers at the moment.</p>
      </section>
    )
  }

  return (
    <section id="vouchers" className="px-6 py-10">
      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="font-display text-[22px] text-navy">Vouchers</h2>
        <span className="font-mono text-[11px] text-navy/35 tracking-wide">
          {vouchers.length} available
        </span>
      </div>
      <div className="flex flex-col gap-4 max-w-2xl">
        {vouchers.map((v, i) => (
          <VoucherCard key={v.id} voucher={v} index={i} />
        ))}
      </div>
    </section>
  )
}
