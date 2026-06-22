'use client'

import { Button } from '@/components/ui/button'
import { Copy } from '@/lib/icons'

// Day-2 Vouchers B5: the Duplicate action button. Duplicate is client-orchestrated
// (there is no backend duplicate route): the detail page opens the builder in
// CREATE mode prefilled from the source voucher with the title suffixed " (copy)",
// and the merchant saves it as a fresh DRAFT. This button just triggers that mode;
// the orchestration (getVoucher source -> prefill -> createVoucher) lives on the
// detail page. Available in EVERY state (a rejected voucher recovers via Duplicate).

export function DuplicateAction({ onDuplicate }: { onDuplicate: () => void }) {
  return (
    <Button variant="secondary" size="sm" onClick={onDuplicate}>
      <Copy size={15} /> Duplicate
    </Button>
  )
}
