/**
 * RedemptionsFilterBar (B3): pins the search input's honest copy. The backend
 * 'code' param matches the redemption-code PREFIX OR the voucher TITLE
 * (src/api/admin/redemptions/service.ts buildAdminRedemptionWhere), so the
 * placeholder/label must say so rather than implying a code-only search -
 * shared by the global page and the per-merchant Merchant 360 Redemptions tab.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RedemptionsFilterBar } from '../RedemptionsFilterBar'

function noop() {}

describe('RedemptionsFilterBar search copy honesty', () => {
  it('the search input placeholder names BOTH code and voucher title', () => {
    render(
      <RedemptionsFilterBar
        statusFilter="all"
        onStatusChange={noop}
        codeInput=""
        onCodeInputChange={noop}
        onCodeSubmit={noop}
        includeTest
        onIncludeTestChange={noop}
      />
    )
    const input = screen.getByTestId('redemptions-search-input')
    expect(input).toHaveAttribute('placeholder', 'Search by code or voucher title (press Enter)')
  })

  it('the accessible label also names both code and voucher title', () => {
    render(
      <RedemptionsFilterBar
        statusFilter="all"
        onStatusChange={noop}
        codeInput=""
        onCodeInputChange={noop}
        onCodeSubmit={noop}
        includeTest
        onIncludeTestChange={noop}
      />
    )
    expect(screen.getByLabelText('Search redemptions by code or voucher title')).toBeInTheDocument()
  })
})

describe('RedemptionsFilterBar code search submits on Enter', () => {
  it('calls onCodeSubmit with the trimmed input value on Enter (matches the "(press Enter)" copy)', () => {
    const onCodeSubmit = jest.fn()
    render(
      <RedemptionsFilterBar
        statusFilter="all"
        onStatusChange={noop}
        codeInput="  half-price  "
        onCodeInputChange={noop}
        onCodeSubmit={onCodeSubmit}
        includeTest
        onIncludeTestChange={noop}
      />
    )
    fireEvent.keyDown(screen.getByTestId('redemptions-search-input'), { key: 'Enter' })
    expect(onCodeSubmit).toHaveBeenCalledWith('half-price')
  })

  it('does not submit on a non-Enter key', () => {
    const onCodeSubmit = jest.fn()
    render(
      <RedemptionsFilterBar
        statusFilter="all"
        onStatusChange={noop}
        codeInput="abc"
        onCodeInputChange={noop}
        onCodeSubmit={onCodeSubmit}
        includeTest
        onIncludeTestChange={noop}
      />
    )
    fireEvent.keyDown(screen.getByTestId('redemptions-search-input'), { key: 'a' })
    expect(onCodeSubmit).not.toHaveBeenCalled()
  })
})
