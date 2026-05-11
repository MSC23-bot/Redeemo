import { sortMerchantVouchers } from '@/features/merchant/utils/voucherCardSort'
import type { MerchantVoucher } from '@/lib/api/merchant'

// Fixture builder — narrows to the fields the sort utility reads.
// Mirrors the plan's `mk` helper at §M4c-1 step 1.
const mk = (over: Partial<MerchantVoucher>): MerchantVoucher => ({
  id: over.id ?? 'x',
  title: over.title ?? '?',
  type: over.type ?? 'BOGO',
  description: null,
  terms: null,
  imageUrl: null,
  estimatedSaving: 5,
  expiryDate: null,
  isRedeemedThisCycle: false,
  availabilityWindows: [],
  currentWindow: null,
  nextWindow: null,
  redeemedWindow: null,
  ...over,
})

describe('sortMerchantVouchers (M4c-1)', () => {
  it('orders TL-urgent → TL-active → non-TL active → TL-unavailable → redeemed; expired filtered', () => {
    const now = new Date('2026-05-11T11:00:00Z')
    const items: MerchantVoucher[] = [
      mk({ id: 'a', title: 'non-TL active', type: 'BOGO' }),
      mk({
        id: 'b', title: 'TL urgent', type: 'TIME_LIMITED',
        currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T11:30:00Z' },  // 30min left
      }),
      mk({
        id: 'c', title: 'TL active', type: 'TIME_LIMITED',
        currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' },  // 3h left
      }),
      mk({
        id: 'd', title: 'TL outside-today', type: 'TIME_LIMITED',
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-11T14:00:00Z', endsAt: '2026-05-11T16:00:00Z' },
      }),
      mk({ id: 'e', title: 'redeemed BOGO', type: 'BOGO', isRedeemedThisCycle: true }),
      mk({ id: 'f', title: 'expired', type: 'BOGO', expiryDate: '2020-01-01T00:00:00Z' }),
    ]

    const sorted = sortMerchantVouchers(items, now)
    expect(sorted.map(v => v.id)).toEqual(['b', 'c', 'a', 'd', 'e'])
    // 'f' (expired) is filtered out entirely.
  })

  it('outside-window TL cards sort by nextWindow.startsAt ascending', () => {
    const now = new Date('2026-05-11T11:00:00Z')
    const items = [
      mk({
        id: 'late', type: 'TIME_LIMITED',
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-13T10:00:00Z', endsAt: '2026-05-13T14:00:00Z' },
      }),
      mk({
        id: 'early', type: 'TIME_LIMITED',
        currentWindow: null,
        nextWindow: { startsAt: '2026-05-11T16:00:00Z', endsAt: '2026-05-11T20:00:00Z' },
      }),
    ]
    const sorted = sortMerchantVouchers(items, now)
    expect(sorted.map(v => v.id)).toEqual(['early', 'late'])
  })

  // Stale-payload edge cases (Gate G owner direction, 2026-05-11).
  // Merchant-profile payloads are computed at fetch time but the user can
  // leave the screen open while a window closes. The bucket logic MUST
  // gate "active/urgent" on `currentWindow.endsAt > now`. If endsAt has
  // passed, the voucher is no longer live regardless of `currentWindow`
  // being non-null — fall through to outside-window (bucket 4) so the
  // user doesn't see a stale "Active" or "Ending in" pill claiming a
  // closed window is still live.

  it('stale currentWindow with fresh nextWindow → outside-window bucket, NOT active/urgent', () => {
    // now is 1 hour past the stale voucher's window close.
    const now = new Date('2026-05-11T15:00:00Z')
    const items: MerchantVoucher[] = [
      mk({
        id: 'stale-TL', type: 'TIME_LIMITED',
        // currentWindow.endsAt is 1h in the past relative to now.
        currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' },
        nextWindow:    { startsAt: '2026-05-12T10:00:00Z', endsAt: '2026-05-12T14:00:00Z' },
      }),
      mk({
        id: 'live-TL', type: 'TIME_LIMITED',
        // currentWindow.endsAt is 3h in the future — genuinely active.
        currentWindow: { startsAt: '2026-05-11T14:00:00Z', endsAt: '2026-05-11T18:00:00Z' },
      }),
    ]
    const sorted = sortMerchantVouchers(items, now)
    // 'live-TL' is bucket 2 (active, >60min remaining); 'stale-TL' is bucket 4
    // (outside-window) — stale must NOT outrank live.
    expect(sorted.map(v => v.id)).toEqual(['live-TL', 'stale-TL'])
  })

  it('stale currentWindow with null nextWindow → safe non-active bucket (no crash, no false active)', () => {
    const now = new Date('2026-05-11T15:00:00Z')
    const items: MerchantVoucher[] = [
      mk({ id: 'non-TL', type: 'BOGO' }),  // bucket 3 (non-TL active)
      mk({
        id: 'stale-no-next', type: 'TIME_LIMITED',
        // Closed; nothing scheduled — degenerate payload from the user's
        // POV (they left the screen open past close without a fetch).
        currentWindow: { startsAt: '2026-05-11T10:00:00Z', endsAt: '2026-05-11T14:00:00Z' },
        nextWindow:    null,
      }),
    ]
    const sorted = sortMerchantVouchers(items, now)
    // Non-TL active (bucket 3) outranks the degenerate stale TL (bucket 4).
    // Crucially, 'stale-no-next' is NOT classified as active/urgent.
    expect(sorted.map(v => v.id)).toEqual(['non-TL', 'stale-no-next'])
  })
})
