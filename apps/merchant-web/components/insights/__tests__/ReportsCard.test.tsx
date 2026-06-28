/**
 * PR-B Task B7: the Insights Reports card (spec 10, screenshot 05 "Reports to download").
 *
 * Two report actions for the active selection:
 *   1) A "Redemption activity CSV excluding direct customer identifiers" download via
 *      the B1 downloadInsightsExport helper. When the runtime gate is CLOSED the helper
 *      returns { available:false } and the card shows a calm "Not available" treatment
 *      (no error). The active filters + scope are echoed so the merchant knows what the
 *      export covers.
 *   2) A link to the client-rendered printable performance summary (report/page.tsx).
 *
 * Locked copy (spec 2.4 / 10.1):
 *   - Caption: "No direct customer identifiers are included" (NOT "no personal data
 *     ever") PLUS the caveat that event-level date/time + branch + voucher + method
 *     combinations may still be personal/identifiable.
 *   - There is NO Customer column.
 *   - BANNED: "Delivered" / "Value delivered"; "email" promise.
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ReportsCard } from '../ReportsCard'
import type { InsightsFilters, InsightsExportResult } from '@/lib/api/insights'

jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  downloadInsightsExport: jest.fn(),
}))

import { downloadInsightsExport } from '@/lib/api/insights'

const mockDownload = downloadInsightsExport as jest.MockedFunction<
  typeof downloadInsightsExport
>

const FILTERS: InsightsFilters = { period: 'this_month' }

function renderCard(props?: Partial<React.ComponentProps<typeof ReportsCard>>) {
  return render(
    <ReportsCard
      filters={props?.filters ?? FILTERS}
      scopeLabel={props?.scopeLabel ?? 'All branches'}
      gateOpen={props?.gateOpen ?? true}
    />,
  )
}

beforeEach(() => {
  mockDownload.mockReset()
  const ok: InsightsExportResult = { csv: 'a,b\n1,2\n', filename: 'insights-redemptions.csv' }
  mockDownload.mockResolvedValue(ok)
})
afterEach(cleanup)

describe('ReportsCard', () => {
  it('renders the CSV download action with the identifier-excluding label', () => {
    renderCard()
    expect(
      screen.getByRole('button', {
        name: /redemption activity csv excluding direct customer identifiers/i,
      }),
    ).toBeInTheDocument()
  })

  it('renders the identifiability caption (the locked wording, not "no personal data ever")', () => {
    const { container } = renderCard()
    // The locked positive wording.
    expect(
      screen.getByText(/no direct customer identifiers are included/i),
    ).toBeInTheDocument()
    // The caveat that combinations may still be identifiable.
    expect(
      screen.getByText(/may still be personal or identifiable|may still constitute personal|may still be identifiable/i),
    ).toBeInTheDocument()
    // BANNED wording must not appear.
    expect(container.textContent ?? '').not.toMatch(/no personal data ever/i)
    expect(container.textContent ?? '').not.toMatch(/no customer personal data/i)
  })

  it('echoes the active scope and period for the selection', () => {
    renderCard({ scopeLabel: 'High Street' })
    // The card states what the export covers (scope + period).
    expect(screen.getByText(/for this selection/i)).toBeInTheDocument()
    expect(screen.getByText(/High Street/i)).toBeInTheDocument()
  })

  it('downloads the CSV with the active filters when the gate is open', async () => {
    renderCard({ filters: { period: 'last_month', branchId: 'b1', voucherType: 'BOGO' } })
    fireEvent.click(
      screen.getByRole('button', {
        name: /redemption activity csv excluding direct customer identifiers/i,
      }),
    )
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1))
    expect(mockDownload).toHaveBeenCalledWith({
      period: 'last_month',
      branchId: 'b1',
      voucherType: 'BOGO',
    })
  })

  it('shows a calm "Not available" state when the gate is closed (no error)', async () => {
    const gated: InsightsExportResult = { available: false }
    mockDownload.mockResolvedValue(gated)
    renderCard()
    fireEvent.click(
      screen.getByRole('button', {
        name: /redemption activity csv excluding direct customer identifiers/i,
      }),
    )
    expect(await screen.findByText(/not available/i)).toBeInTheDocument()
    // It is a calm status, not an error alert.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the calm Not-available state UP FRONT when gateOpen is false (no download button)', () => {
    renderCard({ gateOpen: false })
    expect(screen.getByTestId('csv-not-available')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /redemption activity csv excluding direct customer identifiers/i,
      }),
    ).not.toBeInTheDocument()
  })

  it('exposes the CSV download button when gateOpen is true (no up-front Not-available)', () => {
    renderCard({ gateOpen: true })
    expect(
      screen.getByRole('button', {
        name: /redemption activity csv excluding direct customer identifiers/i,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('csv-not-available')).not.toBeInTheDocument()
  })

  it('renders a link to the printable performance summary', () => {
    renderCard({ filters: { period: 'last_month', branchId: 'b1' } })
    const link = screen.getByRole('link', { name: /print or save report|printable|performance summary/i })
    expect(link).toBeInTheDocument()
    // The link carries the active filters so the printable opens on the same selection.
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('/insights/report')
    expect(href).toContain('period=last_month')
    expect(href).toContain('branchId=b1')
  })

  it('wires a MetricInfo explainer on the card', () => {
    renderCard()
    const infoTriggers = screen
      .getAllByRole('button')
      .filter((b) => /about|how|what|export/i.test(b.getAttribute('aria-label') ?? ''))
    expect(infoTriggers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders NO "Delivered" wording (banned-copy guard)', () => {
    const { container } = renderCard()
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })

  it('renders NO "email" report promise (banned-copy guard)', () => {
    const { container } = renderCard()
    expect(container.textContent ?? '').not.toMatch(/email/i)
  })

  it('renders NO "Customer" column reference in the export description', () => {
    const { container } = renderCard()
    // The export carries no Customer column; the copy must not imply one.
    expect(container.textContent ?? '').not.toMatch(/customer column/i)
  })
})
