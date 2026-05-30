/**
 * Phase 3C.1g M2.5 — `<VoucherFavCard>` state-pill matrix + tap.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { VoucherFavCard } from '../components/VoucherFavCard'
import type { FavouriteVoucherItem } from '@/lib/api/favourites'

function makeRow(overrides: Partial<FavouriteVoucherItem> = {}): FavouriteVoucherItem {
  const base: FavouriteVoucherItem = {
    id:                       'v-1',
    title:                    'BOGO Coffee',
    type:                     'BOGO',
    estimatedSaving:          5,
    description:              null,
    expiresAt:                null,
    status:                   'ACTIVE',
    approvalStatus:           'APPROVED',
    isRedeemedInCurrentCycle: false,
    merchant: {
      id:           'm-1',
      businessName: 'Roast Co',
      logoUrl:      null,
      status:       'ACTIVE',
    },
    favouritedAt:    '2026-05-29T10:00:00.000Z',
    isUnavailable:   false,
    priorityBucket:  2,
  }
  return { ...base, ...overrides }
}

describe('VoucherFavCard — 7-bucket state pill matrix', () => {
  it('bucket 1 → "Urgent · ends soon"', () => {
    const { getByText } = render(
      <VoucherFavCard row={makeRow({ priorityBucket: 1 })} onPress={jest.fn()} />,
    )
    expect(getByText('Urgent · ends soon')).toBeTruthy()
  })

  it('bucket 2 → "Available"', () => {
    const { getByText } = render(
      <VoucherFavCard row={makeRow({ priorityBucket: 2 })} onPress={jest.fn()} />,
    )
    expect(getByText('Available')).toBeTruthy()
  })

  it('bucket 3 → "Cooldown"', () => {
    const { getByText } = render(
      <VoucherFavCard row={makeRow({ priorityBucket: 3, type: 'REUSABLE' })} onPress={jest.fn()} />,
    )
    expect(getByText('Cooldown')).toBeTruthy()
  })

  it('bucket 4 → "Redeemed this cycle"', () => {
    const { getByText } = render(
      <VoucherFavCard
        row={makeRow({ priorityBucket: 4, isRedeemedInCurrentCycle: true, type: 'DISCOUNT_FIXED' })}
        onPress={jest.fn()}
      />,
    )
    expect(getByText('Redeemed this cycle')).toBeTruthy()
  })

  it('bucket 5 → "Outside window"', () => {
    const { getByText } = render(
      <VoucherFavCard row={makeRow({ priorityBucket: 5, type: 'TIME_LIMITED' })} onPress={jest.fn()} />,
    )
    expect(getByText('Outside window')).toBeTruthy()
  })

  it('bucket 6 → "Unavailable"', () => {
    const { getByText } = render(
      <VoucherFavCard row={makeRow({ priorityBucket: 6, isUnavailable: true })} onPress={jest.fn()} />,
    )
    expect(getByText('Unavailable')).toBeTruthy()
  })

  it('bucket 7 → "Expired"', () => {
    const { getByText } = render(
      <VoucherFavCard row={makeRow({ priorityBucket: 7 })} onPress={jest.fn()} />,
    )
    expect(getByText('Expired')).toBeTruthy()
  })
})

describe('VoucherFavCard — tap + saving copy', () => {
  it('press calls onPress', () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <VoucherFavCard row={makeRow()} onPress={onPress} testID="vcard" />,
    )
    fireEvent.press(getByTestId('vcard'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders "Save up to £X.XX" when estimatedSaving > 0', () => {
    const { getByText } = render(
      <VoucherFavCard row={makeRow({ estimatedSaving: 12.5 })} onPress={jest.fn()} />,
    )
    expect(getByText('Save up to £12.50')).toBeTruthy()
  })

  it('does NOT render saving copy when estimatedSaving is 0', () => {
    const { queryByText } = render(
      <VoucherFavCard row={makeRow({ estimatedSaving: 0 })} onPress={jest.fn()} />,
    )
    expect(queryByText(/Save up to/)).toBeNull()
  })
})

// §R2 — Device-QA R1 Wave 2 (2026-05-30) — visible Remove button.
describe('VoucherFavCard — §R2 visible Remove button', () => {
  it('renders the Remove button only when onRemove is provided', () => {
    const { queryByTestId, rerender } = render(
      <VoucherFavCard row={makeRow()} onPress={jest.fn()} testID="vcard" />,
    )
    expect(queryByTestId('vcard-remove')).toBeNull()

    rerender(<VoucherFavCard row={makeRow()} onPress={jest.fn()} onRemove={jest.fn()} testID="vcard" />)
    expect(queryByTestId('vcard-remove')).toBeTruthy()
  })

  it('Remove button press calls onRemove (not onPress)', () => {
    const onPress  = jest.fn()
    const onRemove = jest.fn()
    const { getByTestId } = render(
      <VoucherFavCard row={makeRow()} onPress={onPress} onRemove={onRemove} testID="vcard" />,
    )
    fireEvent.press(getByTestId('vcard-remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('Remove button accessibility label names the voucher title', () => {
    const { getByLabelText } = render(
      <VoucherFavCard row={makeRow()} onPress={jest.fn()} onRemove={jest.fn()} testID="vcard" />,
    )
    expect(getByLabelText('Remove BOGO Coffee from favourites')).toBeTruthy()
  })
})
