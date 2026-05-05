import React from 'react'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

/**
 * Voucher Detail route — `/voucher/[id]?branch=<id>`.
 * Branch passed via the optional `?branch=<id>` query param per
 * plan §11 C1. Cold-open (no param) falls through to the merchant-
 * profile resolver's nearest-by-GPS / `isMainBranch` logic.
 */
export default function VoucherRoute() {
  return <VoucherDetailScreen />
}
