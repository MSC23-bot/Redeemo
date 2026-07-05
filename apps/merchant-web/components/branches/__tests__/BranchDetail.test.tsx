/**
 * D-BM1 (merged spec §5 / §8): BranchDetail's own prop-threading logic.
 *
 *   canEditIdentity = ready && canManage && (!isDraftWindow || isOwner)
 *   managed         = ready && canManage
 *
 * This suite stubs every section component so it can assert exactly what
 * BranchDetail computes and passes down, independent of each section's own
 * internal rendering (which is covered by their dedicated test files). The
 * draft-window matrix (owner-in-draft: enabled; BM-in-draft: hidden;
 * BM-live: enabled) is pinned here via the BranchDetailsCard/LocationCard
 * `canManage` prop (their shared `canEditIdentity` composite).
 */
import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import { BranchDetail } from '@/components/branches/BranchDetail'
import type { Branch } from '@/lib/api/branch'

jest.mock('@/components/branches/ReviewStateBanners', () => ({
  ReviewStateBanners: () => null,
}))
// D-BM1 §9 must-not-flip: these four stay isOwner-only in the production diff
// (BranchDetail was NOT changed to pass canManage to any of them). The stubs
// render the exact prop they received so a future accidental flip to
// canManage shows up as a data-gate="canManage" pin below, not a silent pass.
jest.mock('@/components/branches/BranchLifecycleBanner', () => ({
  BranchLifecycleBanner: ({ isOwner }: { isOwner: boolean }) => (
    <div data-testid="stub-lifecycle-banner" data-is-owner={String(isOwner)} />
  ),
}))
jest.mock('@/components/branches/StaffAtBranchCard', () => ({
  StaffAtBranchCard: ({ isOwner }: { isOwner: boolean }) => (
    <div data-testid="stub-staff" data-is-owner={String(isOwner)} />
  ),
}))
jest.mock('@/components/branches/sections/CloseBranchSection', () => ({
  CloseBranchSection: ({ isOwner }: { isOwner: boolean }) => (
    <div data-testid="stub-close" data-is-owner={String(isOwner)} />
  ),
}))
jest.mock('@/components/branches/sections/MainBranchControl', () => ({
  MainBranchControl: ({ isOwner }: { isOwner: boolean }) => (
    <div data-testid="stub-main-branch" data-is-owner={String(isOwner)} />
  ),
}))

jest.mock('@/components/branches/sections/BranchDetailsCard', () => ({
  BranchDetailsCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="stub-branch-details" data-can-manage={String(canManage)} />
  ),
}))
jest.mock('@/components/branches/sections/LocationCard', () => ({
  LocationCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="stub-location" data-can-manage={String(canManage)} />
  ),
}))
jest.mock('@/components/branches/sections/ContactCard', () => ({
  ContactCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="stub-contact" data-can-manage={String(canManage)} />
  ),
}))
jest.mock('@/components/branches/sections/OpeningHoursCard', () => ({
  OpeningHoursCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="stub-hours" data-can-manage={String(canManage)} />
  ),
}))
jest.mock('@/components/branches/sections/PinCard', () => ({
  PinCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="stub-pin" data-can-manage={String(canManage)} />
  ),
}))
jest.mock('@/components/branches/sections/RedemptionAlertsCard', () => ({
  RedemptionAlertsCard: ({ canManage, isOwner }: { canManage: boolean; isOwner: boolean }) => (
    <div data-testid="stub-alerts" data-can-manage={String(canManage)} data-is-owner={String(isOwner)} />
  ),
}))
jest.mock('@/components/branches/sections/AmenitiesCard', () => ({
  AmenitiesCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="stub-amenities" data-can-manage={String(canManage)} />
  ),
}))
jest.mock('@/components/branches/sections/BrandingPhotosCard', () => ({
  BrandingPhotosCard: ({ canManage, isOwner }: { canManage: boolean; isOwner: boolean }) => (
    <div data-testid="stub-branding" data-can-manage={String(canManage)} data-is-owner={String(isOwner)} />
  ),
}))

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    isActive: true,
    openingHours: [],
    ...over,
  } as Branch
}

function renderDetail(props: Partial<ComponentProps<typeof BranchDetail>> = {}) {
  return render(
    <BranchDetail
      branch={branch()}
      businessName="Redeemo for Business"
      isOwner={false}
      canManage={false}
      ready
      {...props}
    />,
  )
}

