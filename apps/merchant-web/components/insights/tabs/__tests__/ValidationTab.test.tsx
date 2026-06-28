/**
 * PR-B Task B6a: the Insights Validation tab (spec 9 / 1.8, screenshot 10).
 *
 * Driven by /validation:
 *   - logged / confirmed / awaiting totals + a completion rate. completionRate is a
 *     0..1 FRACTION on the wire and is displayed as a whole-number percent (rate*100).
 *   - An ADAPTIVE method breakdown (from methods[]) shown ONLY when methods has >1
 *     entry with data; hidden otherwise.
 *
 * Copy guards (spec 2.4):
 *   - "Confirmed = validated by staff; Awaiting = logged, not yet confirmed."
 *   - The prototype's "honoured" wording is BANNED.
 */
import { render, screen, within, cleanup } from '@testing-library/react'
import { ValidationTab } from '../ValidationTab'
import type { InsightsValidation, InsightsFilters } from '@/lib/api/insights'

jest.mock('@/lib/api/insights', () => ({
  __esModule: true,
  getInsightsValidation: jest.fn(),
}))

import { getInsightsValidation } from '@/lib/api/insights'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGet = getInsightsValidation as jest.MockedFunction<typeof getInsightsValidation>

const VALIDATION: InsightsValidation = {
  logged: 63,
  confirmed: 61,
  awaiting: 2,
  completionRate: 0.97, // FRACTION -> "97%"
  methods: [
    { method: 'QR_SCAN', count: 35 },
    { method: 'MANUAL', count: 26 },
  ],
}

function renderTab(filters: InsightsFilters = { period: 'this_month' }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ValidationTab filters={filters} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockResolvedValue(VALIDATION)
})
afterEach(cleanup)

describe('ValidationTab', () => {
  it('renders confirmed / awaiting totals + the completion rate as a percent', async () => {
    renderTab()
    const card = await screen.findByTestId('validation-summary')
    expect(within(card).getByText('61')).toBeInTheDocument()
    expect(within(card).getByText('2')).toBeInTheDocument()
    // completionRate 0.97 displayed as "97%" (rate*100), NOT "0.97" or "9700%".
    expect(within(card).getByText('97%')).toBeInTheDocument()
    expect(within(card).queryByText('0.97')).not.toBeInTheDocument()
  })

  it('uses the "Confirmed = validated by staff; Awaiting = logged, not yet confirmed" framing', async () => {
    renderTab()
    const card = await screen.findByTestId('validation-summary')
    // The locked framing line is the card subtitle (exact copy).
    expect(
      within(card).getByText(
        'Confirmed = validated by staff; Awaiting = logged, not yet confirmed.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the adaptive method breakdown when methods has >1 entry with data', async () => {
    renderTab()
    const methods = await screen.findByTestId('validation-methods')
    // The legend label is "QR scan" (singular); the subtitle says "QR scans" (plural),
    // so the exact-singular match resolves to the legend row only.
    expect(within(methods).getByText('QR scan')).toBeInTheDocument()
    expect(within(methods).getByText('35')).toBeInTheDocument()
    expect(within(methods).getByText('Manual entry')).toBeInTheDocument()
    expect(within(methods).getByText('26')).toBeInTheDocument()
  })

  it('HIDES the method breakdown when there is only one method with data', async () => {
    mockGet.mockResolvedValue({
      ...VALIDATION,
      methods: [{ method: 'QR_SCAN', count: 61 }],
    })
    renderTab()
    await screen.findByTestId('validation-summary')
    expect(screen.queryByTestId('validation-methods')).not.toBeInTheDocument()
  })

  it('HIDES the method breakdown when methods is empty', async () => {
    mockGet.mockResolvedValue({ ...VALIDATION, methods: [] })
    renderTab()
    await screen.findByTestId('validation-summary')
    expect(screen.queryByTestId('validation-methods')).not.toBeInTheDocument()
  })

  it('HIDES the method breakdown when more than one method exists but only one has data', async () => {
    // A second method present but with a zero count is not "data".
    mockGet.mockResolvedValue({
      ...VALIDATION,
      methods: [
        { method: 'QR_SCAN', count: 61 },
        { method: 'MANUAL', count: 0 },
      ],
    })
    renderTab()
    await screen.findByTestId('validation-summary')
    expect(screen.queryByTestId('validation-methods')).not.toBeInTheDocument()
  })

  it('does NOT use the banned "honoured" wording', async () => {
    const { container } = renderTab()
    await screen.findByTestId('validation-summary')
    expect(container.textContent ?? '').not.toMatch(/honoured/i)
    expect(container.textContent ?? '').not.toMatch(/honored/i)
  })

  it('wires a MetricInfo explainer on the validation card', async () => {
    renderTab()
    await screen.findByTestId('validation-summary')
    const infoTriggers = screen
      .getAllByRole('button')
      .filter((b) => /about|how|what/i.test(b.getAttribute('aria-label') ?? ''))
    expect(infoTriggers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders a zero-state cleanly (no methods, completion 0%)', async () => {
    mockGet.mockResolvedValue({
      logged: 0,
      confirmed: 0,
      awaiting: 0,
      completionRate: 0,
      methods: [],
    })
    renderTab()
    const card = await screen.findByTestId('validation-summary')
    expect(within(card).getByText('0%')).toBeInTheDocument()
  })
})
