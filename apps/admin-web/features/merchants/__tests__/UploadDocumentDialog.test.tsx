/**
 * UploadDocumentDialog (B4-web) - type picker, file + reason gating, too-large
 * client guard, submit body, error banner.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UploadDocumentDialog } from '../UploadDocumentDialog'
import { DOCUMENT_MAX_BYTES } from '@/lib/api/documents'

const mockMutateAsync = jest.fn()
const mockMutation = { mutateAsync: mockMutateAsync, isPending: false, error: null as Error | null }

jest.mock('@/lib/merchants/useMerchantDocuments', () => ({
  useUploadDocument: jest.fn(() => mockMutation),
}))

function renderDialog(opts: { onSuccess?: () => void; onCancel?: () => void } = {}) {
  return render(
    <UploadDocumentDialog merchantId="m-1" onSuccess={opts.onSuccess ?? jest.fn()} onCancel={opts.onCancel ?? jest.fn()} />,
  )
}

function pdf(name = 'doc.pdf', size?: number): File {
  const f = new File(['%PDF-1.4 x'], name, { type: 'application/pdf' })
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return f
}

afterEach(() => {
  jest.clearAllMocks()
  mockMutation.isPending = false
  mockMutation.error = null
})

describe('UploadDocumentDialog structure', () => {
  it('renders the type picker, file input, reason, and on-behalf + format copy', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: /upload document/i })).toBeInTheDocument()
    expect(screen.getByTestId('upload-document-type')).toBeInTheDocument()
    expect(screen.getByTestId('upload-document-file')).toBeInTheDocument()
    const panel = screen.getByTestId('upload-document-dialog')
    expect(panel).toHaveTextContent(/on the merchant's behalf/i)
    expect(panel).toHaveTextContent(/audit log/i)
    expect(panel).toHaveTextContent(/PDF, JPG, or PNG/i)
  })

  it('offers the four document categories', () => {
    renderDialog()
    const opts = Array.from(screen.getByTestId('upload-document-type').querySelectorAll('option')).map((o) => o.getAttribute('value'))
    expect(opts).toEqual(['BUSINESS_VERIFICATION_1', 'BUSINESS_VERIFICATION_2', 'PRICE_LIST', 'AGREEMENT'])
  })
})

describe('UploadDocumentDialog gating', () => {
  it('submit disabled initially (no file, no reason)', () => {
    renderDialog()
    expect(screen.getByTestId('upload-document-submit')).toBeDisabled()
  })

  it('submit disabled with a file but no reason', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [pdf()] } })
    expect(screen.getByTestId('upload-document-submit')).toBeDisabled()
  })

  it('submit enabled with a file + a non-empty reason', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [pdf()] } })
    fireEvent.change(screen.getByTestId('upload-document-reason'), { target: { value: 'Owner emailed it.' } })
    expect(screen.getByTestId('upload-document-submit')).not.toBeDisabled()
  })

  it('blocks an over-size file with a hint, even with a reason', () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [pdf('big.pdf', DOCUMENT_MAX_BYTES + 1)] } })
    fireEvent.change(screen.getByTestId('upload-document-reason'), { target: { value: 'reason' } })
    expect(screen.getByTestId('upload-document-too-large')).toBeInTheDocument()
    expect(screen.getByTestId('upload-document-submit')).toBeDisabled()
  })
})

describe('UploadDocumentDialog submit', () => {
  it('submits { documentType, reason, file } and calls onSuccess', async () => {
    mockMutateAsync.mockResolvedValueOnce({ id: 'd', documentType: 'PRICE_LIST', uploadedAt: '2026-06-16T00:00:00Z' })
    const onSuccess = jest.fn()
    renderDialog({ onSuccess })
    const file = pdf()
    fireEvent.change(screen.getByTestId('upload-document-type'), { target: { value: 'PRICE_LIST' } })
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [file] } })
    fireEvent.change(screen.getByTestId('upload-document-reason'), { target: { value: '  Owner emailed it.  ' } })
    fireEvent.click(screen.getByTestId('upload-document-submit'))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith({ documentType: 'PRICE_LIST', reason: 'Owner emailed it.', file })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('renders NamedGateBanner when the mutation errors (e.g. STORAGE_NOT_ENABLED)', () => {
    const err = Object.assign(new Error('dark'), { code: 'STORAGE_NOT_ENABLED' })
    const { useUploadDocument } = jest.requireMock('@/lib/merchants/useMerchantDocuments') as {
      useUploadDocument: jest.MockedFunction<() => typeof mockMutation>
    }
    useUploadDocument.mockReturnValueOnce({ ...mockMutation, error: err })
    renderDialog()
    expect(screen.getByTestId('named-gate-banner')).toBeInTheDocument()
  })
})
