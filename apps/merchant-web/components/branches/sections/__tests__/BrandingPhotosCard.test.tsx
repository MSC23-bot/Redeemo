import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrandingPhotosCard } from '@/components/branches/sections/BrandingPhotosCard'
import { ApiError } from '@/lib/api/client'
import type { Branch } from '@/lib/api/branch'

// Branches PR-3 §7: the photo GALLERY review lane. The card now renders REAL
// per-photo state (replacing PR-1's blanket-"Approved"):
//   - APPROVED rows (branch.photos moderationStatus APPROVED) = the live gallery,
//     each with an OWNER-only Remove (X) that calls the instant-removal route.
//   - IN-REVIEW thumbnails come from the open PENDING photo edit's add URLs (no
//     remove). The "X in review" counter = that add-URL count.
//   - OWNER "Add photo" uploads via the branch-scoped upload then opens an
//     add-via-review request. Non-owner = read-only (no Add, no Remove).

// --- the F7 edit modal: a stub so we can assert the header Edit opens it ------
const modalRendered = jest.fn()
jest.mock('@/components/branches/BranchDetailsEditModal', () => ({
  BranchDetailsEditModal: ({ onClose }: { onClose: () => void }) => {
    modalRendered()
    return (
      <div data-testid="f7-edit-modal">
        <button type="button" onClick={onClose}>
          close modal
        </button>
      </div>
    )
  },
}))

// --- toast -------------------------------------------------------------------
const toast = jest.fn()
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast }) }))

// --- the photo API client: uploadBranchPhoto + requestBranchPhotoEdit (Add) and
// removeBranchPhoto (Remove). We mock the client module so the card's mutations
// resolve without a network call. The hooks (useRequestBranchPhotoEdit /
// useRemoveBranchPhoto) call straight through to these.
const uploadBranchPhoto = jest.fn()
const requestBranchPhotoEdit = jest.fn()
const removeBranchPhoto = jest.fn()
jest.mock('@/lib/api/branch', () => {
  const actual = jest.requireActual('@/lib/api/branch')
  return {
    ...actual,
    uploadBranchPhoto: (...a: unknown[]) => uploadBranchPhoto(...a),
    requestBranchPhotoEdit: (...a: unknown[]) => requestBranchPhotoEdit(...a),
    removeBranchPhoto: (...a: unknown[]) => removeBranchPhoto(...a),
  }
})

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    logoUrl: 'https://cdn/logo.png',
    bannerUrl: 'https://cdn/banner.png',
    isActive: true,
    photos: [
      { id: 'p1', url: 'https://cdn/p1.png', moderationStatus: 'APPROVED' },
      { id: 'p2', url: 'https://cdn/p2.png', moderationStatus: 'APPROVED' },
    ],
    pendingEdits: [],
    ...over,
  } as Branch
}

// D-BM1: BrandingPhotosCard now takes BOTH `canManage` (the D-BM1 flip - gates
// ONLY Add-photo + its file input) and `isOwner` (unchanged owner-only gate for
// the header Edit + per-photo Remove - the §9 must-not-flip list). Legacy
// call sites pass a single boolean that drives both (owner: true/true,
// non-owner: false/false); the D-BM1 permutation tests below pass them
// independently to prove the two gates are now distinct.
function renderCard(b: Branch, capability: boolean | { canManage: boolean; isOwner: boolean } = true) {
  const { canManage, isOwner } =
    typeof capability === 'boolean' ? { canManage: capability, isOwner: capability } : capability
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BrandingPhotosCard branch={b} canManage={canManage} isOwner={isOwner} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  modalRendered.mockReset()
  toast.mockReset()
  uploadBranchPhoto.mockReset()
  requestBranchPhotoEdit.mockReset()
  removeBranchPhoto.mockReset()
})

