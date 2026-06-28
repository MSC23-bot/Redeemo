/**
 * PR-B Task B4: the Insights overview KPI cards (spec 2.4, screenshot 02).
 *
 * Four KPIs driven by /overview:
 *   1) Redemption activity: logged headline + Confirmed/Awaiting dual-layer secondary
 *   2) Distinct customers: logged distinct count
 *   3) Repeat-customer rate: HEADLINE KPI #3 (the prototype's "Value delivered" is
 *      REPLACED; "Delivered" must not appear anywhere on the surface)
 *      - value null / insufficient -> "Building your repeat-customer picture"
 *      - { available:false }       -> a calm "Not available" (gated, not a placeholder)
 *   4) Secondary savings block: "Estimated customer savings" (estimatedLogged) +
 *      "Estimated savings on confirmed redemptions" (estimatedConfirmed)
 *
 * Each KPI shows its OWN comparison chip only when comparison != null (completed-
 * period-only); the repeat-rate chip is gated together with the metric.
 */
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react'
import { KpiCards } from '../KpiCards'
import { REPEAT_RATE_EXPLAINER } from '@/lib/insights/display'
import type { InsightsOverview, Comparison } from '@/lib/api/insights'

const COMPLETED: NonNullable<Comparison> = {
  cur: 61,
  prev: 54,
  pct: 13,
  label: 'last_month',
}

function makeOverview(overrides: Partial<InsightsOverview> = {}): InsightsOverview {
  return {
    redemptionActivity: { logged: 61, confirmed: 41, awaiting: 20, comparison: COMPLETED },
    distinctCustomers: { logged: 41, comparison: COMPLETED },
    repeatRate: { value: 42.5, insufficient: false, comparison: COMPLETED },
    savings: {
      estimatedLogged: 609,
      estimatedConfirmed: 450.25,
      awaiting: 158.75,
      comparison: COMPLETED,
    },
    meta: {
      scopeLabel: 'All branches',
      earliestDate: '2026-01-01',
      filtersEcho: {
        period: 'last_month',
        branchId: null,
        voucherType: null,
        from: null,
        to: null,
      },
    },
    ...overrides,
  }
}

afterEach(cleanup)

