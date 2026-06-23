import { render, screen, fireEvent, within } from '@testing-library/react'
import { BrandingPhotosCard } from '@/components/branches/sections/BrandingPhotosCard'
import type { Branch } from '@/lib/api/branch'

// Branches PR-1 F11: branding + photos display (prototype 05/06/09). It shows the logo
// mark + banner hero + the photo gallery read-only with approved / in-review markers
// and an in-review counter (driven by pendingEdits where includesPhotos). Logo/banner
// EDIT opens the F7 BranchDetailsEditModal (owner-only); F11 does NOT build a separate
// logo/banner editor. The photo "Add photo" / "Add a new banner" controls are DISABLED
// locked affordances (PR-3); F11 must NEVER call requestBranchPhotoEdit.

// --- the F7 edit modal: a stub so we can assert F11 opens it (not a separate editor) -
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

// --- the photo-edit client: must NEVER be called in PR-1 ---------------------
const requestBranchPhotoEdit = jest.fn()
jest.mock('@/lib/api/branch', () => {
  const actual = jest.requireActual('@/lib/api/branch')
  return { ...actual, requestBranchPhotoEdit: (...args: unknown[]) => requestBranchPhotoEdit(...args) }
})

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    logoUrl: 'https://cdn/logo.png',
    bannerUrl: 'https://cdn/banner.png',
    isActive: true,
    photos: [
      { id: 'p1', url: 'https://cdn/p1.png' },
      { id: 'p2', url: 'https://cdn/p2.png' },
    ],
    pendingEdits: [],
    ...over,
  } as Branch
}

beforeEach(() => {
  modalRendered.mockReset()
  requestBranchPhotoEdit.mockReset()
})

describe('BrandingPhotosCard display', () => {
  it('renders the photo grid read-only with one Approved marker per photo', () => {
    render(<BrandingPhotosCard branch={branch()} isOwner />)
    // Two photos in the fixture; each carries its own "Approved" figcaption marker.
    const photos = screen.getAllByTestId('branch-photo')
    expect(photos).toHaveLength(2)
    for (const fig of photos) {
      expect(within(fig).getByText(/approved/i)).toBeInTheDocument()
    }
  })

  it('shows an in-review counter driven by pendingEdits with includesPhotos', () => {
    const b = branch({
      pendingEdits: [
        {
          id: 'pe1',
          branchId: 'b1',
          merchantId: 'm1',
          proposedChanges: { add: ['x'] },
          includesPhotos: true,
          status: 'PENDING',
          createdAt: '2026-06-23T00:00:00.000Z',
        },
      ],
    })
    render(<BrandingPhotosCard branch={b} isOwner />)
    expect(screen.getByTestId('photos-in-review-counter')).toHaveTextContent(/1 in review/i)
  })

  it('shows no in-review counter when there are no photo edits in review', () => {
    render(<BrandingPhotosCard branch={branch()} isOwner />)
    expect(screen.queryByTestId('photos-in-review-counter')).not.toBeInTheDocument()
  })
})

describe('BrandingPhotosCard logo/banner edit routes into the F7 modal (owner-only)', () => {
  it('owner Edit opens the F7 BranchDetailsEditModal', () => {
    render(<BrandingPhotosCard branch={branch()} isOwner />)
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }))
    expect(screen.getByTestId('f7-edit-modal')).toBeInTheDocument()
    expect(modalRendered).toHaveBeenCalled()
  })

  it('does not show the logo/banner Edit control for a non-owner', () => {
    render(<BrandingPhotosCard branch={branch()} isOwner={false} />)
    expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument()
  })
})

describe('BrandingPhotosCard locked photo controls', () => {
  it('renders "Add photo" disabled and never calls requestBranchPhotoEdit', () => {
    render(<BrandingPhotosCard branch={branch()} isOwner />)
    const addPhoto = screen.getByRole('button', { name: /add photo/i })
    expect(addPhoto).toBeDisabled()
    fireEvent.click(addPhoto)
    expect(requestBranchPhotoEdit).not.toHaveBeenCalled()
  })

  it('renders a locked banner-add affordance when no banner is set, and calls nothing', () => {
    render(<BrandingPhotosCard branch={branch({ bannerUrl: null })} isOwner />)
    const addBanner = screen.getByRole('button', { name: /banner/i })
    expect(addBanner).toBeDisabled()
    fireEvent.click(addBanner)
    expect(requestBranchPhotoEdit).not.toHaveBeenCalled()
  })
})
