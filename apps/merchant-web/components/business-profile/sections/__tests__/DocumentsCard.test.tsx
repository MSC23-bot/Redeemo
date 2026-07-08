import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DocumentsCard } from '@/components/business-profile/sections/DocumentsCard'
import type { MerchantProfile } from '@/lib/api/profile'

// B3: the Documents list + upload card. Mocks the API client (documentsApi) at
// module level, mirroring MerchantDocumentsCard's admin-web test shape.
const api = { list: jest.fn(), upload: jest.fn() }
jest.mock('@/lib/api/documents', () => {
  const actual = jest.requireActual('@/lib/api/documents')
  return {
    ...actual,
    documentsApi: { list: (...a: unknown[]) => api.list(...a), upload: (...a: unknown[]) => api.upload(...a) },
  }
})

function profile(role: string | undefined): MerchantProfile {
  return {
    id: 'm1',
    businessName: 'Acme',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    viewerCapabilities: role ? { canViewInsights: true, role } : undefined,
  } as MerchantProfile
}

function renderCard(role: string | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <DocumentsCard profile={profile(role)} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  api.list.mockReset()
  api.upload.mockReset()
})

describe('DocumentsCard', () => {
  it('shows a loading state, then the list with an Open link for an available doc', async () => {
    api.list.mockResolvedValue({
      documents: [
        { id: 'doc-1', documentType: 'BUSINESS_VERIFICATION_1', uploadedAt: '2026-06-10T00:00:00.000Z', url: 'https://r2.example/signed', available: true },
      ],
    })
    renderCard('OWNER')
    expect(screen.getByTestId('documents-loading')).toBeInTheDocument()
    expect(await screen.findByTestId('documents-row-doc-1')).toHaveTextContent(/business verification \(1\)/i)
    const link = screen.getByTestId('documents-open-doc-1')
    expect(link).toHaveAttribute('href', 'https://r2.example/signed')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('storage-dark degrade: available:false renders an Unavailable badge, no link', async () => {
    api.list.mockResolvedValue({
      documents: [{ id: 'doc-1', documentType: 'PRICE_LIST', uploadedAt: '2026-06-10T00:00:00.000Z', url: null, available: false }],
    })
    renderCard('OWNER')
    await screen.findByTestId('documents-row-doc-1')
    expect(screen.getByTestId('documents-unavailable-doc-1')).toHaveTextContent(/unavailable/i)
    expect(screen.queryByTestId('documents-open-doc-1')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no documents', async () => {
    api.list.mockResolvedValue({ documents: [] })
    renderCard('OWNER')
    expect(await screen.findByTestId('documents-empty')).toBeInTheDocument()
  })

  it('shows an error state with retry on a load failure', async () => {
    api.list.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ documents: [] })
    renderCard('OWNER')
    await screen.findByTestId('documents-error')
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.getByTestId('documents-empty')).toBeInTheDocument())
  })

  it('OWNER sees the upload trigger; opening it mounts the dialog', async () => {
    api.list.mockResolvedValue({ documents: [] })
    renderCard('OWNER')
    await screen.findByTestId('documents-empty')
    fireEvent.click(screen.getByTestId('documents-upload-trigger'))
    expect(screen.getByTestId('upload-document-dialog')).toBeInTheDocument()
  })

  it('BRANCH_MANAGER can view but never sees the upload trigger (D1)', async () => {
    api.list.mockResolvedValue({ documents: [] })
    renderCard('BRANCH_MANAGER')
    await screen.findByTestId('documents-empty')
    expect(screen.queryByTestId('documents-upload-trigger')).not.toBeInTheDocument()
  })

  it('fails closed (no upload trigger) when viewerCapabilities is absent', async () => {
    api.list.mockResolvedValue({ documents: [] })
    renderCard(undefined)
    await screen.findByTestId('documents-empty')
    expect(screen.queryByTestId('documents-upload-trigger')).not.toBeInTheDocument()
  })

  it('uploading a document closes the dialog and refetches the list', async () => {
    api.list
      .mockResolvedValueOnce({ documents: [] })
      .mockResolvedValueOnce({
        documents: [{ id: 'doc-new', documentType: 'PRICE_LIST', uploadedAt: '2026-06-16T00:00:00.000Z', url: null, available: false }],
      })
    api.upload.mockResolvedValue({ id: 'doc-new', documentType: 'PRICE_LIST', uploadedAt: '2026-06-16T00:00:00.000Z' })
    renderCard('OWNER')
    await screen.findByTestId('documents-empty')
    fireEvent.click(screen.getByTestId('documents-upload-trigger'))

    const file = new File(['%PDF-1.4'], 'price-list.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByTestId('upload-document-file'), { target: { files: [file] } })
    fireEvent.click(screen.getByTestId('upload-document-submit'))

    await waitFor(() => expect(screen.queryByTestId('upload-document-dialog')).not.toBeInTheDocument())
    expect(await screen.findByTestId('documents-row-doc-new')).toBeInTheDocument()
  })
})
