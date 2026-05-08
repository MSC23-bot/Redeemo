import { z } from 'zod'
import { api } from '../api'

/**
 * Voucher Detail API client — backed by the dedicated
 * `GET /api/v1/customer/vouchers/:id` endpoint that already ships on
 * main (see `src/api/customer/discovery/service.ts:getCustomerVoucher`).
 *
 * Returns the voucher row plus per-user state:
 *   • `isRedeemedThisCycle` — branch-INDEPENDENT eligibility key (the
 *     `UserVoucherCycleState` unique key is `(userId, voucherId)`, so
 *     redemption at one branch blocks the same voucher across ALL
 *     branches in the same cycle).
 *   • `isFavourited` — has the user starred this voucher.
 *
 * Branch context (selectedBranch + branch list) is intentionally NOT on
 * this endpoint — it lives on the merchant profile endpoint via
 * `useMerchantProfile`. Voucher Detail combines both per the locked
 * dual-endpoint pattern in plan §3 D2.
 */

// Mirror Prisma's `VoucherType` enum. Keeping as a string union (not a
// Zod enum) lets us tolerate a backend change that adds a new type
// before the client redeploys — Zod's `z.string()` accepts any string,
// the runtime type check is just whatever the backend says it is.
const voucherTypeSchema = z.enum([
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT_FIXED',
  'DISCOUNT_PERCENT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
])

const voucherDetailMerchantSchema = z.object({
  id:           z.string(),
  businessName: z.string(),
  tradingName:  z.string().nullable(),
  logoUrl:      z.string().nullable(),
  status:       z.string(),
})

// `z.coerce.number()` for any Decimal field — same lesson as PR #39's
// subscription priceGbp fix. Prisma's `Decimal` type serialises as a
// JSON STRING; `z.number()` would silently reject and the client would
// return null. The voucher endpoint already calls
// `Number(voucher.estimatedSaving)` server-side so it's always a real
// number on the wire today, but coerce defensively in case the
// serialisation changes.
// M3 §P2 — persisted return-visit RedemptionDetailsCard payload.
// Mirrors the backend `lastRedemption` block on `getCustomerVoucher`
// (Task 5). Non-null ONLY when the voucher is redeemed in the
// current ACTIVE/TRIALLING cycle window — by construction, all three
// of `isRedeemedThisCycle`, `availableAgainAt`, and this field
// derive from the same `getCurrentCycleWindow()` call. After cycle
// rollover the backend flips them all together; the frontend's
// §Q6 invariant gate (load-bearing on `isRedeemedThisCycle`, NOT
// on this field's presence) holds by construction.
const voucherDetailLastRedemptionSchema = z.object({
  code:        z.string(),
  redeemedAt:  z.string(),                   // ISO
  branch:      z.object({
    id:   z.string(),
    name: z.string(),
  }),
  isValidated: z.boolean(),
  validatedAt: z.string().nullable(),        // ISO when validated, null otherwise
})

const voucherDetailSchema = z.object({
  id:              z.string(),
  title:           z.string(),
  type:            voucherTypeSchema,
  description:     z.string().nullable(),
  terms:           z.string().nullable(),
  imageUrl:        z.string().nullable(),
  estimatedSaving: z.coerce.number(),
  expiryDate:      z.string().nullable(),     // ISO
  code:            z.string().nullable(),
  status:          z.string(),
  approvalStatus:  z.string(),
  merchant:        voucherDetailMerchantSchema,
  isRedeemedThisCycle: z.boolean(),
  isFavourited:        z.boolean(),
  // ISO timestamp for when the user's current cycle ends — i.e. when
  // this voucher becomes redeemable again. Null for free users /
  // guests / non-active subscriptions; the UI hides cycle copy in
  // those cases and shows subscription copy instead.
  availableAgainAt:    z.string().nullable(),
  // M3 — persisted return-visit RedemptionDetailsCard.
  // `.optional().nullable()` — accepts the field being absent
  // (backward compat for pre-M3 cached responses), null (free user
  // / rolled-over / not-redeemed), or the inner shape (current-cycle
  // redeemed state).
  lastRedemption:      voucherDetailLastRedemptionSchema.nullable().optional(),
})

export type VoucherType   = z.infer<typeof voucherTypeSchema>
export type VoucherDetail = z.infer<typeof voucherDetailSchema>

export const voucherApi = {
  /**
   * GET /api/v1/customer/vouchers/:id
   * Optional bearer-token auth: when authenticated, the server fills
   * in `isRedeemedThisCycle` + `isFavourited` for the calling user;
   * otherwise both default to false.
   */
  getById: (id: string) =>
    api.get<unknown>(`/api/v1/customer/vouchers/${encodeURIComponent(id)}`).then((data) => {
      if (!data) return null
      const result = voucherDetailSchema.safeParse(data)
      return result.success ? result.data : null
    }),
}

// Exposed for testing only — schema is the contract this client guarantees
// to consumers, so test against the schema directly.
export const _voucherDetailSchemaForTests = voucherDetailSchema
