import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { voucherTypeSchema } from '@/lib/api/savings'

// §Savings Redemption Detail (PR #105 device-QA round-3, 2026-05-18).
//
// Backend route: `GET /api/v1/redemption/my/:id` (see
// `src/api/redemption/service.ts::getMyRedemption`).  Returns the full
// Prisma `voucherRedemption` record (auth-gated to `userId === requester`)
// including:
//
//   - id, redemptionCode, redeemedAt, estimatedSaving
//   - isValidated, validatedAt, validationMethod
//   - voucher: { id, title, terms, merchant: { businessName } }
//   - branch:  { id, name, addressLine1, city, postcode }
//
// The existing `redemptionApi.getMyRedemption(...)` wrapper parses
// with the slim `RedeemResponseSchema` (id / voucherId / branchId /
// redemptionCode / estimatedSaving / isValidated / redeemedAt) which
// is enough for the post-redeem ShowToStaff polling but DROPS the
// voucher.title + branch.name + validatedAt fields the receipt
// screen needs.
//
// This hook owns its own schema — kept local to the redemption-detail
// feature so future fields can be added here without thinking about
// other callers of the slim shape.  No cycle gate on the backend:
// historical redemptions remain fetchable indefinitely.

const validationMethodSchema = z.enum(['QR_SCAN', 'MANUAL']).nullable()

export const myRedemptionDetailSchema = z.object({
  id:               z.string(),
  redemptionCode:   z.string(),
  redeemedAt:       z.string(),
  estimatedSaving:  z.coerce.number(),
  isValidated:      z.boolean(),
  validatedAt:      z.string().nullable(),
  validationMethod: validationMethodSchema,
  voucherId:        z.string(),
  branchId:         z.string(),
  voucher: z.object({
    id:          z.string(),
    title:       z.string(),
    // §Savings device-QA round-5 fixup 2026-05-18 — description +
    // terms surfaced on the Redemption Receipt screen.  Both
    // optional+nullable: backend allows null on Voucher.description
    // (admin-managed) and Voucher.terms (merchant-supplied).  When
    // null/empty the receipt UI hides the row entirely.
    description: z.string().nullable().optional(),
    terms:       z.string().nullable().optional(),
    voucherType: voucherTypeSchema,
    merchant: z.object({
      id:           z.string(),
      businessName: z.string(),
      // Public trading name: customer-facing surfaces prefer this
      // over the registered `businessName` (see
      // `@/lib/merchantDisplayName`). Nullable: not every merchant
      // has set one.
      tradingName:  z.string().nullable().optional(),
      // §Savings device-QA round-8 fixup 2026-05-18 — backend select
      // expanded to include `logoUrl` for the Redemption Receipt
      // visual identity.  Nullable: a merchant may not have uploaded
      // a logo yet; the receipt UI falls back to a tinted initial.
      logoUrl:      z.string().nullable().optional(),
    }),
  }),
  branch: z.object({
    id:           z.string(),
    name:         z.string(),
    addressLine1: z.string().nullable(),
    city:         z.string().nullable(),
    postcode:     z.string().nullable(),
  }),
})
export type MyRedemptionDetail = z.infer<typeof myRedemptionDetailSchema>

export type ValidationMethod = z.infer<typeof validationMethodSchema>

async function fetchMyRedemption(redemptionId: string): Promise<MyRedemptionDetail> {
  const raw = await api.get<unknown>(
    `/api/v1/redemption/my/${encodeURIComponent(redemptionId)}`,
  )
  return myRedemptionDetailSchema.parse(raw)
}

export function useMyRedemption(redemptionId: string | undefined) {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useQuery({
    queryKey: ['myRedemption', redemptionId],
    queryFn:  () => fetchMyRedemption(redemptionId!),
    enabled:  isAuthed && Boolean(redemptionId),
    // Historical receipts don't change often — once validated, they
    // stay validated forever; once redeemed, they stay redeemed.
    // 60s staleTime so the screen feels live during a back-and-forth
    // session (e.g. validated chip flips while user looks) without
    // pummeling the backend on every tap.
    staleTime: 60_000,
  })
}
