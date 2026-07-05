/**
 * The Insights & reports module (dashboard + printable report) in a real browser.
 * Covers: the overview dashboard end to end (KPI cards, trend chart, the five-tab
 * section, the Reports card), the Decimal-as-string wire-accuracy path across every
 * numeric Insights endpoint (the #327 regression class - see mocks.ts
 * insightsOverviewFixture and friends), the global filter bar wiring period/branch/
 * voucherType into the live /overview request, the printable report page journey
 * (opened from the Reports card, in a new tab, on the SAME /overview contract), the
 * early-life "warming up" empty state, and the event-level CSV export gate (closed
 * vs open) including the exact outgoing request shape.
 *
 * Role scope (load-bearing): every case here uses the OWNER role fixture only.
 * PR #381 (open at the time this spec was written) changes BM/STAFF gating on
 * merchant-web pages; this spec must stay green whether or not it merges, so it
 * makes NO assertion about BM/STAFF visibility of any Insights control. Modeled on
 * the identical constraint recorded in e2e/branches.spec.ts on branch
 * origin/test/branches-smoke (read-only reference, not a base for this branch).
 *
 * Guards + unmatched-tracker assertions are automatic via ./support/fixtures.
 */
import { test, expect } from './support/fixtures'
import {
  insightsOverviewFixture,
  insightsTrendFixture,
  insightsVouchersFixture,
  insightsBranchesFixture,
  insightsValidationFixture,
} from './support/mocks'

// ---------------------------------------------------------------------------
// Case 1: the overview dashboard renders end to end with populated data.
// ---------------------------------------------------------------------------