describe('BranchDetail canManage/canEditIdentity threading', () => {
  it('OWNER, LIVE (no draft window): managed sections + identity sections all canManage=true', () => {
    renderDetail({ isOwner: true, canManage: true, isDraftWindow: false })
    expect(screen.getByTestId('stub-branch-details')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-location')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-contact')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-hours')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-pin')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-amenities')).toHaveAttribute('data-can-manage', 'true')
  })

  it('assigned BM, LIVE (no draft window): managed sections true, identity sections ALSO true (BM-eligible edit-request lane)', () => {
    renderDetail({ isOwner: false, canManage: true, isDraftWindow: false })
    expect(screen.getByTestId('stub-branch-details')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-location')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-contact')).toHaveAttribute('data-can-manage', 'true')
  })

  it('assigned BM, DRAFT WINDOW: identity sections (details/location) canManage=false; managed sections stay true', () => {
    renderDetail({ isOwner: false, canManage: true, isDraftWindow: true })
    expect(screen.getByTestId('stub-branch-details')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('stub-location')).toHaveAttribute('data-can-manage', 'false')
    // Non-identity managed sections are unaffected by the draft-window gate.
    expect(screen.getByTestId('stub-contact')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-hours')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-pin')).toHaveAttribute('data-can-manage', 'true')
  })

  it('OWNER, DRAFT WINDOW: identity sections stay canManage=true (the owner-only direct-write lane)', () => {
    renderDetail({ isOwner: true, canManage: true, isDraftWindow: true })
    expect(screen.getByTestId('stub-branch-details')).toHaveAttribute('data-can-manage', 'true')
    expect(screen.getByTestId('stub-location')).toHaveAttribute('data-can-manage', 'true')
  })

  it('STAFF (canManage=false) regardless of draft window: every section reads canManage=false', () => {
    renderDetail({ isOwner: false, canManage: false, isDraftWindow: false })
    expect(screen.getByTestId('stub-branch-details')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('stub-location')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('stub-contact')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('stub-hours')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('stub-pin')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('stub-amenities')).toHaveAttribute('data-can-manage', 'false')
  })

  it('not ready (ready=false): every managed section reads canManage=false even for an OWNER', () => {
    renderDetail({ isOwner: true, canManage: true, isDraftWindow: false, ready: false })
    expect(screen.getByTestId('stub-branch-details')).toHaveAttribute('data-can-manage', 'false')
    expect(screen.getByTestId('stub-contact')).toHaveAttribute('data-can-manage', 'false')
  })

  it('the dual-prop sections (alerts, branding) receive canManage AND isOwner independently for an assigned BM', () => {
    renderDetail({ isOwner: false, canManage: true, isDraftWindow: false })
    const alerts = screen.getByTestId('stub-alerts')
    expect(alerts).toHaveAttribute('data-can-manage', 'true')
    expect(alerts).toHaveAttribute('data-is-owner', 'false')
    const branding = screen.getByTestId('stub-branding')
    expect(branding).toHaveAttribute('data-can-manage', 'true')
    expect(branding).toHaveAttribute('data-is-owner', 'false')
  })

  it('defaults isDraftWindow to false when the prop is omitted', () => {
    renderDetail({ isOwner: false, canManage: true })
    expect(screen.getByTestId('stub-branch-details')).toHaveAttribute('data-can-manage', 'true')
  })
})

// D-BM1 §9 must-not-flip regressions: an assigned BM (canManage=true) must
// NEVER cause these four owner-only surfaces to read as "managed". They stay
// wired to `isOwner` only - flipping any of them to canManage is the exact
// mutation class this pin exists to catch.
describe('BranchDetail must-not-flip regressions (assigned BM: canManage=true, isOwner=false)', () => {
  it('MainBranchControl, the lifecycle banner, CloseBranchSection, and StaffAtBranchCard all read isOwner=false', () => {
    renderDetail({ isOwner: false, canManage: true, isDraftWindow: false })
    expect(screen.getByTestId('stub-main-branch')).toHaveAttribute('data-is-owner', 'false')
    expect(screen.getByTestId('stub-lifecycle-banner')).toHaveAttribute('data-is-owner', 'false')
    expect(screen.getByTestId('stub-close')).toHaveAttribute('data-is-owner', 'false')
    expect(screen.getByTestId('stub-staff')).toHaveAttribute('data-is-owner', 'false')
  })

  it('for a true OWNER, the same four read isOwner=true (sanity: the gate is isOwner, not canManage)', () => {
    renderDetail({ isOwner: true, canManage: true, isDraftWindow: false })
    expect(screen.getByTestId('stub-main-branch')).toHaveAttribute('data-is-owner', 'true')
    expect(screen.getByTestId('stub-lifecycle-banner')).toHaveAttribute('data-is-owner', 'true')
    expect(screen.getByTestId('stub-close')).toHaveAttribute('data-is-owner', 'true')
    expect(screen.getByTestId('stub-staff')).toHaveAttribute('data-is-owner', 'true')
  })
})
