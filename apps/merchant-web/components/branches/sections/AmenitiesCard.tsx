'use client'

// Branches PR-1 F5: the owner-only Amenities card (prototype 04). View shows the
// branch's selected amenities as checked chips read-only; edit (owner-only) loads
// the catalogue (the OPEN customer endpoint keyed by the merchant's
// primaryCategoryId) and toggles chips, then saves a FULL-REPLACE list via
// POST /branches/:id/amenities (the useSetAmenities hook). A non-owner is read-only.
//
// MISSING-CATEGORY fallback (plan §F5): when the merchant has no primaryCategoryId
// the catalogue cannot be keyed, so the card renders the current amenities read-only
// with a calm note and NO edit control, and the catalogue fetch is SKIPPED (no
// crash). This is also a stop-and-report onboarding-data gap, flagged in the PR.
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check } from '@/lib/icons'
import { useToast } from '@/components/ui/toast'
import { useSetAmenities } from '@/lib/branches/useBranches'
import { getBranchAmenities, type Amenity, type Branch } from '@/lib/api/branch'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'

// The branch's currently-selected amenities, deduped, as { id, name }.
function selectedAmenities(branch: Branch): { id: string; name: string }[] {
  return (branch.amenities ?? []).map((a) => ({ id: a.amenity.id, name: a.amenity.name }))
}

export function AmenitiesCard({ branch, canManage }: { branch: Branch; canManage: boolean }) {
  const { toast } = useToast()
  const save = useSetAmenities()
  // Authenticated by the time the detail page renders; this read is shared (cached)
  // with the shell. We only need primaryCategoryId.
  const profile = useMerchantProfile(true)
  const primaryCategoryId = profile.data?.primaryCategoryId ?? null
  const hasCategory = !!primaryCategoryId

  const current = selectedAmenities(branch)
  const currentIds = React.useMemo(() => current.map((a) => a.id), [current])

  const [editing, setEditing] = React.useState(false)
  const [catalogue, setCatalogue] = React.useState<Amenity[] | null>(null)
  const [catalogueLoading, setCatalogueLoading] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set(currentIds))
  const [actionError, setActionError] = React.useState<string | null>(null)

  // Load the catalogue LAZILY: only when an owner actually opens edit mode AND a
  // category exists to key the request. View mode (owner or non-owner) never fetches,
  // so a read-only viewer triggers no customer-endpoint GET. SKIPPED entirely when the
  // merchant has no primaryCategoryId (the missing-category fallback never fetches and
  // never reaches edit mode). The catalogue is cached after the first edit open so a
  // re-open does not refetch.
  React.useEffect(() => {
    if (!canManage || !editing || !hasCategory) return
    if (catalogue) return
    let cancelled = false
    setCatalogueLoading(true)
    setActionError(null)
    getBranchAmenities(primaryCategoryId as string)
      .then((list) => {
        if (!cancelled) setCatalogue(list)
      })
      .catch(() => {
        if (!cancelled)
          setActionError('We could not load the amenity list. Please try again shortly.')
      })
      .finally(() => {
        if (!cancelled) setCatalogueLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canManage, editing, hasCategory, primaryCategoryId, catalogue])

  function startEdit() {
    setSelected(new Set(currentIds))
    setActionError(null)
    setEditing(true)
  }

  function cancel() {
    setActionError(null)
    setEditing(false)
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function persist() {
    setActionError(null)
    try {
      await save.mutateAsync({ id: branch.id, amenityIds: [...selected] })
      toast({ message: 'Amenities saved.', variant: 'success' })
      setEditing(false)
    } catch {
      setActionError('We could not save your amenities. Please try again.')
    }
  }

  return (
    <Card className="gap-4" data-testid="branch-amenities-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Amenities</h2>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'rgba(15, 122, 62, 0.10)', color: 'var(--success)' }}
          >
            Saves instantly
          </span>
          {canManage && hasCategory && !editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#6B7390] hover:text-[#010C35]"
            >
              Edit
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-6">
        {actionError ? (
          <p
            role="alert"
            className="rounded-[10px] border px-3 py-2 text-sm font-medium"
            style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
          >
            {actionError}
          </p>
        ) : null}

        {!hasCategory ? (
          // Missing-category fallback: current amenities read-only + a note, no edit.
          <>
            <SelectedChips amenities={current} />
            <p className="text-sm text-muted-foreground">
              Amenity editing is unavailable until your business category is set.
            </p>
          </>
        ) : editing ? (
          // Edit: toggleable catalogue chips.
          catalogueLoading && !catalogue ? (
            <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
              Loading the amenity list...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(catalogue ?? []).map((a) => {
                  const on = selected.has(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(a.id)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
                      style={
                        on
                          ? { background: 'var(--tint-deep)', color: 'var(--rose)', border: '1px solid var(--rose)' }
                          : { background: 'var(--page)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }
                      }
                    >
                      {on ? <Check size={14} aria-hidden /> : null}
                      {a.name}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button type="button" onClick={persist} disabled={save.isPending}>
                  {save.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button type="button" variant="secondary" onClick={cancel} disabled={save.isPending}>
                  Cancel
                </Button>
              </div>
            </>
          )
        ) : (
          // View: selected chips read-only.
          <SelectedChips amenities={current} />
        )}
      </div>
    </Card>
  )
}

function SelectedChips({ amenities }: { amenities: { id: string; name: string }[] }) {
  if (amenities.length === 0) {
    return <p className="text-sm text-muted-foreground">No amenities listed yet.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {amenities.map((a) => (
        <span
          key={a.id}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
          style={{ background: 'var(--tint)', color: 'var(--navy)' }}
        >
          <Check size={14} aria-hidden style={{ color: 'var(--success)' }} />
          {a.name}
        </span>
      ))}
    </div>
  )
}