describe('KpiCards (the four overview KPIs)', () => {
  it('renders the four KPIs from a fixture', () => {
    render(<KpiCards overview={makeOverview()} />)

    // 1) Redemption activity: logged headline + Confirmed/Awaiting secondary.
    const activity = screen.getByTestId('kpi-redemption-activity')
    expect(within(activity).getByText('61')).toBeInTheDocument()
    expect(within(activity).getByText(/redemption activity/i)).toBeInTheDocument()
    expect(within(activity).getByText(/confirmed/i)).toBeInTheDocument()
    expect(within(activity).getByText(/awaiting/i)).toBeInTheDocument()

    // 2) Distinct customers: logged distinct count.
    const distinct = screen.getByTestId('kpi-distinct-customers')
    expect(within(distinct).getByText('41')).toBeInTheDocument()
    expect(within(distinct).getByText(/distinct customers/i)).toBeInTheDocument()

    // 3) Repeat-customer rate: the headline value as a percentage.
    const repeat = screen.getByTestId('kpi-repeat-rate')
    expect(within(repeat).getByText('42.5%')).toBeInTheDocument()
    expect(within(repeat).getByText(/repeat-customer rate/i)).toBeInTheDocument()

    // 4) Secondary savings block.
    const savings = screen.getByTestId('kpi-savings')
    expect(within(savings).getByText(/estimated customer savings/i)).toBeInTheDocument()
    expect(within(savings).getByText('£609.00')).toBeInTheDocument()
    expect(
      within(savings).getByText(/estimated savings on confirmed redemptions/i),
    ).toBeInTheDocument()
    expect(within(savings).getByText('£450.25')).toBeInTheDocument()
  })

  it('shows "Building your repeat-customer picture" when the repeat rate is insufficient', () => {
    render(
      <KpiCards
        overview={makeOverview({
          repeatRate: { value: null, insufficient: true, comparison: null },
        })}
      />,
    )
    const repeat = screen.getByTestId('kpi-repeat-rate')
    expect(within(repeat).getByText(/building your repeat-customer picture/i)).toBeInTheDocument()
    // No headline percentage when insufficient.
    expect(within(repeat).queryByText('42.5%')).not.toBeInTheDocument()
  })

  it('shows a calm "Not available" when the repeat rate is gated ({ available:false })', () => {
    render(
      <KpiCards overview={makeOverview({ repeatRate: { available: false } })} />,
    )
    const repeat = screen.getByTestId('kpi-repeat-rate')
    expect(within(repeat).getByText(/not available/i)).toBeInTheDocument()
    expect(within(repeat).queryByText(/building your repeat-customer picture/i)).not.toBeInTheDocument()
    // Still NO "Building" copy and NO percentage when gated.
    expect(within(repeat).queryByText('42.5%')).not.toBeInTheDocument()
  })

  it('shows the per-KPI comparison chip on a completed period', () => {
    render(<KpiCards overview={makeOverview()} />)
    // Redemption-activity chip present. The baseline phrase names the comparison window
    // (the month before "last month"), so it reads "...on the previous month".
    const activity = screen.getByTestId('kpi-redemption-activity')
    expect(within(activity).getByText(/13% up on the previous month/i)).toBeInTheDocument()
    // Repeat-rate chip present (gated with the metric, but here the metric is present).
    const repeat = screen.getByTestId('kpi-repeat-rate')
    expect(within(repeat).getByText(/13% up on the previous month/i)).toBeInTheDocument()
  })

  it('shows NO comparison chip on this_month (comparison null on every KPI)', () => {
    render(
      <KpiCards
        overview={makeOverview({
          redemptionActivity: { logged: 61, confirmed: 41, awaiting: 20, comparison: null },
          distinctCustomers: { logged: 41, comparison: null },
          repeatRate: { value: 42.5, insufficient: false, comparison: null },
          savings: {
            estimatedLogged: 609,
            estimatedConfirmed: 450.25,
            awaiting: 158.75,
            comparison: null,
          },
          meta: {
            scopeLabel: 'All branches',
            earliestDate: '2026-01-01',
            filtersEcho: {
              period: 'this_month',
              branchId: null,
              voucherType: null,
              from: null,
              to: null,
            },
          },
        })}
      />,
    )
    expect(screen.queryByText(/up on the previous/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/down on the previous/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no change on/i)).not.toBeInTheDocument()
  })

  it('the gated repeat-rate hides its comparison chip together with the metric', () => {
    render(
      <KpiCards overview={makeOverview({ repeatRate: { available: false } })} />,
    )
    const repeat = screen.getByTestId('kpi-repeat-rate')
    expect(within(repeat).queryByText(/up on the previous/i)).not.toBeInTheDocument()
  })

  it('renders NO "Value delivered" / "Delivered" text anywhere (visual-fidelity guard)', () => {
    const { container } = render(<KpiCards overview={makeOverview()} />)
    expect(container.textContent ?? '').not.toMatch(/delivered/i)
  })

  it('the third card is Repeat-customer rate, NOT "Value delivered to customers"', () => {
    render(<KpiCards overview={makeOverview()} />)
    expect(screen.getByText(/repeat-customer rate/i)).toBeInTheDocument()
    expect(screen.queryByText(/value delivered/i)).not.toBeInTheDocument()
  })

  it('uses the LOCKED repeat-rate explainer, identical to the Customers tab', () => {
    render(<KpiCards overview={makeOverview()} />)
    const repeat = screen.getByTestId('kpi-repeat-rate')
    const trigger = within(repeat).getByRole('button', {
      name: /how the repeat-customer rate is measured/i,
    })
    fireEvent.focus(trigger)
    // The exact shared constant (CustomersTab renders the identical string).
    expect(within(repeat).getByText(REPEAT_RATE_EXPLAINER)).toBeInTheDocument()
    expect(
      within(repeat).getByText(/already redeemed with you before this period began/i),
    ).toBeInTheDocument()
    // NOT the previous wrong "had also redeemed with you before" loose wording.
    expect(within(repeat).queryByText(/had also redeemed/i)).not.toBeInTheDocument()
  })

  it('wires a MetricInfo explainer on each metric', () => {
    render(<KpiCards overview={makeOverview()} />)
    // Each KPI exposes an info trigger (the shared MetricInfo affordance is a button
    // with an aria-label). At minimum the four metrics each carry one.
    const infoTriggers = screen
      .getAllByRole('button')
      .filter((b) => /explain|about|how|what counts|info/i.test(b.getAttribute('aria-label') ?? ''))
    expect(infoTriggers.length).toBeGreaterThanOrEqual(4)
  })
})
