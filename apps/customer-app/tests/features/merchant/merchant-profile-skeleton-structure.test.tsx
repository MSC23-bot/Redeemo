// §BD-3 — Merchant Profile skeleton structural pins.
//
// The skeleton replaces the centred <RedeemoLoader> in three render
// branches: cold-mount loading, §BD-1 cross-merchant stale, and §BD-3
// branch-switch stale. Locked 2026-05-17 from device-QA: the loading
// affordance must mirror the screen's structural vocabulary so the
// user perceives spatial continuity, not a blank wait.
//
// This file pins the skeleton's anatomy directly (banner / identity
// cluster / meta row / tab bar / voucher cards). Gate-firing pins live
// in the sibling cross-merchant-gate / branch-switch-gate test files;
// here we only assert the component renders the expected scaffolding.

import React from 'react'
import { render } from '@testing-library/react-native'
import { MerchantProfileSkeleton } from '@/features/merchant/components/MerchantProfileSkeleton'

describe('MerchantProfileSkeleton', () => {
  it('renders the canonical testID hook on the root', () => {
    const { getByTestId } = render(<MerchantProfileSkeleton />)
    expect(getByTestId('merchant-profile-skeleton')).toBeTruthy()
  })

  it('preserves the "Loading merchant profile" accessibility label for screen readers', () => {
    const { getByLabelText } = render(<MerchantProfileSkeleton />)
    expect(getByLabelText('Loading merchant profile')).toBeTruthy()
  })

  // Each of the four structural regions is independently testable so a
  // future visual tweak that drops a region by accident is caught.
  it('renders the identity cluster region (logo + name + descriptor)', () => {
    const { getByTestId } = render(<MerchantProfileSkeleton />)
    expect(getByTestId('merchant-profile-skeleton-identity')).toBeTruthy()
  })

  it('renders the meta row region (rating + distance + status pills)', () => {
    const { getByTestId } = render(<MerchantProfileSkeleton />)
    expect(getByTestId('merchant-profile-skeleton-meta')).toBeTruthy()
  })

  it('renders the tab bar region (4 placeholder tab pills)', () => {
    const { getByTestId } = render(<MerchantProfileSkeleton />)
    expect(getByTestId('merchant-profile-skeleton-tabs')).toBeTruthy()
  })

  it('renders the voucher list region', () => {
    const { getByTestId } = render(<MerchantProfileSkeleton />)
    expect(getByTestId('merchant-profile-skeleton-vouchers')).toBeTruthy()
  })

  it('renders three voucher card placeholders (matches the typical above-the-fold count)', () => {
    const { getAllByTestId } = render(<MerchantProfileSkeleton />)
    expect(getAllByTestId('merchant-profile-skeleton-voucher-card')).toHaveLength(3)
  })
})
