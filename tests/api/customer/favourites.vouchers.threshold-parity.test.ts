// Pin for the OWNER-LOCKED Gate H 2026-05-11 threshold parity.
//
// `URGENT_THRESHOLD_MS` is product-wide: any drift between the backend value
// (this constant) and the customer-app values surfaces a visible UX
// contradiction (a card in sort bucket 1 rendering an "Active" pill, etc.).
//
// Customer-app sources of truth (the canonical 60-minute lock lives in both
// of them):
//   - apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts
//   - apps/customer-app/src/features/merchant/utils/voucherCardSort.ts
//
// We do NOT import either customer-app file directly — they live under
// a separate tsconfig + jest runtime (jest-expo) and are not reachable from
// the backend vitest config. The customer-app side has its own pin against
// the value via `voucherCardPriority.test.ts`. This pin enforces the
// backend half of the contract.

import { describe, it, expect } from 'vitest'
import { URGENT_THRESHOLD_MS } from '../../../src/api/customer/favourites/service'

describe('URGENT_THRESHOLD_MS — Gate H 2026-05-11 parity', () => {
  it('equals 60 * 60_000 (60 minutes, the locked product-wide threshold)', () => {
    expect(URGENT_THRESHOLD_MS).toBe(60 * 60_000)
  })
})