test.describe('insights overview renders end-to-end with populated data', () => {
  test.use({ mockOptions: { role: 'OWNER' } })

  test('KPI cards, the trend chart, the tabbed sections, and the Reports card all render; switching tabs loads the newly active section', async ({
    page,
  }) => {
    await page.goto('/insights')
    await expect(page.getByRole('heading', { name: 'Insights and reports' })).toBeVisible()

    // The four KPI cards (redemption activity / distinct customers / repeat rate /
    // estimated savings), driven by the default insightsOverviewFixture().
    await expect(page.getByTestId('kpi-redemption-activity')).toBeVisible()
    await expect(page.getByTestId('kpi-redemption-activity').getByText('61')).toBeVisible()
    await expect(page.getByTestId('kpi-distinct-customers').getByText('40')).toBeVisible()
    await expect(page.getByTestId('kpi-repeat-rate').getByText('28%')).toBeVisible()
    await expect(page.getByTestId('kpi-savings').getByText('£793.00')).toBeVisible()
    await expect(page.getByTestId('kpi-savings').getByText('£638.00')).toBeVisible()

    // The trend chart's own async query (its chart container + legend).
    await expect(page.getByTestId('trend-chart')).toBeVisible()
    await expect(page.getByTestId('trend-legend')).toBeVisible()

    // The tab list (5 tabs) + the default Vouchers tab content.
    const tablist = page.getByRole('tablist', { name: 'Insights sections' })
    await expect(tablist.getByRole('tab')).toHaveCount(5)
    await expect(page.getByTestId('top-vouchers-list')).toBeVisible()
    await expect(page.getByTestId('by-type-card')).toBeVisible()

    // Switching to Branches loads its own section (its own query; not pre-fetched).
    await page.getByRole('tab', { name: /branches/i }).click()
    await expect(page.getByTestId('branches-card')).toBeVisible()
    await expect(page.getByTestId('branches-list').getByText('Old Foundry')).toBeVisible()

    // Switching to Validation loads its own section too.
    await page.getByRole('tab', { name: /validation/i }).click()
    await expect(page.getByTestId('validation-summary')).toBeVisible()
    await expect(page.getByTestId('validation-methods')).toBeVisible()

    // The Reports card (both report actions).
    await expect(page.getByTestId('insights-reports')).toBeVisible()
    await expect(page.getByRole('link', { name: /print or save report/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Case 2: Decimal-as-string wire accuracy (the #327 class) across every
// numeric Insights endpoint - no crash, no NaN, correctly formatted output.
// ---------------------------------------------------------------------------

test.describe('wire-accuracy: Decimal-as-string numeric fields (the #327 class)', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      insightsOverview: insightsOverviewFixture({
        redemptionActivity: {
          logged: '61',
          confirmed: '49',
          awaiting: '12',
          comparison: { cur: '75', prev: '60', pct: '13.3', label: 'last_month' },
        },
        distinctCustomers: { logged: '40', comparison: null },
        repeatRate: { value: '28', insufficient: false, comparison: null },
        savings: { estimatedLogged: '793.00', estimatedConfirmed: '638.00', awaiting: '155', comparison: null },
      }),
      insightsTrend: insightsTrendFixture({
        months: [
          { monthStartLondon: '2026-05-01', logged: '20', confirmed: '16' },
          { monthStartLondon: '2026-06-01', logged: '41', confirmed: '33' },
        ],
      }),
      insightsVouchers: insightsVouchersFixture({
        top: [
          {
            voucherId: 'v1',
            title: 'Buy one main, get one free',
            type7: 'BOGO',
            logged: '32',
            confirmed: '30',
            estimatedLogged: '416',
            estimatedConfirmed: '390',
          },
        ],
        byType: [{ type7: 'BOGO', logged: '32', sharePct: '100' }],
      }),
      insightsBranches: insightsBranchesFixture({
        rows: [
          {
            branchId: 'b1',
            name: 'Old Foundry',
            logged: '32',
            confirmed: '30',
            estimatedLogged: '416',
            estimatedConfirmed: '390',
          },
        ],
      }),
      insightsValidation: insightsValidationFixture({
        logged: '61',
        confirmed: '49',
        awaiting: '12',
        completionRate: '0.8',
        methods: [
          { method: 'QR_SCAN', count: '30' },
          { method: 'MANUAL', count: '19' },
        ],
      }),
    },
  })

  test('overview, trend, vouchers, branches and validation all parse Decimal-as-string fields without a NaN or crash', async ({
    page,
  }) => {
    await page.goto('/insights')

    // KPIs: string inputs parsed (z.coerce.number()) and formatted correctly, never "NaN".
    await expect(page.getByTestId('kpi-redemption-activity').getByText('61')).toBeVisible()
    await expect(page.getByTestId('kpi-redemption-activity').getByText('49')).toBeVisible()
    await expect(page.getByTestId('kpi-redemption-activity').getByText('12')).toBeVisible()
    // The string comparison object (cur/prev/pct as strings) renders a real chip, not NaN%.
    await expect(page.getByTestId('kpi-redemption-activity').getByText(/13% up on the previous month/i)).toBeVisible()
    await expect(page.getByTestId('kpi-distinct-customers').getByText('40')).toBeVisible()
    await expect(page.getByTestId('kpi-repeat-rate').getByText('28%')).toBeVisible()
    await expect(page.getByTestId('kpi-savings').getByText('£793.00')).toBeVisible()
    await expect(page.getByTestId('kpi-savings').getByText('£638.00')).toBeVisible()

    // The trend chart renders (string logged/confirmed coerced without crashing the bars).
    await expect(page.getByTestId('trend-chart')).toBeVisible()

    // The Vouchers tab (default) - string logged/confirmed/estimated fields.
    const voucherRow = page.getByTestId('top-vouchers-list').getByText('Buy one main, get one free')
    await expect(voucherRow).toBeVisible()
    await expect(page.getByTestId('top-vouchers-list').getByText('32')).toBeVisible()
    await expect(page.getByTestId('top-vouchers-list').getByText(/30 confirmed/)).toBeVisible()
    await expect(page.getByTestId('top-vouchers-list').getByText(/£416\.00 estimated savings/)).toBeVisible()

    // The Branches tab - same string-field class.
    await page.getByRole('tab', { name: /branches/i }).click()
    await expect(page.getByTestId('branches-list').getByText('Old Foundry')).toBeVisible()
    await expect(page.getByTestId('branches-list').getByText(/30 confirmed/)).toBeVisible()
    await expect(page.getByTestId('branches-list').getByText(/£416\.00 estimated savings/)).toBeVisible()

    // The Validation tab - completionRate as a string fraction, method counts as strings.
    await page.getByRole('tab', { name: /validation/i }).click()
    await expect(page.getByTestId('validation-summary').getByText('80%')).toBeVisible()
    await expect(page.getByTestId('validation-summary').getByText('49')).toBeVisible()
    await expect(page.getByTestId('validation-summary').getByText('12')).toBeVisible()
    await expect(page.getByTestId('validation-methods').getByText('30')).toBeVisible()
    await expect(page.getByTestId('validation-methods').getByText('19')).toBeVisible()

    // No literal "NaN" text ever rendered anywhere on the page.
    await expect(page.locator('body')).not.toContainText('NaN')
  })
})

// ---------------------------------------------------------------------------
// Case 3: the global filter bar wires the active selection into the live
// /overview request (period / branch / voucher type).
// ---------------------------------------------------------------------------

test.describe('the filter bar wires the active selection into the /overview request', () => {
  test.use({ mockOptions: { role: 'OWNER' } })

  test('selecting "Last month" fires a new /overview request carrying period=last_month', async ({ page }) => {
    await page.goto('/insights')
    await expect(page.getByTestId('kpi-redemption-activity')).toBeVisible()

    const req = page.waitForRequest(
      (r) => r.url().includes('/api/v1/merchant/insights/overview') && r.url().includes('period=last_month'),
    )
    await page.getByRole('button', { name: /this month/i }).click()
    await page.getByRole('menu', { name: 'Period' }).getByRole('menuitemradio', { name: 'Last month' }).click()
    const request = await req
    expect(new URL(request.url()).searchParams.get('period')).toBe('last_month')
  })

  test('selecting a branch fires a new /overview request carrying branchId=<id>', async ({ page }) => {
    await page.goto('/insights')
    await expect(page.getByTestId('kpi-redemption-activity')).toBeVisible()

    // branchFixture('b2') (the default second branch) is named "Riverside".
    const req = page.waitForRequest(
      (r) => r.url().includes('/api/v1/merchant/insights/overview') && r.url().includes('branchId=b2'),
    )
    await page.getByRole('button', { name: 'All branches' }).click()
    await page.getByRole('menu', { name: 'Branch' }).getByRole('menuitemradio', { name: 'Riverside' }).click()
    const request = await req
    expect(new URL(request.url()).searchParams.get('branchId')).toBe('b2')
  })

  test('selecting a voucher type fires a new /overview request carrying voucherType=DISCOUNT', async ({ page }) => {
    await page.goto('/insights')
    await expect(page.getByTestId('kpi-redemption-activity')).toBeVisible()

    const req = page.waitForRequest(
      (r) => r.url().includes('/api/v1/merchant/insights/overview') && r.url().includes('voucherType=DISCOUNT'),
    )
    await page.getByRole('button', { name: 'All voucher types' }).click()
    await page.getByRole('menu', { name: 'Voucher type' }).getByRole('menuitemradio', { name: 'Discount' }).click()
    const request = await req
    expect(new URL(request.url()).searchParams.get('voucherType')).toBe('DISCOUNT')
  })
})

// ---------------------------------------------------------------------------
// Case 4: the printable report page journey, opened from the Reports card.
// ---------------------------------------------------------------------------

test.describe('printable report page journey', () => {
  test.use({ mockOptions: { role: 'OWNER' } })

  test('"Print or save report" opens /insights/report in a new tab, reflecting the same figures, scope, and period', async ({
    page,
    context,
  }) => {
    await page.goto('/insights')
    await expect(page.getByTestId('insights-reports')).toBeVisible()

    const [reportPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: /print or save report/i }).click(),
    ])
    await reportPage.waitForURL(/\/insights\/report/)
    await expect(reportPage.getByRole('heading', { name: 'Performance summary' })).toBeVisible()

    // Same /overview contract as the dashboard: Logged / Confirmed / Awaiting + the
    // estimated savings pair.
    await expect(reportPage.getByText('61', { exact: true })).toBeVisible()
    await expect(reportPage.getByText('49', { exact: true })).toBeVisible()
    await expect(reportPage.getByText('12', { exact: true })).toBeVisible()
    await expect(reportPage.getByText('£793.00', { exact: true })).toBeVisible()
    await expect(reportPage.getByText('£638.00', { exact: true })).toBeVisible()

    // The scope statement: default filters (This month / All branches / All voucher types).
    await expect(reportPage.getByText('This month', { exact: true })).toBeVisible()
    await expect(reportPage.getByText('All branches', { exact: true })).toBeVisible()
    await expect(reportPage.getByText('All voucher types', { exact: true })).toBeVisible()

    // Generated date: en-GB, Europe/London, day/month/year (mirrors generatedOn()).
    const expectedGenerated = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
    await expect(reportPage.getByText(expectedGenerated, { exact: true })).toBeVisible()

    await reportPage.close()
  })
})

// ---------------------------------------------------------------------------
// Case 5: the early-life "warming up" empty state (a live merchant with zero
// eligible activity), distinct from the dashboard and from the per-filter
// "no data for this filter" state.
// ---------------------------------------------------------------------------

test.describe('early-life warming-up empty state', () => {
  test.use({
    mockOptions: {
      role: 'OWNER',
      insightsOverview: insightsOverviewFixture({
        redemptionActivity: { logged: 0, confirmed: 0, awaiting: 0, comparison: null },
        distinctCustomers: { logged: 0, comparison: null },
        repeatRate: { value: null, insufficient: true, comparison: null },
        savings: { estimatedLogged: 0, estimatedConfirmed: 0, awaiting: 0, comparison: null },
        meta: {
          scopeLabel: 'All branches',
          earliestDate: null,
          filtersEcho: { period: 'this_month', branchId: null, voucherType: null, from: null, to: null },
        },
      }),
    },
  })

  test('a live merchant with no eligible activity ever sees the warming-up state (not the dashboard), with a working Manage your vouchers CTA', async ({
    page,
  }) => {
    await page.goto('/insights')

    await expect(page.getByTestId('insights-warming-up')).toBeVisible()
    await expect(page.getByText(/your insights are warming up/i)).toBeVisible()
    const cta = page.getByRole('link', { name: /manage your vouchers/i })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '/vouchers')

    // The dashboard KPIs / trend / reports never render for the warming-up state.
    await expect(page.getByTestId('kpi-redemption-activity')).toHaveCount(0)
    await expect(page.getByTestId('trend-chart')).toHaveCount(0)
    await expect(page.getByTestId('insights-reports')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// Case 6: the event-level CSV export gate (closed vs open) + the exact
// outgoing request shape when the gate is open.
// ---------------------------------------------------------------------------

test.describe('event-level CSV export gate', () => {
  test.describe('gate CLOSED (repeatRate behind the same server gate)', () => {
    test.use({
      mockOptions: {
        role: 'OWNER',
        insightsOverview: insightsOverviewFixture({ repeatRate: { available: false } }),
      },
    })

    test('renders a calm Not-available status, with no Download CSV button and no export request', async ({
      page,
    }) => {
      await page.goto('/insights')
      await expect(page.getByTestId('insights-reports')).toBeVisible()
      await expect(page.getByTestId('csv-not-available')).toBeVisible()
      await expect(
        page.getByRole('button', { name: /redemption activity csv excluding direct customer identifiers/i }),
      ).toHaveCount(0)
    })
  })

  test.describe('gate OPEN (repeatRate present)', () => {
    test.use({
      mockOptions: {
        role: 'OWNER',
        insightsExportAvailable: true,
      },
    })

    test('Download CSV fires a request to export.csv carrying the active filters', async ({ page }) => {
      await page.goto('/insights')
      await expect(page.getByTestId('insights-reports')).toBeVisible()
      await expect(page.getByTestId('csv-not-available')).toHaveCount(0)

      const csvRequest = page.waitForRequest((r) => r.url().includes('/api/v1/merchant/insights/export.csv'))
      await page.getByRole('button', { name: /redemption activity csv excluding direct customer identifiers/i }).click()
      const request = await csvRequest
      const requestUrl = new URL(request.url())
      expect(requestUrl.pathname).toBe('/api/v1/merchant/insights/export.csv')
      expect(requestUrl.searchParams.get('period')).toBe('this_month')
    })
  })
})
