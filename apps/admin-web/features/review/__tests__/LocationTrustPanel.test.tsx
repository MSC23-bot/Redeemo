/**
 * LocationTrustPanel — coords + external map link + provenance badge, and the
 * NEEDS_REVIEW staged-suggestion context + confirm-location deep-link.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { LocationTrustPanel } from '../LocationTrustPanel'
import type { ReviewBranch } from '@/lib/api/review'

function makeBranch(overrides: Partial<ReviewBranch> = {}): ReviewBranch {
  return {
    id: 'br-1',
    name: 'Main Branch',
    isMainBranch: true,
    isActive: true,
    addressLine1: '1 High Street',
    addressLine2: null,
    city: 'Huddersfield',
    postcode: 'HD1 1AA',
    localityName: null,
    locationConfidence: 'ADDRESS_GEOCODED',
    latitude: 53.6458,
    longitude: -1.785,
    googlePlaceId: 'place-123',
    locationSuggestion: null,
    ...overrides,
  }
}

describe('LocationTrustPanel', () => {
  it('renders the provenance badge, address, and coordinates', () => {
    render(<LocationTrustPanel branch={makeBranch()} />)
    expect(screen.getByText('Google-verified (unreviewed)')).toBeInTheDocument()
    expect(screen.getByText('1 High Street, Huddersfield, HD1 1AA')).toBeInTheDocument()
    expect(screen.getByTestId('location-coords-br-1')).toHaveTextContent('53.64580, -1.78500')
  })

  it('renders an Open in Google Maps external link to the pin', () => {
    render(<LocationTrustPanel branch={makeBranch()} />)
    const link = screen.getByTestId('location-open-maps-br-1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=53.6458,-1.785',
    )
  })

  it('shows a no-precise-pin note when coordinates are absent', () => {
    render(
      <LocationTrustPanel
        branch={makeBranch({ locationConfidence: 'POSTCODE_CENTROID', latitude: null, longitude: null })}
      />,
    )
    expect(screen.getByTestId('location-no-coords-br-1')).toBeInTheDocument()
  })

  it('shows the NEEDS_REVIEW cross-check-failed framing + suggested pin vs current centroid', () => {
    render(
      <LocationTrustPanel
        branch={makeBranch({
          locationConfidence: 'NEEDS_REVIEW',
          latitude: 53.6,
          longitude: -1.8,
          googlePlaceId: null,
          locationSuggestion: {
            placeId: 'place-999',
            latitude: 53.7,
            longitude: -1.9,
            postcode: 'HD2 2BB',
            source: 'branch_created_audit',
          },
        })}
      />,
    )
    expect(screen.getByTestId('location-needs-review-br-1')).toBeInTheDocument()
    expect(screen.getByText(/did not cross-check/i)).toBeInTheDocument()
    expect(screen.getByTestId('location-suggestion-coords-br-1')).toHaveTextContent('53.70000, -1.90000')
    expect(screen.getByTestId('location-suggestion-open-maps-br-1')).toBeInTheDocument()
    expect(screen.getByText('HD2 2BB')).toBeInTheDocument()
    // The source line tells the reviewer which staged blob this suggestion is from.
    expect(screen.getByTestId('location-suggestion-source-br-1')).toHaveTextContent(
      'Source: staged when the branch was created.',
    )
  })

  it('names the pending-edit source when the surfaced suggestion is from an open edit', () => {
    render(
      <LocationTrustPanel
        branch={makeBranch({
          locationConfidence: 'NEEDS_REVIEW',
          latitude: 53.6,
          longitude: -1.8,
          googlePlaceId: null,
          locationSuggestion: {
            placeId: 'place-999',
            latitude: 53.7,
            longitude: -1.9,
            postcode: 'HD2 2BB',
            source: 'pending_edit',
          },
        })}
      />,
    )
    expect(screen.getByTestId('location-suggestion-source-br-1')).toHaveTextContent(
      "Source: staged with the merchant's pending edit request.",
    )
  })

  it('renders NEEDS_REVIEW framing gracefully when no suggestion is staged', () => {
    render(
      <LocationTrustPanel
        branch={makeBranch({ locationConfidence: 'NEEDS_REVIEW', locationSuggestion: null })}
      />,
    )
    expect(screen.getByTestId('location-needs-review-br-1')).toBeInTheDocument()
    expect(screen.getByText(/No staged Google suggestion/i)).toBeInTheDocument()
  })

  it('deep-links to the correction flow when the capability is granted', () => {
    const onCorrectLocation = jest.fn()
    render(
      <LocationTrustPanel
        branch={makeBranch({ locationConfidence: 'NEEDS_REVIEW' })}
        canCorrectLocation
        onCorrectLocation={onCorrectLocation}
      />,
    )
    fireEvent.click(screen.getByTestId('location-correct-br-1'))
    expect(onCorrectLocation).toHaveBeenCalledWith('br-1')
  })

  it('hides the correction button without the capability', () => {
    render(
      <LocationTrustPanel
        branch={makeBranch({ locationConfidence: 'NEEDS_REVIEW' })}
        canCorrectLocation={false}
        onCorrectLocation={jest.fn()}
      />,
    )
    expect(screen.queryByTestId('location-correct-br-1')).not.toBeInTheDocument()
  })
})