describe('BrandingPhotosCard approved gallery', () => {
  it('renders only APPROVED photos in the live gallery with an Approved marker (PENDING + FLAGGED excluded)', () => {
    const b = branch({
      photos: [
        { id: 'p1', url: 'https://cdn/p1.png', moderationStatus: 'APPROVED' },
        { id: 'p2', url: 'https://cdn/p2.png', moderationStatus: 'APPROVED' },
        // P3 hardening: a PENDING row must NOT show as a live approved photo.
        { id: 'p3', url: 'https://cdn/p3.png', moderationStatus: 'PENDING' },
        // P3 hardening: a FLAGGED row must NOT show as a live approved photo.
        { id: 'p4', url: 'https://cdn/p4.png', moderationStatus: 'FLAGGED' },
      ],
    })
    renderCard(b)
    // Strict gate: ONLY the two APPROVED rows render; the approved count excludes
    // the PENDING + FLAGGED rows.
    const photos = screen.getAllByTestId('branch-photo')
    expect(photos).toHaveLength(2)
    for (const fig of photos) {
      expect(within(fig).getByText(/approved/i)).toBeInTheDocument()
    }
    // Belt-and-braces: the PENDING + FLAGGED image elements never render in the gallery
    // (only the two APPROVED <img> srcs are present; p3/p4 are excluded by the strict gate).
    const renderedSrcs = photos.map(
      (fig) => fig.querySelector('img')?.getAttribute('src') ?? '',
    )
    expect(renderedSrcs.join('|')).not.toContain('p3.png')
    expect(renderedSrcs.join('|')).not.toContain('p4.png')
  })

  it('renders an APPROVED photo and hides a lone PENDING photo (empty live gallery)', () => {
    // A branch whose only photo is PENDING shows ZERO live photos (strict gate).
    const pendingOnly = branch({
      photos: [{ id: 'p1', url: 'https://cdn/p1.png', moderationStatus: 'PENDING' }],
    })
    renderCard(pendingOnly)
    expect(screen.queryAllByTestId('branch-photo')).toHaveLength(0)

    // An APPROVED photo IS rendered.
    const approvedOnly = branch({
      photos: [{ id: 'p1', url: 'https://cdn/p1.png', moderationStatus: 'APPROVED' }],
    })
    renderCard(approvedOnly)
    expect(screen.getAllByTestId('branch-photo')).toHaveLength(1)
  })

  it('renders in-review thumbnails from the open pending edit add URLs with the correct counter', () => {
    const b = branch({
      pendingEdits: [
        {
          id: 'pe1',
          branchId: 'b1',
          merchantId: 'm1',
          proposedChanges: { add: ['https://cdn/new1.png', 'https://cdn/new2.png'] },
          includesPhotos: true,
          status: 'PENDING',
          createdAt: '2026-06-23T00:00:00.000Z',
        },
      ],
    })
    renderCard(b)
    expect(screen.getAllByTestId('branch-photo-in-review')).toHaveLength(2)
    expect(screen.getByTestId('photos-in-review-counter')).toHaveTextContent(/2 in review/i)
    // In-review thumbnails carry NO remove control.
    const reviewTiles = screen.getAllByTestId('branch-photo-in-review')
    for (const t of reviewTiles) {
      expect(within(t).queryByTestId('branch-photo-remove')).not.toBeInTheDocument()
    }
  })

  it('shows no in-review counter when there is no pending photo edit', () => {
    renderCard(branch())
    expect(screen.queryByTestId('photos-in-review-counter')).not.toBeInTheDocument()
  })
})

describe('BrandingPhotosCard owner-only gating', () => {
  it('owner sees the header Edit, per-photo Remove, and Add photo', () => {
    renderCard(branch(), true)
    expect(screen.getByRole('button', { name: /^edit/i })).toBeInTheDocument()
    expect(screen.getAllByTestId('branch-photo-remove')).toHaveLength(2)
    expect(screen.getByTestId('branch-photo-add')).toBeInTheDocument()
  })

  it('non-owner sees the gallery read-only (no Edit, no Remove, no Add)', () => {
    renderCard(branch(), false)
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-photo-remove')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-photo-add')).not.toBeInTheDocument()
    // The photos still render for everyone.
    expect(screen.getAllByTestId('branch-photo')).toHaveLength(2)
  })

  it('owner Edit opens the F7 BranchDetailsEditModal', () => {
    renderCard(branch())
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))
    expect(screen.getByTestId('f7-edit-modal')).toBeInTheDocument()
    expect(modalRendered).toHaveBeenCalled()
  })
})

