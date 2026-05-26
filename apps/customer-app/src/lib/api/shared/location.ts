/**
 * Shared `locationContext` wire schema + type.
 *
 * Single source of truth for the Discovery `locationContext` envelope on
 * customer-app wire payloads.  Mirrors the backend wire shape exported as
 * `LocationContextWire` in `src/api/customer/discovery/service.ts`.
 *
 * Phase B.2 (Home Relevance, 2026-05-22) introduced the optional `locality`
 * sub-object alongside the `city` string — backend resolves the user's
 * primary discovery locality via `resolveEffectiveLocation`; the
 * rail-level `homeRailMetaSchema.locality` is the per-rail value (may
 * differ from this top-level when cascade promotes a rail beyond local).
 * `.optional()` lets legacy responses (pre-Phase B) still parse.
 *
 * §DF-v2-j Task 3 hoist (2026-05-26): moved out of `discovery.ts` so all
 * Discovery surface schemas (Home, Search, In-area, Category merchants,
 * Merchant Profile) share one definition.  Voucher Detail is
 * intentionally NOT a consumer — Voucher Detail location awareness is
 * deferred to §DF-v2-o per spec D11.  Once §DF-v2-o picks up the work,
 * it imports from this same file (no further refactor needed).
 *
 * Task 7 will add consumers (`searchResponseSchema`, `inAreaResponseSchema`,
 * `categoryMerchantsResponseSchema`, `merchantProfileSchema`).  Task 3 is
 * hoist-only; no new consumers added here.
 */
import { z } from 'zod'

export const locationContextSchema = z.object({
  locality: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  city:     z.string().nullable(),
  source:   z.enum(['coordinates', 'profile', 'none']),
})

export type LocationContext = z.infer<typeof locationContextSchema>
