/**
 * Customer-facing surfaces show the merchant's public TRADING name
 * ("The Kraft Store"), never the registered legal `businessName`
 * ("The Kraft Store Pvt Ltd"). Falls back to `businessName` when no
 * trading name is set (or it's blank/whitespace-only).
 */
// `tradingName` accepts explicit `undefined` so callers whose payload types are
// `string | null | undefined` pass under `exactOptionalPropertyTypes` (behaviour
// is identical: `undefined` already fell back to `businessName`).
export function merchantDisplayName(m: { tradingName?: string | null | undefined; businessName: string }): string {
  const t = m.tradingName?.trim()
  return t && t.length > 0 ? t : m.businessName
}
