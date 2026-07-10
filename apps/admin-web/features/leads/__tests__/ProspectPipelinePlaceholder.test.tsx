import React from 'react'
import { render, screen } from '@testing-library/react'
import { ProspectPipelinePlaceholder } from '../ProspectPipelinePlaceholder'

describe('ProspectPipelinePlaceholder', () => {
  it('renders the honest gated panel with the Net-new badge', () => {
    render(<ProspectPipelinePlaceholder />)

    expect(screen.getByText('Prospect pipeline')).toBeInTheDocument()
    expect(screen.getByText('Net-new')).toBeInTheDocument()
    expect(screen.getByTestId('leads-pipeline-gated')).toHaveTextContent(/open owner decision/i)
    expect(screen.getByTestId('leads-pipeline-gated')).toHaveTextContent(/no lead table exists yet/i)
  })

  it('never renders a kanban / column / lead-management affordance', () => {
    render(<ProspectPipelinePlaceholder />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/add lead/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/contacted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/visit booked/i)).not.toBeInTheDocument()
  })
})
