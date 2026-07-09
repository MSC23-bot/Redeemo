/**
 * locationProvenance — spec label + tone mapping for branch location confidence.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import {
  locationProvenanceLabel,
  locationProvenanceTone,
  isLocationTrusted,
  isLocationUnconfirmed,
  LocationProvenanceBadge,
} from '../locationProvenance'

describe('locationProvenance mapping', () => {
  it.each([
    ['ADDRESS_GEOCODED', 'Google-verified (unreviewed)', 'info'],
    ['MANUALLY_CONFIRMED', 'Human-confirmed', 'success'],
    // Branch Location Trust Slice 3: weakest confirmed tier, neutral tone,
    // labelled "Merchant-set pin" (never "verified").
    ['MERCHANT_CONFIRMED', 'Merchant-set pin', 'neutral'],
    ['NEEDS_REVIEW', 'Needs review', 'warn'],
    ['POSTCODE_CENTROID', 'Approximate (postcode)', 'warn'],
  ])('maps %s to its spec label + tone', (confidence, label, tone) => {
    expect(locationProvenanceLabel(confidence)).toBe(label)
    expect(locationProvenanceTone(confidence)).toBe(tone)
  })

  it('falls back to the raw string + neutral tone for an unknown value', () => {
    expect(locationProvenanceLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
    expect(locationProvenanceTone('SOMETHING_NEW')).toBe('neutral')
  })

  it('classifies trusted vs unconfirmed confidences', () => {
    expect(isLocationTrusted('ADDRESS_GEOCODED')).toBe(true)
    expect(isLocationTrusted('MANUALLY_CONFIRMED')).toBe(true)
    expect(isLocationTrusted('MERCHANT_CONFIRMED')).toBe(true) // Slice 3: customer-visible
    expect(isLocationTrusted('NEEDS_REVIEW')).toBe(false)
    expect(isLocationTrusted('POSTCODE_CENTROID')).toBe(false)

    expect(isLocationUnconfirmed('NEEDS_REVIEW')).toBe(true)
    expect(isLocationUnconfirmed('POSTCODE_CENTROID')).toBe(true)
    expect(isLocationUnconfirmed('ADDRESS_GEOCODED')).toBe(false)
  })
})

describe('LocationProvenanceBadge', () => {
  it('renders the spec label', () => {
    render(<LocationProvenanceBadge confidence="MANUALLY_CONFIRMED" />)
    expect(screen.getByText('Human-confirmed')).toBeInTheDocument()
  })

  it('renders the NEEDS_REVIEW attention label', () => {
    render(<LocationProvenanceBadge confidence="NEEDS_REVIEW" />)
    expect(screen.getByText('Needs review')).toBeInTheDocument()
  })
})
