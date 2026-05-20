// PR-3 fixup-1 (2026-05-20) — Codex #1 regression pin.
//
// `mapDataView()` is the branch-aligned data-extraction helper that
// MapScreen consumes for both:
//   - useInAreaBranches (InAreaResponse — `meta` only, no `branchMeta`)
//   - useSearch with bbox (SearchResponse — both `meta` AND `branchMeta`)
//
// When Map renders the BRANCH arm, the meta read MUST follow the branch
// side or we recreate the PR #112 meta/list-mismatch bug class.

import { mapDataView } from '@/features/map/utils/mapDataView'

describe('mapDataView — Codex #1 regression', () => {
  describe('SearchResponse arm (filtered Map mode)', () => {
    it('prefers branchMeta over meta when both are present', () => {
      const data = {
        branches:      [{ id: 'b1' } as any],
        total:         10,                 // merchant-side count
        totalBranches: 7,                  // branch-side count
        meta: {
          emptyStateReason:  'none' as const,
          effectiveLocality: { id: 'm-loc', name: 'Merchant City' },
        },
        branchMeta: {
          emptyStateReason:  'no_uk_supply' as const,
          effectiveLocality: { id: 'b-loc', name: 'Branch City' },
        },
      }
      const view = mapDataView(data)
      // Meta MUST follow branch arm — emptyStateReason from branchMeta,
      // not from the merchant-side meta.
      expect(view.meta?.emptyStateReason).toBe('no_uk_supply')
      expect(view.meta?.effectiveLocality?.name).toBe('Branch City')
      // Total MUST follow branch arm too.
      expect(view.total).toBe(7)
      expect(view.branches).toHaveLength(1)
    })

    it('falls back to meta when branchMeta is undefined (legacy search payload)', () => {
      const data = {
        branches: [{ id: 'b1' } as any],
        total:    5,
        meta: {
          emptyStateReason:  'expanded_to_wider' as const,
          effectiveLocality: { id: 'm-loc', name: 'Merchant City' },
        },
      }
      const view = mapDataView(data)
      expect(view.meta?.emptyStateReason).toBe('expanded_to_wider')
      expect(view.meta?.effectiveLocality?.name).toBe('Merchant City')
    })

    it('falls back to branches.length when totalBranches is undefined', () => {
      const data = {
        branches: [{ id: 'b1' } as any, { id: 'b2' } as any, { id: 'b3' } as any],
        total:    99,
      }
      const view = mapDataView(data)
      expect(view.total).toBe(3)
    })
  })

  describe('InAreaResponse arm (default Map mode)', () => {
    it('reads meta directly (no branchMeta field on this route)', () => {
      const data = {
        branches: [{ id: 'b1' } as any],
        total:    1,
        meta: {
          emptyStateReason:  'none' as const,
          effectiveLocality: { id: 'loc', name: 'Brightlingsea' },
        },
      }
      const view = mapDataView(data)
      expect(view.meta?.emptyStateReason).toBe('none')
      expect(view.meta?.effectiveLocality?.name).toBe('Brightlingsea')
      // In-area route doesn't paginate; branches.length is the total.
      expect(view.total).toBe(1)
    })
  })

  describe('defensive fallbacks', () => {
    it('undefined data → empty branches, total 0, meta undefined', () => {
      const view = mapDataView(undefined)
      expect(view.branches).toEqual([])
      expect(view.total).toBe(0)
      expect(view.meta).toBeUndefined()
    })

    it('missing branches field → empty array, total 0', () => {
      const view = mapDataView({ total: 5, meta: { emptyStateReason: 'none' as const } })
      expect(view.branches).toEqual([])
      expect(view.total).toBe(0)
      expect(view.meta?.emptyStateReason).toBe('none')
    })
  })
})
