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
