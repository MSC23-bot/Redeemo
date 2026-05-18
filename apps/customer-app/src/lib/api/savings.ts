import { z } from 'zod'
import { api } from '../api'

// §Savings Rebaseline (PR-B, Revision 2 — 2026-05-17): consumes the
// `byBranch` backend contract shipped via PR #104 (merge `b148a46`).
// Replaces the merchant-level `byMerchant[]` / `MerchantSaving` shape
// from the original 2026-04-18 baseline.  See
// `docs/superpowers/specs/2026-04-18-savings-tab-design.md` §Backend
// requirement + `docs/superpowers/plans/2026-05-17-savings-frontend-rebaseline-prb-m1.md` §3.

export const voucherTypeSchema = z.enum([
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT_FIXED',
  'DISCOUNT_PERCENT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
])
export type VoucherType = z.infer<typeof voucherTypeSchema>

// `z.coerce.number()` (not `z.number()`) because Prisma's Decimal
// serialises to JSON as a string by default — see the longer note in
// `apps/customer-app/src/lib/api/subscription.ts` for the precedent
// and the bug that motivates this rule.
const moneySchema = z.coerce.number()

export const monthBreakdownSchema = z.object({
  month:  z.string(),                       // 'YYYY-MM'
  saving: moneySchema,
  count:  z.number(),
})
export type MonthBreakdown = z.infer<typeof monthBreakdownSchema>

// Per-entry shape locked by PR #104.  Multi-branch merchants surface
// as MULTIPLE entries with shared `merchantId` / `merchantName`.  The
// merchant fields ARE carried alongside branch fields so callers can
// render the secondary line ("Covelum") under the primary branch line
// ("Brightlingsea") without an extra fetch.  Branch-as-PRIMARY-unit
// product rule, memory `project_branch_first_class_platform_rules.md`.
export const branchSavingSchema = z.object({
  branchId:        z.string(),
  branchName:      z.string(),
  merchantId:      z.string(),
  merchantName:    z.string(),
  merchantLogoUrl: z.string().nullable(),
  saving:          moneySchema,
  count:           z.number(),
})
export type BranchSaving = z.infer<typeof branchSavingSchema>

export const categorySavingSchema = z.object({
  categoryId: z.string(),
  name:       z.string(),
  saving:     moneySchema,
})
export type CategorySaving = z.infer<typeof categorySavingSchema>

export const savingsSummarySchema = z.object({
  lifetimeSaving:           moneySchema,
  thisMonthSaving:          moneySchema,
  thisMonthRedemptionCount: z.number(),
  monthlyBreakdown:         z.array(monthBreakdownSchema),
  byBranch:                 z.array(branchSavingSchema),
  byCategory:               z.array(categorySavingSchema),
})
export type SavingsSummary = z.infer<typeof savingsSummarySchema>

export const savingsRedemptionSchema = z.object({
  id:              z.string(),
  redeemedAt:      z.string(),                      // ISO
  estimatedSaving: moneySchema,
  isValidated:     z.boolean(),
  validatedAt:     z.string().nullable(),
  merchant: z.object({
    id:           z.string(),
    businessName: z.string(),
    logoUrl:      z.string().nullable(),
  }),
  voucher: z.object({
    id:          z.string(),
    title:       z.string(),
    voucherType: voucherTypeSchema,
  }),
  branch: z.object({
    id:   z.string(),
    name: z.string(),
  }),
})
export type SavingsRedemption = z.infer<typeof savingsRedemptionSchema>

export const savingsRedemptionsResponseSchema = z.object({
  redemptions: z.array(savingsRedemptionSchema),
  total:       z.number(),
})
export type SavingsRedemptionsResponse = z.infer<typeof savingsRedemptionsResponseSchema>

export const monthlyDetailSchema = z.object({
  totalSaving:     moneySchema,
  redemptionCount: z.number(),
  byBranch:        z.array(branchSavingSchema),
  byCategory:      z.array(categorySavingSchema),
})
export type MonthlyDetail = z.infer<typeof monthlyDetailSchema>

export const savingsApi = {
  async getSummary(): Promise<SavingsSummary> {
    const raw = await api.get<unknown>('/api/v1/customer/savings/summary')
    return savingsSummarySchema.parse(raw)
  },

  // `offset !== undefined` (not `if (params.offset)`) so `offset=0`
  // gets sent as a query param.  React Query's `initialPageParam: 0`
  // would otherwise have its first page silently omit the offset,
  // making the test fixture diverge from real network traffic.
  async getRedemptions(params: { limit?: number; offset?: number } = {}): Promise<SavingsRedemptionsResponse> {
    const qs = new URLSearchParams()
    if (params.limit  !== undefined) qs.set('limit',  String(params.limit))
    if (params.offset !== undefined) qs.set('offset', String(params.offset))
    const query = qs.toString()
    const raw = await api.get<unknown>(
      `/api/v1/customer/savings/redemptions${query ? `?${query}` : ''}`,
    )
    return savingsRedemptionsResponseSchema.parse(raw)
  },

  async getMonthlyDetail(month: string): Promise<MonthlyDetail> {
    const raw = await api.get<unknown>(
      `/api/v1/customer/savings/monthly-detail?month=${month}`,
    )
    return monthlyDetailSchema.parse(raw)
  },
}
