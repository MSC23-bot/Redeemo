/**
 * ThinAreaFlags — callout title, gap list, "platform limits" note, all-clear state.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ThinAreaFlags } from '../ThinAreaFlags'
import type { ReviewThinAreas } from '@/lib/api/review'

function makeFullyGapped(): ReviewThinAreas {
  return {
    documentsUploaded: false,
    companyTypeCaptured: false,
    registeredOfficeCaptured: false,
    sectorEvidenceCaptured: false,
    companyNumberProvided: false,
    vatNumberProvided: false,
    documentsGated: false,
  }
}

function makeFullyCaptured(): ReviewThinAreas {
  return {
    documentsUploaded: true,
    companyTypeCaptured: true,
    registeredOfficeCaptured: true,
    sectorEvidenceCaptured: true,
    companyNumberProvided: true,
    vatNumberProvided: true,
    documentsGated: true,
  }
}

describe('ThinAreaFlags', () => {
  it('renders section heading "Known gaps in today\'s model"', () => {
    render(<ThinAreaFlags thinAreas={makeFullyGapped()} />)
    expect(screen.getByRole('heading', { name: /known gaps in today's model/i })).toBeInTheDocument()
  })

  it('renders the "platform limits not merchant failures" note when there are gaps', () => {
    render(<ThinAreaFlags thinAreas={makeFullyGapped()} />)
    expect(screen.getByText(/these are platform limits, not merchant failures/i)).toBeInTheDocument()
  })

  it('lists gap items when captures are missing', () => {
    render(<ThinAreaFlags thinAreas={makeFullyGapped()} />)
    expect(screen.getByText('Company type')).toBeInTheDocument()
    expect(screen.getByText('Registered office address')).toBeInTheDocument()
    expect(screen.getByText('Sector evidence')).toBeInTheDocument()
    expect(screen.getByText('Company number')).toBeInTheDocument()
    expect(screen.getByText('VAT number')).toBeInTheDocument()
    expect(screen.getByText('Supporting documents')).toBeInTheDocument()
  })

  it('shows no-gaps message when everything is captured', () => {
    render(<ThinAreaFlags thinAreas={makeFullyCaptured()} />)
    expect(screen.getByText(/no gaps flagged/i)).toBeInTheDocument()
    // The "platform limits" note should NOT appear when there are no gaps
    expect(screen.queryByText(/these are platform limits/i)).not.toBeInTheDocument()
  })

  it('does not render captured items as gaps', () => {
    const partial: ReviewThinAreas = {
      ...makeFullyGapped(),
      companyNumberProvided: true,
      vatNumberProvided: true,
    }
    render(<ThinAreaFlags thinAreas={partial} />)
    expect(screen.queryByText('Company number')).not.toBeInTheDocument()
    expect(screen.queryByText('VAT number')).not.toBeInTheDocument()
    // Other gaps still show
    expect(screen.getByText('Company type')).toBeInTheDocument()
  })
})
