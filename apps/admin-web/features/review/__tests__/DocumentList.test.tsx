/**
 * DocumentList — empty state, available/unavailable docs, signed-link footer.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { DocumentList } from '../DocumentList'
import type { ReviewDocument } from '@/lib/api/review'

function makeDoc(overrides: Partial<ReviewDocument> = {}): ReviewDocument {
  return {
    id: 'doc-1',
    documentType: 'BUSINESS_VERIFICATION_1',
    uploadedAt: '2026-06-01T10:00:00.000Z',
    url: 'https://example.com/signed-url',
    available: true,
    ...overrides,
  }
}

describe('DocumentList', () => {
  it('renders empty state when no documents', () => {
    render(<DocumentList documents={[]} />)
    expect(screen.getByText('No documents uploaded.')).toBeInTheDocument()
  })

  it('renders a row for each document', () => {
    const docs = [
      makeDoc({ id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1' }),
      makeDoc({ id: 'doc-2', documentType: 'AGREEMENT', url: null, available: false }),
    ]
    render(<DocumentList documents={docs} />)
    expect(screen.getByTestId('document-row-doc-1')).toBeInTheDocument()
    expect(screen.getByTestId('document-row-doc-2')).toBeInTheDocument()
  })

  it('shows "Available" badge and an Open link for an available doc', () => {
    render(<DocumentList documents={[makeDoc({ available: true, url: 'https://example.com/signed' })]} />)
    expect(screen.getByText('Available')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /open/i })
    expect(link).toHaveAttribute('href', 'https://example.com/signed')
    expect(link).toHaveAttribute('target', '_blank')
    // Reverse-tabnabbing protection: a target="_blank" link must carry rel="noopener noreferrer".
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows "Unavailable" badge and no link for an unavailable doc', () => {
    render(<DocumentList documents={[makeDoc({ available: false, url: null })]} />)
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open/i })).not.toBeInTheDocument()
  })

  it('renders "Unavailable" (not a null link) when available is true but url is null', () => {
    // Pins the `doc.available && doc.url` guard: a truthy available flag with a
    // missing url must NOT produce a link with a null href.
    render(<DocumentList documents={[makeDoc({ available: true, url: null })]} />)
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Available')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open/i })).not.toBeInTheDocument()
  })

  it('shows the signed-link footer note', () => {
    render(<DocumentList documents={[makeDoc()]} />)
    expect(screen.getByText(/opens via a short-lived signed link/i)).toBeInTheDocument()
    expect(screen.getByText(/raw storage paths are never exposed/i)).toBeInTheDocument()
  })

  it('renders human-readable labels for the real Prisma DocumentType enum values', () => {
    render(
      <DocumentList
        documents={[
          makeDoc({ id: 'doc-a', documentType: 'BUSINESS_VERIFICATION_1' }),
          makeDoc({ id: 'doc-b', documentType: 'BUSINESS_VERIFICATION_2' }),
          makeDoc({ id: 'doc-c', documentType: 'PRICE_LIST' }),
          makeDoc({ id: 'doc-d', documentType: 'AGREEMENT' }),
        ]}
      />
    )
    expect(screen.getByText('Business verification (1)')).toBeInTheDocument()
    expect(screen.getByText('Business verification (2)')).toBeInTheDocument()
    expect(screen.getByText('Price list')).toBeInTheDocument()
    expect(screen.getByText('Agreement')).toBeInTheDocument()
  })

  it('falls back to the raw documentType string for unknown future enum values', () => {
    render(<DocumentList documents={[makeDoc({ documentType: 'FUTURE_DOC_TYPE' })]} />)
    expect(screen.getByText('FUTURE_DOC_TYPE')).toBeInTheDocument()
  })

  it('shows the count in the heading', () => {
    render(<DocumentList documents={[makeDoc({ id: 'doc-1' }), makeDoc({ id: 'doc-2' })]} />)
    expect(screen.getByText('Documents (2)')).toBeInTheDocument()
  })
})
