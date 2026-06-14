/**
 * ConfirmLocationDialog — range validation (reject 91 / 181, accept valid),
 * "exact location" copy, calls confirm-location with branchId + coords, no map,
 * BRANCH_NOT_FOUND banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmLocationDialog } from '../ConfirmLocationDialog'
import { ApiError } from '@/lib/api/client'

const mockMutateAsync = jest.fn()
const mockMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
  error: null as Error | null,
}

jest.mock('@/lib/merchants/useMerchantActions', () => ({
  useConfirmLocation: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <ConfirmLocationDialog
      branchId="br-1"
      branchName="Main Branch"
      approvalId="apr-1"
      onSuccess={opts.onSuccess ?? jest.fn()}
      onCancel={opts.onCancel ?? jest.fn()}
    />
  )
}

function setCoords(lat: string, lng: string) {
  fireEvent.change(screen.getByTestId('confirm-location-latitude'), { target: { value: lat } })
  fireEvent.change(screen.getByTestId('confirm-location-longitude'), { target: { value: lng } })
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('ConfirmLocationDialog structure', () => {
  it('renders with role=dialog and the exact-coordinates copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /confirm branch location/i })).toBeInTheDocument()
    const copy = screen.getByTestId('confirm-location-copy')
    expect(copy).toHaveTextContent('Enter the exact coordinates for this branch')
    expect(copy).toHaveTextContent('manually confirmed')
  })

  it('renders the branch name', () => {
    renderDialog()
    expect(screen.getByText('Main Branch')).toBeInTheDocument()
  })

  it('does NOT render any map element (manual lat/lng only)', () => {
    const { container } = renderDialog()
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('[data-testid*="map"]')).toBeNull()
    // Manual coordinate inputs ARE present (the only way to enter location).
    expect(screen.getByTestId('confirm-location-latitude')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-location-longitude')).toBeInTheDocument()
  })
})

describe('ConfirmLocationDialog range validation', () => {
  it('submit disabled with empty inputs', () => {
    renderDialog()
    expect(screen.getByTestId('confirm-location-submit')).toBeDisabled()
  })

  it('rejects latitude out of range (91) with an inline message', () => {
    renderDialog()
    setCoords('91', '0')
    expect(screen.getByTestId('confirm-location-latitude-error')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-location-submit')).toBeDisabled()
  })

  it('rejects longitude out of range (181) with an inline message', () => {
    renderDialog()
    setCoords('0', '181')
    expect(screen.getByTestId('confirm-location-longitude-error')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-location-submit')).toBeDisabled()
  })

  it('rejects latitude below -90', () => {
    renderDialog()
    setCoords('-90.5', '0')
    expect(screen.getByTestId('confirm-location-latitude-error')).toBeInTheDocument()
    expect(screen.getByTestId('confirm-location-submit')).toBeDisabled()
  })

  it('accepts valid in-range coordinates and enables submit', () => {
    renderDialog()
    setCoords('53.645', '-1.783')
    expect(screen.queryByTestId('confirm-location-latitude-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('confirm-location-longitude-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('confirm-location-submit')).not.toBeDisabled()
  })

  it('accepts boundary values (90 / 180 / -90 / -180)', () => {
    renderDialog()
    setCoords('90', '180')
    expect(screen.getByTestId('confirm-location-submit')).not.toBeDisabled()
    setCoords('-90', '-180')
    expect(screen.getByTestId('confirm-location-submit')).not.toBeDisabled()
  })
})

describe('ConfirmLocationDialog submit', () => {
  it('calls confirm-location with branchId + parsed coords and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      branchId: 'br-1',
      latitude: 53.645,
      longitude: -1.783,
      locationConfidence: 'MANUALLY_CONFIRMED',
    })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    setCoords('53.645', '-1.783')
    fireEvent.click(screen.getByTestId('confirm-location-submit'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        branchId: 'br-1',
        input: { latitude: 53.645, longitude: -1.783 },
      })
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})

describe('ConfirmLocationDialog error banner', () => {
  it('renders the BRANCH_NOT_FOUND copy on error', () => {
    const err = new ApiError(404, { error: { code: 'BRANCH_NOT_FOUND', message: 'Not found' } })
    const { useConfirmLocation } = jest.requireMock('@/lib/merchants/useMerchantActions') as {
      useConfirmLocation: jest.MockedFunction<() => typeof mockMutation>
    }
    useConfirmLocation.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toHaveTextContent('Branch not found.')
  })
})
