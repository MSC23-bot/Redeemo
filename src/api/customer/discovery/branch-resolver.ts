import { haversineMetres } from '../../shared/haversine'

// Pure resolver — no Prisma imports; unit-testable in isolation.

export type ResolvableBranch = {
  id: string
  isActive: boolean
  isMainBranch: boolean
  latitude: number | null
  longitude: number | null
  createdAt: Date
}

export type ResolveResult = {
  resolvedBranchId: string | null
  fallbackReason:
    | 'used-candidate'
    | 'candidate-inactive'
    | 'candidate-not-found'
    | 'no-candidate'
    | 'all-suspended'
}

function pickColdOpen(branches: ResolvableBranch[], lat?: number, lng?: number): string | null {
  const active = branches.filter(b => b.isActive)
  if (active.length === 0) return null

  if (lat !== undefined && lng !== undefined) {
    let nearest: ResolvableBranch | null = null
    let nearestDist = Infinity
    for (const b of active) {
      if (b.latitude === null || b.longitude === null) continue
      const d = haversineMetres(lat, lng, b.latitude, b.longitude)
      if (d < nearestDist) { nearestDist = d; nearest = b }
    }
    if (nearest) return nearest.id
  }

  const main = active.find(b => b.isMainBranch)
  if (main) return main.id

  const sorted = [...active].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  return sorted[0]?.id ?? null
}

export function resolveSelectedBranch(
  branches: ResolvableBranch[],
  candidateBranchId: string | null,
  lat: number | undefined,
  lng: number | undefined,
): ResolveResult {
  // Candidate provided — validate it belongs to the merchant (the caller has
  // already filtered branches[] by merchantId) and is active.
  if (candidateBranchId) {
    const found = branches.find(b => b.id === candidateBranchId)
    if (!found) {
      const fallback = pickColdOpen(branches, lat, lng)
      return fallback === null
        ? { resolvedBranchId: null, fallbackReason: 'all-suspended' }
        : { resolvedBranchId: fallback, fallbackReason: 'candidate-not-found' }
    }
    if (!found.isActive) {
      const fallback = pickColdOpen(branches, lat, lng)
      return fallback === null
        ? { resolvedBranchId: null, fallbackReason: 'all-suspended' }
        : { resolvedBranchId: fallback, fallbackReason: 'candidate-inactive' }
    }
    return { resolvedBranchId: candidateBranchId, fallbackReason: 'used-candidate' }
  }

  const fallback = pickColdOpen(branches, lat, lng)
  return fallback === null
    ? { resolvedBranchId: null, fallbackReason: 'all-suspended' }
    : { resolvedBranchId: fallback, fallbackReason: 'no-candidate' }
}
