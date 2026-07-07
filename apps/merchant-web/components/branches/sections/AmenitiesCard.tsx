'use client'

// Branches PR-1 F5 (updated for D-BM1 + the 2026-07-07 fidelity-polish audit): the
// Amenities card (prototype 04/branches-6). View shows the branch's selected
// amenities as read-only chips; edit (OWNER or assigned BM) opens an "Edit
// amenities" DIALOG (prototype branches-2) that loads the catalogue (the OPEN
// customer endpoint keyed by the merchant's primaryCategoryId), toggles chips,
// then saves a FULL-REPLACE list via POST /branches/:id/amenities (the
// useSetAmenities hook, unchanged). A non-owner is read-only.
//
// Fidelity polish: the edit affordance used to toggle chips INLINE in the card
// body (no modal) and every chip showed the same generic Check icon regardless of
// which amenity it was. It now (a) opens a real Dialog matching the prototype -
// own header + close, a "this saves straight away" banner - and (b) renders each
// amenity's OWN iconUrl (branchAmenityLinkSchema / amenitySchema both already
// carry it - it was on the wire, just unread), falling back to the generic Check
// only when an amenity has no iconUrl at all. Save behaviour/endpoint unchanged.
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
import { Dialog } from '@/components/ui/dialog'
import { Check, CheckCircle2, X } from '@/lib/icons'
import { useToast } from '@/components/ui/toast'
import { useSetAmenities } from '@/lib/branches/useBranches'
import { getBranchAmenities, type Amenity, type Branch } from '@/lib/api/branch'
import { useMerchantProfile } from '@/lib/auth/useMerchantProfile'

// The branch's currently-selected amenities, deduped, as { id, name, iconUrl }.
function selectedAmenities(branch: Branch): { id: string; name: string; iconUrl?: string | null }[] {
  return (branch.amenities ?? []).map((a) => ({
    id: a.amenity.id,
    name: a.amenity.name,
    iconUrl: a.amenity.iconUrl,
  }))
}

// Renders an amenity's own icon when it has one; falls back to the generic Check
// only when iconUrl is absent (fidelity-polish: was previously Check for EVERY
// amenity, selected or not).
function AmenityIcon({ iconUrl, color }: { iconUrl?: string | null; color: string }) {
  if (iconUrl) {
    // Small inline catalogue icon (arbitrary catalogue-hosted asset); next/image's
    // remote-domain allow-list is unnecessary overhead for a 14px glyph.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" aria-hidden className="size-3.5 shrink-0 object-contain" />
  }
  return <Check size={14} aria-hidden style={{ color }} />
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

  // Load the catalogue LAZILY: only when an owner actually opens the edit dialog
  // AND a category exists to key the request. View mode (owner or non-owner) never
  // fetches, so a read-only viewer triggers no customer-endpoint GET. SKIPPED
  // entirely when the merchant has no primaryCategoryId (the missing-category
  // fallback never fetches and never reaches edit mode). The catalogue is cached
  // after the first edit open so a re-open does not refetch.
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

  // Consistency hardening (Codex, optional): the dialog must not be dismissable
  // while the "saves straight away" request is in flight, matching the
  // change-password modal pattern. A busy ref (read live off the mutation's
  // isPending) gates Escape + scrim-click (via the Dialog onClose) AND the X/Cancel
  // controls, so an in-flight save can never be interrupted mid-request. The save's
  // own success path still closes the dialog normally (via setEditing(false)).
  const busyRef = React.useRef(false)
  busyRef.current = save.isPending
  // cancel is a plain per-render local closure that only calls stable state setters,
  // so ESLint does not flag it as a missing dep; the ref read is what gates the close.
  const requestClose = React.useCallback(() => {
    if (!busyRef.current) cancel()
  }, [])

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
          {canManage && hasCategory ? (
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
        {!hasCategory ? (
          // Missing-category fallback: current amenities read-only + a note, no edit.
          <>
            <SelectedChips amenities={current} />
            <p className="text-sm text-muted-foreground">
              Amenity editing is unavailable until your business category is set.
            </p>
          </>
        ) : (
          // View: selected chips read-only. Editing happens in the dialog below.
          <SelectedChips amenities={current} />
        )}
      </div>

      {editing ? (
        <Dialog
          label="Edit amenities"
          onClose={requestClose}
          panelTestId="edit-amenities-dialog"
          scrimTestId="edit-amenities-scrim"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-foreground">Edit amenities</h2>
            <button
              type="button"
              onClick={requestClose}
              disabled={save.isPending}
              aria-label="Close"
              className="text-[#6B7390] hover:text-[#010C35] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div
            className="mt-4 flex items-start gap-3 rounded-[14px] p-4"
            style={{ background: 'rgba(15, 122, 62, 0.08)', border: '1px solid rgba(15, 122, 62, 0.24)' }}
          >
            <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
            <p className="text-sm" style={{ color: 'var(--success)' }}>
              <span className="font-semibold">This saves straight away.</span>{' '}
              <span className="text-muted-foreground">Customers see the update as soon as you save.</span>
            </p>
          </div>

          {actionError ? (
            <p
              role="alert"
              className="mt-4 rounded-[10px] border px-3 py-2 text-sm font-medium"
              style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
            >
              {actionError}
            </p>
          ) : null}

          <div className="mt-4 max-h-[50vh] overflow-y-auto pr-1">
            {catalogueLoading && !catalogue ? (
              <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
                Loading the amenity list...
              </div>
            ) : (
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
                      <AmenityIcon iconUrl={a.iconUrl} color={on ? 'var(--rose)' : 'var(--text-tertiary)'} />
                      {a.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancel} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={persist} disabled={save.isPending || (catalogueLoading && !catalogue)}>
              {save.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </Card>
  )
}

function SelectedChips({ amenities }: { amenities: { id: string; name: string; iconUrl?: string | null }[] }) {
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
          <AmenityIcon iconUrl={a.iconUrl} color="var(--success)" />
          {a.name}
        </span>
      ))}
    </div>
  )
}
