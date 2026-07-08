import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UploadDocumentDialog } from '@/components/business-profile/sections/UploadDocumentDialog'

const api = { upload: jest.fn() }
jest.mock('@/lib/api/documents', () => {
  const actual = jest.requireActual('@/lib/api/documents')
  return { ...actual, documentsApi: { list: jest.fn(), upload: (...a: unknown[]) => api.upload(...a) } }
})

function renderDialog(onSuccess = jest.fn(), onCancel = jest.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={qc}>
      <UploadDocumentDialog onSuccess={onSuccess} onCancel={onCancel} />
    </QueryClientProvider>,
  )
  return { ...utils, onSuccess, onCancel }
}

beforeEach(() => {
  api.upload.mockReset()
})

describe('UploadDocumentDialog', () => {
  it('only offers the D2 self-serve document types (no AGREEMENT)', () => {
    renderDialog()
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Business verification (1)', 'Business verification (2)', 'Price list'])
  })

  it('submit is disabled until a file is chosen', () => {
    renderDialog()
    expect(screen.getByTestId('upload-document-submit')).toBeDisabled()
  })

  it('rejects an oversized file client-side (no upload call)', () => {
    renderDialog()
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [big] } })
    expect(screen.getByTestId('upload-document-too-large')).toBeInTheDocument()
    expect(screen.getByTestId('upload-document-submit')).toBeDisabled()
  })

  it('happy path: submits documentType + file, calls onSuccess', async () => {
    api.upload.mockResolvedValue({ id: 'doc-1', documentType: 'PRICE_LIST', uploadedAt: '2026-06-16T00:00:00.000Z' })
    const { onSuccess } = renderDialog()
    fireEvent.change(screen.getByTestId('upload-document-type'), { target: { value: 'PRICE_LIST' } })
    const file = new File(['%PDF-1.4'], 'price.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [file] } })
    fireEvent.click(screen.getByTestId('upload-document-submit'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(api.upload).toHaveBeenCalledWith({ documentType: 'PRICE_LIST', file })
  })

  it('storage-dark degrade: shows the honest STORAGE_NOT_ENABLED message', async () => {
    api.upload.mockRejectedValue(Object.assign(new Error('dark'), { code: 'STORAGE_NOT_ENABLED' }))
    renderDialog()
    const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [file] } })
    fireEvent.click(screen.getByTestId('upload-document-submit'))
    expect(await screen.findByTestId('upload-document-error')).toHaveTextContent(/not available yet/i)
  })

  it('cancel calls onCancel without uploading', () => {
    const { onCancel } = renderDialog()
    fireEvent.click(screen.getByTestId('upload-document-cancel'))
    expect(onCancel).toHaveBeenCalled()
    expect(api.upload).not.toHaveBeenCalled()
  })
})