// D-BM1 (merged spec §9): Add-photo (+ its file input) FLIP to
// effectiveCanManage; the header Edit + per-photo Remove stay isOwner-only
// (the explicit D-PR3-4 owner-only exception - untouched by this change).
describe('BrandingPhotosCard D-BM1 flip: assigned Branch Manager', () => {
  it('an assigned BM (canManage=true, isOwner=false) sees Add photo but NOT Edit or Remove', () => {
    renderCard(branch(), { canManage: true, isOwner: false })
    expect(screen.getByTestId('branch-photo-add')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-photo-remove')).not.toBeInTheDocument()
    // The gallery itself still renders for everyone.
    expect(screen.getAllByTestId('branch-photo')).toHaveLength(2)
  })

  it('STAFF (canManage=false, isOwner=false) sees none of Edit, Remove, or Add', () => {
    renderCard(branch(), { canManage: false, isOwner: false })
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-photo-remove')).not.toBeInTheDocument()
    expect(screen.queryByTestId('branch-photo-add')).not.toBeInTheDocument()
  })
})

// Fidelity polish (2026-07-07 audit): the empty-banner slot used to render a
// LockedAffordance claiming banner upload was "Coming in this Branches rollout" -
// stale, since it already works via the header Edit button. It must now show a
// plain empty state (owner-pointer to Edit), never the rollout copy.
describe('BrandingPhotosCard empty banner state', () => {
  it('shows a plain empty state pointing to Edit for an owner, never the stale "coming soon" copy', () => {
    renderCard(branch({ bannerUrl: null }), true)
    expect(screen.queryByText(/coming in this branches rollout/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('banner-empty-state')).toHaveTextContent(/add one via edit above/i)
  })

  it('shows a plain empty state with no Edit pointer for a non-owner', () => {
    renderCard(branch({ bannerUrl: null }), false)
    expect(screen.queryByText(/coming in this branches rollout/i)).not.toBeInTheDocument()
    const emptyState = screen.getByTestId('banner-empty-state')
    expect(emptyState).toHaveTextContent(/no banner yet/i)
    expect(emptyState).not.toHaveTextContent(/edit/i)
  })

  it('still renders the live banner image via Edit-based upload when bannerUrl is set (Edit upload untouched)', () => {
    renderCard(branch({ bannerUrl: 'https://cdn/banner.png' }), true)
    expect(screen.queryByTestId('banner-empty-state')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))
    expect(screen.getByTestId('f7-edit-modal')).toBeInTheDocument()
  })
})

describe('BrandingPhotosCard remove (instant)', () => {
  it('owner Remove calls the DELETE client and toasts on success', async () => {
    removeBranchPhoto.mockResolvedValue(undefined)
    renderCard(branch())
    fireEvent.click(screen.getAllByTestId('branch-photo-remove')[0])
    await waitFor(() => expect(removeBranchPhoto).toHaveBeenCalledWith('b1', 'p1'))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })

  it('handles a 409 PHOTO_NOT_REMOVABLE calmly with an error toast (no crash)', async () => {
    removeBranchPhoto.mockRejectedValue(new ApiError(409, { error: { code: 'PHOTO_NOT_REMOVABLE' } }))
    renderCard(branch())
    fireEvent.click(screen.getAllByTestId('branch-photo-remove')[0])
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' })),
    )
    // The gallery is still intact (no crash).
    expect(screen.getAllByTestId('branch-photo')).toHaveLength(2)
  })
})

describe('BrandingPhotosCard add (upload then review request)', () => {
  function pickFile() {
    const input = screen.getByLabelText(/add branch photo/i) as HTMLInputElement
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    return file
  }

  it('uploads then submits the edit-request and confirms submission', async () => {
    uploadBranchPhoto.mockResolvedValue({ url: 'https://cdn/uploaded.png' })
    requestBranchPhotoEdit.mockResolvedValue(undefined)
    renderCard(branch())

    pickFile()

    await waitFor(() => expect(uploadBranchPhoto).toHaveBeenCalledWith('b1', expect.any(File)))
    await waitFor(() =>
      expect(requestBranchPhotoEdit).toHaveBeenCalledWith('b1', ['https://cdn/uploaded.png']),
    )
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    )
  })

  it('surfaces PENDING_EDIT_EXISTS calmly when a change is already in review', async () => {
    uploadBranchPhoto.mockResolvedValue({ url: 'https://cdn/uploaded.png' })
    requestBranchPhotoEdit.mockRejectedValue(
      new ApiError(409, { error: { code: 'PENDING_EDIT_EXISTS' } }),
    )
    renderCard(branch())

    pickFile()

    await waitFor(() =>
      expect(screen.getByTestId('branch-photo-add-error')).toHaveTextContent(/already in review/i),
    )
  })

  it('disables Add while a photo change is already in review', () => {
    const b = branch({
      pendingEdits: [
        {
          id: 'pe1',
          branchId: 'b1',
          merchantId: 'm1',
          proposedChanges: { add: ['https://cdn/new1.png'] },
          includesPhotos: true,
          status: 'PENDING',
          createdAt: '2026-06-23T00:00:00.000Z',
        },
      ],
    })
    renderCard(b)
    expect(screen.getByTestId('branch-photo-add')).toBeDisabled()
  })
})
