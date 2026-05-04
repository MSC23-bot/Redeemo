import React from 'react'
import { StyleSheet } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { VoucherCard } from '@/features/merchant/components/VoucherCard'
import type { MerchantVoucher } from '@/lib/api/merchant'

// Visual correction round §3 (post-PR-#35 QA): refined voucher card.
// Tests the structural contracts for the new design — type chip,
// brand-red Save value, Redeem CTA presence, redeemed-state behaviour.
const mk = (overrides?: Partial<MerchantVoucher>): MerchantVoucher => ({
  id: 'v1',
  type: 'FREEBIE',
  title: 'Free Filter Coffee with Any Thali',
  description: 'Order any thali plate and get a complimentary coffee.',
  estimatedSaving: 2.5,
  expiryDate: null,
  terms: 'T&Cs apply',
  imageUrl: null,
  ...overrides,
})

describe('VoucherCard — visual correction §3', () => {
  it('renders the type chip in uppercase + the title + the description', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('FREEBIE')).toBeTruthy()
    expect(getByText('Free Filter Coffee with Any Thali')).toBeTruthy()
    expect(getByText(/complimentary coffee/)).toBeTruthy()
  })

  it('renders the Save value in brand-red bold inline text (no pill chrome)', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ estimatedSaving: 2.5 })}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    const save = getByText('Save £2.5')
    expect(save).toBeTruthy()
    // Verify the Save text uses brand-red (#E20C04) — owner caution:
    // "Save £X must remain visually scannable" + "do not weaken redemption clarity".
    const flatStyle = StyleSheet.flatten(save.props.style)
    expect(flatStyle?.color).toBe('#E20C04')
    expect(flatStyle?.fontWeight).toBe('800')
  })

  it('renders "Redeem now" CTA in brand-red on non-redeemed vouchers', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(getByText('Redeem now')).toBeTruthy()
  })

  it('replaces the Redeem CTA with REDEEMED stamp when isRedeemed', () => {
    const { queryByText, getByText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    expect(queryByText('Redeem now')).toBeNull()
    expect(getByText('REDEEMED')).toBeTruthy()
  })

  it('Save value goes muted when isRedeemed (not brand-red)', () => {
    const { getByText } = render(
      <VoucherCard
        voucher={mk({ estimatedSaving: 5 })}
        isRedeemed={true}
        isFavourited={false}
        onPress={() => {}}
        onToggleFavourite={() => {}}
      />,
    )
    const save = getByText('Save £5')
    const flatStyle = StyleSheet.flatten(save.props.style)
    expect(flatStyle?.color).toBe('#9CA3AF')
  })

  it('fires onPress when card body tapped', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={onPress}
        onToggleFavourite={() => {}}
      />,
    )
    fireEvent.press(getByLabelText(/FREEBIE voucher/))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('fires onToggleFavourite when heart tapped (not card onPress)', () => {
    const onPress = jest.fn()
    const onToggleFavourite = jest.fn()
    const { getByLabelText } = render(
      <VoucherCard
        voucher={mk()}
        isRedeemed={false}
        isFavourited={false}
        onPress={onPress}
        onToggleFavourite={onToggleFavourite}
      />,
    )
    fireEvent.press(getByLabelText('Add to favourites'))
    expect(onToggleFavourite).toHaveBeenCalledTimes(1)
  })

  it('renders the type chip differently for each voucher type (preserves semantic via colour)', () => {
    const types: Array<{ type: MerchantVoucher['type']; label: string }> = [
      { type: 'FREEBIE',          label: 'FREEBIE' },
      { type: 'BOGO',             label: 'BOGO' },
      { type: 'DISCOUNT_FIXED',   label: 'DISCOUNT' },
      { type: 'SPEND_AND_SAVE',   label: 'SPEND & SAVE' },
      { type: 'PACKAGE_DEAL',     label: 'PACKAGE' },
      { type: 'TIME_LIMITED',     label: 'TIME-LIMITED' },
      { type: 'REUSABLE',         label: 'REUSABLE' },
    ]
    for (const t of types) {
      const { getByText } = render(
        <VoucherCard
          voucher={mk({ type: t.type })}
          isRedeemed={false}
          isFavourited={false}
          onPress={() => {}}
          onToggleFavourite={() => {}}
        />,
      )
      expect(getByText(t.label)).toBeTruthy()
    }
  })
})
