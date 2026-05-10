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
//
// `redemptionCode` shape (locked 2026-05-07 from device QA): 8 characters,
// uppercase A-Z + digits 0-9 with `O` and `I` excluded to avoid the
// common O/0 and I/1 manual-entry confusion. Backend alphabet is
// `ABCDEFGHJKLMNPQRSTUVWXYZ0123456789` (34 chars) — see
// `src/api/redemption/service.ts`. Display is 4+4 grouped via
// `formatRedemptionCode`.
export const RedeemResponseSchema = z.object({
  id:              z.string(),
  userId:          z.string(),
  voucherId:       z.string(),
  branchId:        z.string(),
  redemptionCode:  z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ0-9]{8}$/),
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

// ── Show-to-Staff polling — slim payload by-code ─────────────────────────
//
// Backend route: GET /api/v1/redemption/me/:code (M3 Task 4).
// Hit every 5s while ShowToStaff is open (15-min budget).
//
// Slim by design — exactly 7 keys. NO userId, NO validatedById, NO
// estimatedSaving, NO redeemedAt. The schema strips any extras the
// backend might accidentally serialise so the customer-app stays
// honest about what it consumes. Owner direction at Task 6 kickoff:
// "no extra customer or validation actor fields should leak into
// the client schema."
export const RedemptionStatusByCodeSchema = z.object({
  code:             z.string(),
  isValidated:      z.boolean(),
  validatedAt:      z.string().nullable(),
  validationMethod: z.enum(['QR_SCAN', 'MANUAL']).nullable(),
  voucherId:        z.string(),
  merchantName:     z.string(),
  branchName:       z.string(),
})
export type RedemptionStatusByCode = z.infer<typeof RedemptionStatusByCodeSchema>

// ── Screenshot-flag telemetry response ───────────────────────────────────

export const ScreenshotFlagResponseSchema = z.object({
  accepted: z.boolean(),
})
export type ScreenshotFlagResponse = z.infer<typeof ScreenshotFlagResponseSchema>

// ── Error response (discriminated union by `code`) ───────────────────────

// Mirrors the backend's customer-facing error codes from
// src/api/shared/errors.ts. INVALID_PIN + PIN_RATE_LIMIT_EXCEEDED carry
// per-error details payload (PR #43 Tasks A3/A4); M4a-8 adds two TIME_LIMITED
// codes that each carry `nextWindowAt` (nullable ISO timestamp — null only
// in the degenerate no-windows case). The other codes have only the
// standard envelope.
//
// 🔒 FLAT shape lock (spec §3.6.4 + AppError.toJSON()):
//   { error: { code, message, statusCode, nextWindowAt: '…' | null } }
//   NOT
//   { error: { code, message, statusCode, details: { nextWindowAt: '…' } } }
//
// Existing INVALID_PIN.remainingAttempts and PIN_RATE_LIMIT_EXCEEDED.retryAfter
// read flat off `error` for the same reason — backend AppError.toJSON()
// spreads `this.details` FLAT into the error envelope.
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
  // M4a-8 TIME_LIMITED codes. nextWindowAt is nullable — null only when
  // the voucher has no upcoming availability windows (degenerate case
  // surfaced in spec §3.6.4). UI surfaces fall back to a generic
  // "currently unavailable" copy in that case.
  z.object({
    code: z.literal('VOUCHER_OUTSIDE_AVAILABILITY_WINDOW'),
    message: z.string(),
    statusCode: z.literal(400),
    nextWindowAt: z.string().nullable(),
  }),
  z.object({
    code: z.literal('ALREADY_REDEEMED_THIS_WINDOW'),
    message: z.string(),
    statusCode: z.literal(400),
    nextWindowAt: z.string().nullable(),
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
   * Customer self-lookup of a redemption by ID.
   *
   * Backend route: `GET /api/v1/redemption/my/:id`.
   * For code-based lookup (used by M3 Show-to-Staff polling), see
   * `getMyRedemptionByCode` below.
   */
  async getMyRedemption(redemptionId: string): Promise<RedeemResponse> {
    const json = await api.get<unknown>(`/api/v1/redemption/my/${encodeURIComponent(redemptionId)}`)
    return RedeemResponseSchema.parse(json)
  },

  /**
   * Customer self-lookup by redemption CODE (slim payload).
   *
   * Backend route: `GET /api/v1/redemption/me/:code` (M3 Task 4).
   * Drives the M3 Show-to-Staff polling hook (5s cadence, 15-min
   * budget) — flips `isValidated: false → true` when staff validates
   * the code.
   *
   * Encoding: URL-encode the code via `encodeURIComponent` for
   * transport safety. Normalisation (uppercasing, stripping
   * whitespace + hyphens) stays server-side — the backend service
   * is the single source of truth for the canonical shape. Two
   * client-side normalisers would drift.
   *
   * Auth: customer JWT via the redemption plugin's scoped
   * preHandler. Backend rejects with REDEMPTION_NOT_FOUND if the
   * code doesn't exist OR belongs to a different user.
   */
  async getMyRedemptionByCode(code: string): Promise<RedemptionStatusByCode> {
    const json = await api.get<unknown>(`/api/v1/redemption/me/${encodeURIComponent(code)}`)
    return RedemptionStatusByCodeSchema.parse(json)
  },

  /**
   * Best-effort anti-fraud telemetry for the M3 Show-to-Staff
   * surface. iOS detects screenshot events after the fact via
   * `expo-screen-capture.addScreenshotListener`; the customer-app
   * fires this on every event.
   *
   * Backend route: `POST /api/v1/redemption/:code/screenshot-flag`
   * (M3 Task 4). Server dedupes via Redis SETNX with 5s TTL — a
   * burst of fires for the same `(userId, code)` writes exactly
   * one row. Returns `{ accepted: false }` on dedup hit.
   *
   * **Best-effort contract:** callers MUST swallow errors. The
   * Show-to-Staff surface MUST NOT block on this call rejecting.
   * useScreenshotGuard (M3 Task 14) wraps this in a try/catch.
   */
  async postScreenshotFlag(
    code: string,
    platform: 'ios' | 'android',
  ): Promise<ScreenshotFlagResponse> {
    const json = await api.post<unknown>(
      `/api/v1/redemption/${encodeURIComponent(code)}/screenshot-flag`,
      { platform },
    )
    return ScreenshotFlagResponseSchema.parse(json)
  },

  /**
   * Customer's full redemption history.
   *
   * Backend route: `GET /api/v1/redemption/my` (NOT `/me`).
   * M2 doesn't consume this directly but exposes it for parity.
   */
  async listMyRedemptions(): Promise<RedemptionSummary[]> {
    const json = await api.get<unknown>('/api/v1/redemption/my')
    return z.array(RedemptionSummarySchema).parse(json)
  },
}
