import { z } from 'zod'
import { api, ApiClientError } from '../api'

// Voucher type literal — mirrors the `VoucherType` Prisma enum.
// Kept as a string-literal union (not a Zod enum) for backward compat
// with existing VoucherCard / VouchersTab consumers that import the type.
export type VoucherType =
  | 'BOGO'
  | 'SPEND_AND_SAVE'
  | 'DISCOUNT_FIXED'
  | 'DISCOUNT_PERCENT'
  | 'FREEBIE'
  | 'PACKAGE_DEAL'
  | 'TIME_LIMITED'
  | 'REUSABLE'

// ── Redemption mutation request ──────────────────────────────────────────

export const RedeemRequestSchema = z.object({
  voucherId: z.string().min(1),
  branchId:  z.string().min(1),
  pin:       z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
})
export type RedeemRequest = z.infer<typeof RedeemRequestSchema>

// ── Redemption mutation success response ─────────────────────────────────

// Prisma Decimal serializes as string in JSON; coerce to number client-side.
// (Pattern locked since PR #39's z.coerce.number lesson.)
export const RedeemResponseSchema = z.object({
  id:              z.string(),
  userId:          z.string(),
  voucherId:       z.string(),
  branchId:        z.string(),
  redemptionCode:  z.string().regex(/^[A-Za-z0-9]{10}$/),
  estimatedSaving: z.coerce.number(),
  isValidated:     z.boolean(),
  redeemedAt:      z.string(),
})
export type RedeemResponse = z.infer<typeof RedeemResponseSchema>

// ── Per-redemption summary item (listMyRedemptions) ──────────────────────

export const RedemptionSummarySchema = z.object({
  id:              z.string(),
  voucherId:       z.string(),
  branchId:        z.string(),
  redemptionCode:  z.string(),
  estimatedSaving: z.coerce.number(),
  isValidated:     z.boolean(),
  redeemedAt:      z.string(),
})
export type RedemptionSummary = z.infer<typeof RedemptionSummarySchema>

// ── Error response (discriminated union by `code`) ───────────────────────

// Mirrors the backend's 8 customer-facing error codes from
// src/api/shared/errors.ts. INVALID_PIN and PIN_RATE_LIMIT_EXCEEDED carry
// per-error details payload (per PR #43 Tasks A3/A4); other codes have
// only the standard envelope.
export const RedemptionErrorSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('INVALID_PIN'),
    message: z.string(),
    statusCode: z.literal(400),
    remainingAttempts: z.number().int().min(0),
  }),
  z.object({
    code: z.literal('PIN_RATE_LIMIT_EXCEEDED'),
    message: z.string(),
    statusCode: z.literal(429),
    retryAfter: z.number().int().min(0),
  }),
  z.object({
    code: z.literal('SUBSCRIPTION_REQUIRED'),
    message: z.string(),
    statusCode: z.literal(403),
  }),
  z.object({
    code: z.literal('PHONE_NOT_VERIFIED'),
    message: z.string(),
    statusCode: z.literal(403),
  }),
  z.object({
    code: z.literal('VOUCHER_NOT_FOUND'),
    message: z.string(),
    statusCode: z.literal(404),
  }),
  z.object({
    code: z.literal('BRANCH_UNAVAILABLE'),
    message: z.string(),
    statusCode: z.literal(404),
  }),
  z.object({
    code: z.literal('BRANCH_MERCHANT_MISMATCH'),
    message: z.string(),
    statusCode: z.literal(400),
  }),
  z.object({
    code: z.literal('ALREADY_REDEEMED'),
    message: z.string(),
    statusCode: z.literal(409),
  }),
  z.object({
    code: z.literal('PIN_NOT_CONFIGURED'),
    message: z.string(),
    statusCode: z.literal(400),
  }),
])
export type RedemptionError = z.infer<typeof RedemptionErrorSchema>

// ── Helper: convert ApiClientError → typed RedemptionError ──────────────
//
// Reconstruct the envelope shape (code + message + statusCode + spread of
// details) and parse it through the discriminated-union schema. Returns
// the typed error on a known code, or null on unknown codes (caller
// decides whether to fall through and re-throw the original).
function toRedemptionError(err: ApiClientError): RedemptionError | null {
  const envelope = {
    code: err.code,
    message: err.message,
    statusCode: err.status,
    ...(err.details ?? {}),
  }
  const parsed = RedemptionErrorSchema.safeParse(envelope)
  return parsed.success ? parsed.data : null
}

// ── Public API surface ──────────────────────────────────────────────────

export const redemptionApi = {
  /**
   * Redeem a voucher at a specific branch with the supplied PIN.
   * Returns the created VoucherRedemption row on success.
   * Throws a typed RedemptionError (discriminated by `code`) on any of
   * the 8 customer-facing error codes; re-throws the original
   * ApiClientError on unexpected codes.
   */
  async redeem(req: RedeemRequest): Promise<RedeemResponse> {
    const valid = RedeemRequestSchema.parse(req)
    try {
      const json = await api.post<unknown>('/api/v1/redemption', valid)
      return RedeemResponseSchema.parse(json)
    } catch (err) {
      if (err instanceof ApiClientError) {
        const typed = toRedemptionError(err)
        if (typed) throw typed
      }
      throw err
    }
  },

  /**
   * Customer self-lookup of a redemption by code.
   * Used by Voucher Detail state-3 return-visit + (M3) Show-to-Staff polling.
   */
  async getMyRedemption(code: string): Promise<RedeemResponse> {
    const json = await api.get<unknown>(`/api/v1/redemption/me/${encodeURIComponent(code)}`)
    return RedeemResponseSchema.parse(json)
  },

  /**
   * Customer's full redemption history (paginated by the savings tab).
   * M2 doesn't consume this directly but exposes it for parity.
   */
  async listMyRedemptions(): Promise<RedemptionSummary[]> {
    const json = await api.get<unknown>('/api/v1/redemption/me')
    return z.array(RedemptionSummarySchema).parse(json)
  },
}
