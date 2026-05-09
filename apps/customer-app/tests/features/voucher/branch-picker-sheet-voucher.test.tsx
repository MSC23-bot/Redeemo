import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children ?? null,
}))
jest.mock('@/design-system/motion/BottomSheet', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BottomSheet: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'bottom-sheet' }, children) : null,
  }
})
jest.mock('@/design-system/haptics', () => ({
  lightHaptic: jest.fn(),
}))

import {
  BranchPickerSheet,
  type PickerBranch,
} from '@/features/voucher/components/BranchPickerSheet'

const branches: PickerBranch[] = [
  { id: 'b1', name: 'Brightlingsea', city: 'Brightlingsea', distanceMetres: 1500 },
  { id: 'b2', name: 'Colchester',    city: 'Colchester',    distanceMetres: 12_000 },
  { id: 'b3', name: 'Wivenhoe',      city: 'Wivenhoe',      distanceMetres: null  },
]

function defaults(overrides: Partial<React.ComponentProps<typeof BranchPickerSheet>> = {}) {
  return {
    visible: true,
    branches,
    currentBranchId: 'b1',
    onConfirm: jest.fn(),
    onDismiss: jest.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof BranchPickerSheet>
}

describe('Voucher BranchPickerSheet — render + selection', () => {
  it('renders nothing when visible=false', () => {
    const { queryByTestId } = render(<BranchPickerSheet {...defaults({ visible: false })} />)
    expect(queryByTestId('voucher-branch-picker-sheet')).toBeNull()
  })

  it('renders all branches passed in (caller filters out inactive)', () => {
    const { getByTestId } = render(<BranchPickerSheet {...defaults()} />)
    expect(getByTestId('branch-picker-row-b1')).toBeTruthy()
    expect(getByTestId('branch-picker-row-b2')).toBeTruthy()
    expect(getByTestId('branch-picker-row-b3')).toBeTruthy()
  })

  it('shows distance when provided + handles missing distance gracefully', () => {
    const { getAllByText, getByTestId } = render(<BranchPickerSheet {...defaults()} />)
    expect(getAllByText(/0\.9 mi/).length).toBeGreaterThan(0)  // 1500m → 0.9 mi
    expect(getAllByText(/7\.5 mi/).length).toBeGreaterThan(0)  // 12000m → 7.5 mi
    // b3 has no distance — row still renders, just without a mi suffix.
    expect(getByTestId('branch-picker-row-b3')).toBeTruthy()
  })

  it('initial selection mirrors currentBranchId', () => {
    const { getByTestId } = render(<BranchPickerSheet {...defaults({ currentBranchId: 'b2' })} />)
    expect(getByTestId('branch-picker-row-b2').props.accessibilityState).toEqual({ selected: true })
    expect(getByTestId('branch-picker-row-b1').props.accessibilityState).toEqual({ selected: false })
  })
})

describe('Voucher BranchPickerSheet — preview / confirm flow', () => {
  it('tapping a row updates preview but does NOT fire onConfirm', () => {
    const onConfirm = jest.fn()
    const { getByTestId } = render(<BranchPickerSheet {...defaults({ onConfirm })} />)

    fireEvent.press(getByTestId('branch-picker-row-b2'))

    // Preview state changed: b2 is now selected, b1 no longer selected.
    expect(getByTestId('branch-picker-row-b2').props.accessibilityState).toEqual({ selected: true })
    expect(getByTestId('branch-picker-row-b1').props.accessibilityState).toEqual({ selected: false })

    // CRITICAL: onConfirm did NOT fire on row-tap. This differs from the
    // merchant-profile picker (which commits on row-tap).
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Confirm CTA fires onConfirm with the previewed branch id', () => {
    const onConfirm = jest.fn()
    const { getByTestId } = render(<BranchPickerSheet {...defaults({ onConfirm })} />)

    fireEvent.press(getByTestId('branch-picker-row-b2'))
    fireEvent.press(getByTestId('branch-picker-confirm'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('b2')
  })

  it('Confirm with no preview change still uses currentBranchId', () => {
    // User opens picker, decides current branch is correct, taps confirm.
    const onConfirm = jest.fn()
    const { getByTestId } = render(
      <BranchPickerSheet {...defaults({ onConfirm, currentBranchId: 'b1' })} />,
    )
    fireEvent.press(getByTestId('branch-picker-confirm'))
    expect(onConfirm).toHaveBeenCalledWith('b1')
  })

  it('Confirm is disabled when there is no preview AND no currentBranchId', () => {
    const onConfirm = jest.fn()
    const { getByTestId } = render(
      <BranchPickerSheet {...defaults({ onConfirm, currentBranchId: null })} />,
    )
    const confirm = getByTestId('branch-picker-confirm')
    expect(confirm.props.accessibilityState).toEqual({ disabled: true })
    fireEvent.press(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('preview resets when sheet reopens (new visibility cycle)', () => {
    const onConfirm = jest.fn()
    const { getByTestId, rerender } = render(
      <BranchPickerSheet {...defaults({ onConfirm })} />,
    )
    // Mid-preview change.
    fireEvent.press(getByTestId('branch-picker-row-b2'))
    expect(getByTestId('branch-picker-row-b2').props.accessibilityState).toEqual({ selected: true })

    // Sheet hides + re-opens with same currentBranchId.
    rerender(<BranchPickerSheet {...defaults({ onConfirm, visible: false })} />)
    rerender(<BranchPickerSheet {...defaults({ onConfirm, visible: true, currentBranchId: 'b1' })} />)

    // Preview snaps back to the (new) currentBranchId.
    expect(getByTestId('branch-picker-row-b1').props.accessibilityState).toEqual({ selected: true })
  })
})

// Locked 2026-05-07 from device QA edge-case review. The
// orchestrator filters merchant.branches by `isActive` BEFORE
// passing them in, so the picker only sees active rows. But
// `currentBranchId` could still point at a branch that was filtered
// out (e.g. the URL ?branch= param targets a recently-deactivated
// branch, or carries an id from a merchant the user is no longer
// visiting). Pre-fix: previewId initialised to that hidden id, and
// Confirm submitted it to the parent — backend then rejected with
// BRANCH_UNAVAILABLE. Post-fix: previewId normalises to null until
// the user picks a row that is visibly available in the sheet.

describe('Voucher BranchPickerSheet — PR-B T8l visual contract (impeccable pass)', () => {
  // The impeccable pass on this sheet locks four visual contracts:
  //   1. Title is Mustica Pro Semibold display.sm 22pt (was heading.md
  //      Lato Semibold 18pt).  DESIGN.md "Mustica-for-Display Rule"
  //      applies to the gateway-moment between browsing and redeeming.
  //   2. Branch rows are a list with hairline dividers, NOT bordered
  //      cards.  DESIGN.md "No-Card-On-Card Rule" — rows inside a sheet
  //      that's already a card-like surface should not nest cards.
  //   3. Selected row uses surface-tint warm cream `#FEF6F5` for its
  //      bg (NOT `color.cream` which is reserved for identity zones).
  //   4. CTA borderRadius is radius.md (12) per DESIGN.md
  //      "Buttons Shape: rounded-md (12px) on every variant".
  //
  // These pins guard against future regressions that would soften the
  // refactor (e.g. re-introducing per-row bordered cards or swapping
  // back to heading.md for the title).

  function flat(node: any): Record<string, any> {
    const s = node?.props?.style
    if (!s) return {}
    if (Array.isArray(s)) return Object.assign({}, ...s.flat(Infinity).filter(Boolean))
    return s
  }

  it('title uses Mustica Pro Semibold display.sm 22pt with tight tracking (Mustica-for-Display Rule)', () => {
    const { getByText } = render(<BranchPickerSheet {...defaults()} />)
    const title = getByText('Confirm redemption branch')
    const style = flat(title)
    expect(style.fontFamily).toBe('MusticaPro-SemiBold')
    expect(style.fontSize).toBe(22)
    // Tight tracking signature: -0.3.  The previous heading.md baseline
    // had no negative tracking; if a regression reverts to heading.md
    // OR drops the tracking, this pin fails.
    expect(style.letterSpacing).toBe(-0.3)
  })

  it('branch rows are a list with hairline dividers, NOT bordered cards (No-Card-On-Card Rule)', () => {
    // Render with currentBranchId NOT in the default list so we can
    // pin all three rows as not-selected — the selected-row bg is the
    // ONE bg allowed by the contract; non-selected rows carry no bg.
    const { getByTestId } = render(
      <BranchPickerSheet {...defaults({ currentBranchId: 'INACTIVE-X' })} />,
    )
    const row1 = getByTestId('branch-picker-row-b1')
    const row2 = getByTestId('branch-picker-row-b2')
    const row3 = getByTestId('branch-picker-row-b3')
    const s1 = flat(row1)
    const s2 = flat(row2)
    const s3 = flat(row3)
    // Hairline divider is present on non-last rows.
    expect(s1.borderBottomWidth).toBeGreaterThan(0)
    expect(s2.borderBottomWidth).toBeGreaterThan(0)
    // Last row drops the divider so the list ends cleanly.
    expect(s3.borderBottomWidth ?? 0).toBe(0)
    // Negative pin: the previous bordered-card-per-row contract MUST
    // NOT resurface — `borderWidth` (ALL sides) belongs only to a
    // card variant, never on these list rows.
    expect(s1.borderWidth).toBeUndefined()
    expect(s2.borderWidth).toBeUndefined()
    expect(s3.borderWidth).toBeUndefined()
    // Negative pin: non-selected rows do NOT carry a per-row bg
    // (the previous contract used surface.raised on every row).  The
    // ONE bg the contract allows is on the selected row and is
    // covered by the next test in this describe block.
    expect(s1.backgroundColor).toBeUndefined()
    expect(s2.backgroundColor).toBeUndefined()
    expect(s3.backgroundColor).toBeUndefined()
  })

  it('selected row uses surface-tint warm cream (NOT identity-zone cream) per Cream-for-Identity Rule', () => {
    const { getByTestId } = render(<BranchPickerSheet {...defaults({ currentBranchId: 'b2' })} />)
    const selectedRow = getByTestId('branch-picker-row-b2')
    const style = flat(selectedRow)
    // surface-tint = '#FEF6F5'.  This is the quieter cream-adjacent
    // reserved for state moments.  `color.cream` (#FFF9F5) is reserved
    // for identity-zone framing (auth chrome, voucher hero).
    expect(style.backgroundColor).toBe('#FEF6F5')
    // Negative pin: the previous identity-cream `#FFF9F5` MUST NOT
    // resurface as the selected-row bg (would conflate state with
    // identity per DESIGN.md "Cream-for-Identity Rule").
    expect(style.backgroundColor).not.toBe('#FFF9F5')
  })

  it('confirm CTA uses borderRadius 12 (radius.md) per DESIGN.md button-primary-lg spec', () => {
    const { getByTestId } = render(<BranchPickerSheet {...defaults()} />)
    const cta = getByTestId('branch-picker-confirm')
    const style = flat(cta)
    // DESIGN.md "Buttons Shape: rounded-md (12px) on every variant".
    // The previous contract used radius.lg (16) which read as
    // chunkier than the brand voice.
    expect(style.borderRadius).toBe(12)
    // Negative pin: 16 MUST NOT resurface.
    expect(style.borderRadius).not.toBe(16)
  })

  it('confirm CTA shadow softened to 0.20 / 18 (was 0.30 / 24) per Glow-is-the-CTA Rule', () => {
    const { getByTestId } = render(<BranchPickerSheet {...defaults()} />)
    const cta = getByTestId('branch-picker-confirm')
    const style = flat(cta)
    expect(style.shadowOpacity).toBe(0.20)
    expect(style.shadowRadius).toBe(18)
    // Negative pins: the louder previous values MUST NOT resurface.
    expect(style.shadowOpacity).not.toBe(0.30)
    expect(style.shadowRadius).not.toBe(24)
  })
})

describe('Voucher BranchPickerSheet — currentBranchId not in branches (stale-id safety)', () => {
  it('initialises previewId to null when currentBranchId is not present in the visible branches list', () => {
    // The orchestrator filtered out 'INACTIVE-X' (e.g. it's
    // suspended), so the picker sees [b1, b2, b3]. The URL still
    // says branch=INACTIVE-X. The picker MUST NOT pre-select it.
    const onConfirm = jest.fn()
    const { queryByTestId, getByTestId } = render(
      <BranchPickerSheet {...defaults({ onConfirm, currentBranchId: 'INACTIVE-X' })} />,
    )
    // No row is pre-selected (the hidden id can't render a row).
    expect(getByTestId('branch-picker-row-b1').props.accessibilityState).toEqual({ selected: false })
    expect(getByTestId('branch-picker-row-b2').props.accessibilityState).toEqual({ selected: false })
    expect(getByTestId('branch-picker-row-b3').props.accessibilityState).toEqual({ selected: false })
    // No row exists for the hidden id.
    expect(queryByTestId('branch-picker-row-INACTIVE-X')).toBeNull()
  })

  it('Confirm is disabled when currentBranchId is not in branches AND user has not yet picked a visible row', () => {
    const onConfirm = jest.fn()
    const { getByTestId } = render(
      <BranchPickerSheet {...defaults({ onConfirm, currentBranchId: 'INACTIVE-X' })} />,
    )
    const confirm = getByTestId('branch-picker-confirm')
    // Disabled — pressing it is a no-op, the hidden id is never sent.
    expect(confirm.props.accessibilityState).toEqual({ disabled: true })
    fireEvent.press(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Confirm enables once the user picks a visible active row, and submits THAT row id (not the stale currentBranchId)', () => {
    const onConfirm = jest.fn()
    const { getByTestId } = render(
      <BranchPickerSheet {...defaults({ onConfirm, currentBranchId: 'INACTIVE-X' })} />,
    )
    // Initially Confirm is disabled.
    expect(getByTestId('branch-picker-confirm').props.accessibilityState).toEqual({ disabled: true })

    // User taps b2 — preview now b2.
    fireEvent.press(getByTestId('branch-picker-row-b2'))
    expect(getByTestId('branch-picker-row-b2').props.accessibilityState).toEqual({ selected: true })
    // Confirm is now enabled.
    expect(getByTestId('branch-picker-confirm').props.accessibilityState).toEqual({ disabled: false })

    fireEvent.press(getByTestId('branch-picker-confirm'))
    // CRITICAL: Confirm submits b2, NOT the stale 'INACTIVE-X' id.
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('b2')
  })
})
