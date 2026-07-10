/**
 * Merchant 360 workspace tab model (spec: merchant-360-spec.md §A4).
 *
 * The workspace exposes URL-addressable tabs via `?tab=`. Overview + Business
 * identity render real content (A1); Branches, Documents, and Activity render
 * real content (A2). Every remaining tab is present in the bar but renders an
 * honest placeholder panel (see `M360_PLACEHOLDER_COPY`) so the operator always
 * sees the true state of the surface, never fabricated data.
 *
 * The prototype's separate Comms + Audit tabs are collapsed into one "Activity"
 * tab for v1 (recorded divergence: both feeds already come from the per-merchant
 * timeline; split later if volume demands). The prototype-only demo state
 * switchers and role cycler are never built.
 */
export type M360TabKey =
  | 'overview'
  | 'identity'
  | 'branches'
  | 'vouchers'
  | 'redemptions'
  | 'documents'
  | 'activity'
  | 'staff'
  | 'notes'
  | 'performance'
  | 'insights'
  | 'commercial'

export interface M360TabDef {
  key: M360TabKey
  label: string
}

/** Tab order as shown in the bar (Overview + Business identity build in A1). */
export const M360_TABS: readonly M360TabDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'identity', label: 'Business identity' },
  { key: 'branches', label: 'Branches' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'redemptions', label: 'Redemptions' },
  { key: 'documents', label: 'Documents' },
  { key: 'activity', label: 'Activity' },
  { key: 'staff', label: 'Staff and access' },
  { key: 'notes', label: 'Notes' },
  { key: 'performance', label: 'Performance' },
  { key: 'insights', label: 'Insights' },
  { key: 'commercial', label: 'Commercial' },
]

export const DEFAULT_M360_TAB: M360TabKey = 'overview'

/**
 * Tabs that render real, composed content (not a placeholder). A1 shipped
 * Overview + Business identity; A2 added Branches, Documents, and Activity; A3
 * adds Redemptions (scoped D67 list) and Vouchers (RMV flagship co-build).
 */
export const RENDERED_M360_TABS: readonly M360TabKey[] = [
  'overview',
  'identity',
  'branches',
  'vouchers',
  'redemptions',
  'documents',
  'activity',
]

/**
 * Resolve the raw `?tab=` value to a known tab key. An unknown, missing, or
 * malformed value falls back to the default (Overview) so a hand-typed or stale
 * URL never lands on a blank surface.
 */
export function resolveM360Tab(raw: string | null | undefined): M360TabKey {
  const match = M360_TABS.find((t) => t.key === raw)
  return match ? match.key : DEFAULT_M360_TAB
}

type PlaceholderKey = Exclude<
  M360TabKey,
  'overview' | 'identity' | 'branches' | 'vouchers' | 'redemptions' | 'documents' | 'activity'
>

export interface PlaceholderCopy {
  title: string
  body: string
}

/**
 * Honest placeholder copy per not-yet-built tab. Tabs that are simply queued for
 * a later slice say so plainly; the gated surfaces (Performance, Insights, Notes,
 * Commercial) carry the spec's own honesty language about WHY they are not live
 * (net-new aggregation, DPIA gate, net-new schema, provider/billing gate). No
 * fabricated data is ever shown.
 */
export const M360_PLACEHOLDER_COPY: Record<PlaceholderKey, PlaceholderCopy> = {
  staff: { title: 'Staff and access', body: 'Coming in a later slice.' },
  notes: {
    title: 'Notes',
    body: 'Internal operator notes need the MerchantNote model, which is not built yet (net-new schema). Nothing is shown here until it lands.',
  },
  performance: {
    title: 'Performance',
    body: 'Aggregate performance roll-ups are not built yet. They need a net-new aggregation endpoint and stay aggregate-only: never an individual customer identity.',
  },
  insights: {
    title: 'Insights',
    body: 'Member behaviour and demographics are DPIA-gated and default-off. Nothing is available until the privacy gate opens; the DPO decides that with the Platform owner.',
  },
  commercial: {
    title: 'Commercial',
    body: 'Featured placement, campaigns, and billing are provider and billing gated. This is a labelled concept, not live money, and is not available in this view.',
  },
}
