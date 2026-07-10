'use client'

/**
 * BranchesTab: rehomes the EXISTING branch-management surface from the old
 * merchant detail page (spec merchant-360-spec.md, Tab 3). Nothing is forked: the
 * branch rows, provenance badges, and the add / edit / delete affordances are
 * moved verbatim, and every Add / Edit / Delete button calls back to the page,
 * which owns the dialog state and mounts the existing dialog components.
 *
 * Capability gates preserved exactly as shipped on the old detail page:
 *   - View: `merchant:read` (the page itself; this tab always renders for a
 *     viewer).
 *   - Per-branch Edit: `merchant:edit` (direct edit of contact / active).
 *   - Add branch + per-branch Delete: `merchant:manage-branches`
 *     (SUPER_ADMIN); Delete is additionally hidden on the main branch (the
 *     backend BRANCH_IS_MAIN guard is the enforcement).
 *
 * Location provenance reads via the shared `LocationProvenanceBadge` (shipped by
 * #444), so a branch's location trust reads consistently with the review queue.
 * The richer LocationTrustPanel and the confirm-location dialog are review/queue
 * surfaces (never wired onto the merchant detail); rehoming them would be net-new
 * work outside A2 scope (recorded divergence).
 */
import { Globe, Mail, MapPin, Phone, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/features/shared/Badge'
import { LocationProvenanceBadge } from '@/features/shared/locationProvenance'
import { Button } from '@/components/ui/button'
import type { BranchDetail, MerchantDetail } from '@/lib/api/merchants'

function addressSummary(branch: BranchDetail): string {
  return [branch.addressLine1, branch.addressLine2, branch.city, branch.postcode]
    .filter((part) => part != null && part !== '')
    .join(', ')
}

function BranchCard({
  branch,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
}: {
  branch: BranchDetail
  canEdit: boolean
  onEdit: (branch: BranchDetail) => void
  canDelete: boolean
  onDelete: (branch: BranchDetail) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid={`branch-card-${branch.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-foreground">{branch.name}</h3>
            {branch.isMainBranch && <Badge tone="info">Main</Badge>}
            <Badge tone={branch.isActive ? 'success' : 'neutral'}>
              {branch.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{addressSummary(branch) || 'No address on file'}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {branch.localityName && (
              <span className="text-xs text-muted-foreground">{branch.localityName}</span>
            )}
            <LocationProvenanceBadge confidence={branch.locationConfidence} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEdit(branch)}
              data-testid={`branch-edit-${branch.id}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
          {canDelete && !branch.isMainBranch && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDelete(branch)}
              data-testid={`branch-delete-${branch.id}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Contact rows */}
      <dl className="mt-3 grid gap-1.5 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span data-testid={`branch-phone-${branch.id}`}>{branch.phone ?? 'Not set'}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span data-testid={`branch-email-${branch.id}`}>{branch.email ?? 'Not set'}</span>
        </div>
        <div className="flex items-center gap-2 text-foreground">
          <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span data-testid={`branch-website-${branch.id}`}>{branch.websiteUrl ?? 'Not set'}</span>
        </div>
      </dl>
    </div>
  )
}

interface BranchesTabProps {
  data: MerchantDetail
  canEdit: boolean
  canManageBranches: boolean
  onAddBranch: () => void
  onEditBranch: (branch: BranchDetail) => void
  onDeleteBranch: (branch: BranchDetail) => void
}

export function BranchesTab({
  data,
  canEdit,
  canManageBranches,
  onAddBranch,
  onEditBranch,
  onDeleteBranch,
}: BranchesTabProps) {
  const { branches } = data

  return (
    <section className="space-y-3" data-testid="workspace-branches">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Branches ({branches.length})</h2>
        {canManageBranches && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddBranch}
            data-testid="merchant-add-branch"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add branch
          </Button>
        )}
      </div>
      {branches.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground" data-testid="merchant-branches-empty">
            This merchant has no branches yet.
          </p>
        </div>
      ) : (
        branches.map((branch) => (
          <BranchCard
            key={branch.id}
            branch={branch}
            canEdit={canEdit}
            onEdit={onEditBranch}
            canDelete={canManageBranches}
            onDelete={onDeleteBranch}
          />
        ))
      )}
    </section>
  )
}
