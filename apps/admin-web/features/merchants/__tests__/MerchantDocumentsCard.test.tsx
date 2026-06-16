/**
 * MerchantDocumentsCard (B4-web) - list render (available/unavailable, no raw
 * key), manage-gating of upload/delete, empty/loading/error states, and dialog
 * opening. The query hook + the two dialogs are mocked.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MerchantDocumentsCard } from '../MerchantDocumentsCard'
import type { DocumentsListResponse } from '@/lib/api/documents'

jest.mock('@/lib/merchants/useMerchantDocuments', () => ({
  useMerchantDocuments: jest.fn(),
}))

jest.mock('@/features/merchants/UploadDocumentDialog', () => ({
  UploadDocumentDialog: ({ merchantId, onCancel }: { merchantId: string; onCancel: () => void }) => (
    <div data-testid="upload-document-dialog-mock" data-merchant-id={merchantId}>
      <button onClick={onCancel} data-testid="upload-dialog-cancel">Cancel</button>
    </div>
  ),
}))
jest.mock('@/features/merchants/DeleteDocumentConfirm', () => ({
  DeleteDocumentConfirm: ({ document, onCancel }: { document: { id: string }; onCancel: () => void }) => (
    <div data-testid="delete-document-dialog-mock" data-document-id={document.id}>
      <button onClick={onCancel} data-testid="delete-dialog-cancel">Cancel</button>
    </div>
  ),
}))

import { useMerchantDocuments } from '@/lib/merchants/useMerchantDocuments'
const mockedUse = useMerchantDocuments as jest.MockedFunction<typeof useMerchantDocuments>

function mockDocs(
  state: { data?: DocumentsListResponse; isLoading?: boolean; isError?: boolean; refetch?: () => void } = {},
) {
  mockedUse.mockReturnValue({
    data: state.data,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch: state.refetch ?? jest.fn(),
  })
}

const DATA: DocumentsListResponse = {
  documents: [
    { id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: '2026-06-10T00:00:00Z', url: 'https://r2.example/signed?sig=abc', available: true },
    { id: 'doc-2', documentType: 'PRICE_LIST', uploadedAt: '2026-06-11T00:00:00Z', url: null, available: false },
  ],
}

afterEach(() => jest.clearAllMocks())

describe('MerchantDocumentsCard list', () => {
  it('renders a row per document: Open link for available, Unavailable badge otherwise; no raw key', () => {
    mockDocs({ data: DATA })
    const { container } = render(<MerchantDocumentsCard merchantId="m-1" canManage />)
    expect(screen.getByTestId('merchant-document-row-doc-1')).toHaveTextContent('Business verification (1)')
    const open = screen.getByTestId('merchant-document-open-doc-1')
    expect(open).toHaveAttribute('href', 'https://r2.example/signed?sig=abc')
    expect(open).toHaveAttribute('target', '_blank')
    // unavailable row: no Open link, an Unavailable badge.
    expect(screen.queryByTestId('merchant-document-open-doc-2')).not.toBeInTheDocument()
    expect(screen.getByTestId('merchant-document-row-doc-2')).toHaveTextContent('Unavailable')
    // never renders a raw fileUrl / storage key.
    expect(container.innerHTML).not.toContain('fileUrl')
    expect(container.innerHTML).not.toContain('document/m-1/')
  })

  it('shows the empty state when there are no documents', () => {
    mockDocs({ data: { documents: [] } })
    render(<MerchantDocumentsCard merchantId="m-1" canManage />)
    expect(screen.getByTestId('merchant-documents-empty')).toBeInTheDocument()
  })

  it('shows the loading state', () => {
    mockDocs({ isLoading: true })
    render(<MerchantDocumentsCard merchantId="m-1" canManage />)
    expect(screen.getByTestId('merchant-documents-loading')).toBeInTheDocument()
  })

  it('shows the error state and retries', () => {
    const refetch = jest.fn()
    mockDocs({ isError: true, refetch })
    render(<MerchantDocumentsCard merchantId="m-1" canManage />)
    expect(screen.getByTestId('merchant-documents-error')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('MerchantDocumentsCard manage gating', () => {
  it('shows Upload + per-row Delete when canManage', () => {
    mockDocs({ data: DATA })
    render(<MerchantDocumentsCard merchantId="m-1" canManage />)
    expect(screen.getByTestId('merchant-documents-upload')).toBeInTheDocument()
    expect(screen.getByTestId('merchant-document-delete-doc-1')).toBeInTheDocument()
  })

  it('HIDES Upload + Delete when NOT canManage (view-only)', () => {
    mockDocs({ data: DATA })
    render(<MerchantDocumentsCard merchantId="m-1" canManage={false} />)
    expect(screen.queryByTestId('merchant-documents-upload')).not.toBeInTheDocument()
    expect(screen.queryByTestId('merchant-document-delete-doc-1')).not.toBeInTheDocument()
    // the view (Open link) still works for a view-only admin.
    expect(screen.getByTestId('merchant-document-open-doc-1')).toBeInTheDocument()
  })
})

describe('MerchantDocumentsCard dialogs', () => {
  it('opens the upload dialog when Upload is clicked', () => {
    mockDocs({ data: DATA })
    render(<MerchantDocumentsCard merchantId="m-1" canManage />)
    fireEvent.click(screen.getByTestId('merchant-documents-upload'))
    expect(screen.getByTestId('upload-document-dialog-mock')).toHaveAttribute('data-merchant-id', 'm-1')
  })

  it('opens the delete confirm with the document id when a row Delete is clicked', () => {
    mockDocs({ data: DATA })
    render(<MerchantDocumentsCard merchantId="m-1" canManage />)
    fireEvent.click(screen.getByTestId('merchant-document-delete-doc-2'))
    expect(screen.getByTestId('delete-document-dialog-mock')).toHaveAttribute('data-document-id', 'doc-2')
  })
})
