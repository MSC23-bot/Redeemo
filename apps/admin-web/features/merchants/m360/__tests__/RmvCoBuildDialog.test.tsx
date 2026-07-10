/**
 * RmvCoBuildDialog (Merchant 360 A3): the admin RMV co-build edit dialog.
 *
 * Covers the load-bearing contract: the edit form renders an input for EXACTLY
 * the keys in the voucher's dynamic `allowedFields` (customer-facing scalars),
 * prefilled from `merchantFields`; the PATCH payload carries ONLY those keys plus
 * the required reason (never a disallowed key); and the RMV error codes map to
 * human copy via NamedGateBanner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RmvCoBuildDialog } from '../RmvCoBuildDialog'
import { ApiError } from '@/lib/api/client'
import type { AdminRmvVoucher } from '@/lib/api/vouchers'

// Mutable mutation stub; jest.mock factory may reference `mock`-prefixed vars.
let mockEditMutation: { mutateAsync: jest.Mock; isPending: boolean; error: unknown }

jest.mock('@/lib/vouchers/useAdminVoucherActions', () => ({
  useEditRmv: () => mockEditMutation,
}))

function makeVoucher(overrides: Partial<AdminRmvVoucher> = {}): AdminRmvVoucher {
  return {
    id: 'v-rmv-1',
    code: 'RMV-001',
    title: 'Buy one, get one free',
    type: 'BOGO',
    estimatedSaving: 12,
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    merchantFields: {},
    allowedFields: ['title', 'description', 'estimatedSaving', 'terms', 'imageUrl', 'merchantFields'],
    ...overrides,
  }
}

beforeEach(() => {
  mockEditMutation = {
    mutateAsync: jest.fn().mockResolvedValue({ id: 'v-rmv-1' }),
    isPending: false,
    error: null,
  }
})

afterEach(() => jest.clearAllMocks())

describe('RmvCoBuildDialog allow-list-driven fields', () => {
  it('renders an input for each customer-facing allowedField, prefilled from merchantFields', () => {
    render(
      <RmvCoBuildDialog
        merchantId="m-1"
        voucher={makeVoucher({ merchantFields: { title: 'Staged title', estimatedSaving: 9 } })}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    )
    expect(screen.getByTestId('rmv-field-title')).toHaveValue('Staged title')
    expect(screen.getByTestId('rmv-field-description')).toHaveValue('')
    expect(screen.getByTestId('rmv-field-terms')).toBeInTheDocument()
    expect(screen.getByTestId('rmv-field-imageUrl')).toBeInTheDocument()
    expect(screen.getByTestId('rmv-field-estimatedSaving')).toHaveValue(9)
    // The nested `merchantFields` allowed key is NOT a flat input; an honest note
    // covers the structured per-type fields instead.
    expect(screen.getByTestId('rmv-structured-note')).toBeInTheDocument()
  })

  it('renders ONLY the fields in allowedFields (no disallowed key leaks in)', () => {
    render(
      <RmvCoBuildDialog
        merchantId="m-1"
        voucher={makeVoucher({ allowedFields: ['title', 'estimatedSaving'] })}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    )
    expect(screen.getByTestId('rmv-field-title')).toBeInTheDocument()
    expect(screen.getByTestId('rmv-field-estimatedSaving')).toBeInTheDocument()
    expect(screen.queryByTestId('rmv-field-description')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rmv-field-terms')).not.toBeInTheDocument()
    expect(screen.queryByTestId('rmv-field-imageUrl')).not.toBeInTheDocument()
    // No non-renderable key here, so no structured note.
    expect(screen.queryByTestId('rmv-structured-note')).not.toBeInTheDocument()
  })

  it('falls back to the top-level title / estimatedSaving when merchantFields is empty', () => {
    render(
      <RmvCoBuildDialog
        merchantId="m-1"
        voucher={makeVoucher({ allowedFields: ['title', 'estimatedSaving'], merchantFields: {} })}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    )
    expect(screen.getByTestId('rmv-field-title')).toHaveValue('Buy one, get one free')
    expect(screen.getByTestId('rmv-field-estimatedSaving')).toHaveValue(12)
  })
})

describe('RmvCoBuildDialog PATCH payload', () => {
  it('sends ONLY the allowed keys (+ reason), coercing estimatedSaving to a number', async () => {
    const onSuccess = jest.fn()
    render(
      <RmvCoBuildDialog
        merchantId="m-1"
        voucher={makeVoucher({ allowedFields: ['title', 'estimatedSaving'] })}
        onSuccess={onSuccess}
        onCancel={jest.fn()}
      />
    )
    fireEvent.change(screen.getByTestId('rmv-field-title'), { target: { value: 'New title' } })
    fireEvent.change(screen.getByTestId('rmv-field-estimatedSaving'), { target: { value: '15' } })
    fireEvent.change(screen.getByTestId('rmv-cobuild-reason'), {
      target: { value: 'Fixed a typo in the title.' },
    })
    fireEvent.click(screen.getByTestId('rmv-cobuild-submit'))

    await waitFor(() => expect(mockEditMutation.mutateAsync).toHaveBeenCalledTimes(1))
    const arg = mockEditMutation.mutateAsync.mock.calls[0][0]
    expect(arg.voucherId).toBe('v-rmv-1')
    expect(arg.reason).toBe('Fixed a typo in the title.')
    expect(Object.keys(arg.fields).sort()).toEqual(['estimatedSaving', 'title'])
    expect(arg.fields.title).toBe('New title')
    expect(arg.fields.estimatedSaving).toBe(15)
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
  })

  it('disables Save until a reason is entered', () => {
    render(
      <RmvCoBuildDialog
        merchantId="m-1"
        voucher={makeVoucher()}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    )
    expect(screen.getByTestId('rmv-cobuild-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('rmv-cobuild-reason'), { target: { value: 'A reason.' } })
    expect(screen.getByTestId('rmv-cobuild-submit')).not.toBeDisabled()
  })
})

describe('RmvCoBuildDialog error-code copy', () => {
  it('maps VOUCHER_NOT_EDITABLE to human copy via NamedGateBanner', () => {
    mockEditMutation.error = new ApiError(409, { error: { code: 'VOUCHER_NOT_EDITABLE' } })
    render(
      <RmvCoBuildDialog
        merchantId="m-1"
        voucher={makeVoucher()}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    )
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(/no longer a draft/i)
  })

  it('maps RMV_FIELD_NOT_ALLOWED to human copy via NamedGateBanner', () => {
    mockEditMutation.error = new ApiError(400, { error: { code: 'RMV_FIELD_NOT_ALLOWED' } })
    render(
      <RmvCoBuildDialog
        merchantId="m-1"
        voucher={makeVoucher()}
        onSuccess={jest.fn()}
        onCancel={jest.fn()}
      />
    )
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent(/cannot be edited/i)
  })
})
