/**
 * DeleteDocumentConfirm (B4-web) - reason gate, submit body, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteDocumentConfirm } from '../DeleteDocumentConfirm'
import type { MerchantDocument } from '@/lib/api/documents'

const mockMutateAsync = jest.fn()
const mockMutation = { mutateAsync: mockMutateAsync, isPending: false, error: null as Error | null }

jest.mock('@/lib/merchants/useMerchantDocuments', () => ({
  useDeleteDocument: jest.fn(() => mockMutation),
}))

const DOC: MerchantDocument = {
  id: 'doc-1',
  documentType: 'PRICE_LIST',
  uploadedAt: '2026-06-10T00:00:00Z',
  url: 'https://signed',
  available: true,
}

function renderConfirm(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <DeleteDocumentConfirm merchantId="m-1" document={DOC} onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />,
  )
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

it('shows the document label + the irreversible / audit copy', () => {
  renderConfirm()
  const panel = screen.getByTestId('delete-document-dialog')
  expect(panel).toHaveTextContent('Price list')
  expect(panel).toHaveTextContent(/cannot be undone/i)
  expect(panel).toHaveTextContent(/audit log/i)
})

it('disables delete until a reason is entered', () => {
  renderConfirm()
  expect(screen.getByTestId('delete-document-submit')).toBeDisabled()
  fireEvent.change(screen.getByTestId('delete-document-reason'), { target: { value: 'Superseded.' } })
  expect(screen.getByTestId('delete-document-submit')).not.toBeDisabled()
})

it('submits { documentId, reason } and calls onSuccess', async () => {
  mockMutateAsync.mockResolvedValueOnce({ ok: true })
  const onSuccess = jest.fn()
  renderConfirm({ onSuccess })
  fireEvent.change(screen.getByTestId('delete-document-reason'), { target: { value: '  Superseded.  ' } })
  fireEvent.click(screen.getByTestId('delete-document-submit'))
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
  expect(mockMutateAsync).toHaveBeenCalledWith({ documentId: 'doc-1', reason: 'Superseded.' })
  expect(onSuccess).toHaveBeenCalledTimes(1)
})

it('renders NamedGateBanner when the mutation errors', () => {
  const err = Object.assign(new Error('gone'), { code: 'DOCUMENT_NOT_FOUND' })
  const { useDeleteDocument } = jest.requireMock('@/lib/merchants/useMerchantDocuments') as {
    useDeleteDocument: jest.MockedFunction<() => typeof mockMutation>
  }
  useDeleteDocument.mockReturnValueOnce({ ...mockMutation, error: err })
  renderConfirm()
  expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
})
