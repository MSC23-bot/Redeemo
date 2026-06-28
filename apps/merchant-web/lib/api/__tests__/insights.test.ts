/**
 * PR-B Task B1 client tests for lib/api/insights.ts.
 *
 * Mocks apiFetch and asserts the strict zod schemas mirror the PR-A wire contract
 * EXACTLY (src/api/merchant/insights/{routes,format,service}.ts):
 *   - every endpoint parser parses a representative fixture;
 *   - Decimal-as-string coercion (Prisma Decimal serializes as a JSON STRING) is
 *     tolerated by z.coerce.number();
 *   - the gated `{ available:false }` variants (repeatRate, /customers blocks,
 *     /export.csv) parse;
 *   - the busy-times `mode:'intensity'` union parses, requires NO `logged`/count
 *     field, and tolerates a stray field on a grid cell (forward-compat);
 *   - completionRate stays a 0..1 fraction (0.75 -> 0.75, NOT 75);
 *   - the comparison object has NO `kind` field (the AS-BUILT shape is
 *     `{ cur, prev, pct, label } | null`).
 * It also asserts the querystring builder + the gated export distinction.
 */
import {
  getInsightsOverview,
  getInsightsTrend,
  getInsightsVouchers,
  getInsightsBranches,
  getInsightsValidation,
  getInsightsBusyTimes,
  getInsightsCustomers,
  insightsExportUrl,
  downloadInsightsExport,
  comparisonSchema,
  overviewSchema,
  trendSchema,
  vouchersSchema,
  branchesSchema,
  validationSchema,
  busyTimesSchema,
  customersSchema,
} from '../insights'

const apiFetch = jest.fn()
jest.mock('../client', () => ({
  apiFetch: (path: string, opts: unknown) => apiFetch(path, opts),
}))

// ---- representative fixtures (mirror the PR-A wire contract) ----------------

const COMPARISON = { cur: 120, prev: 100, pct: 20, label: 'last_month' }

const OVERVIEW = {
  redemptionActivity: { logged: 120, confirmed: 90, awaiting: 30, comparison: COMPARISON },
  distinctCustomers: { logged: 75, comparison: COMPARISON },
  repeatRate: { value: 42.5, insufficient: false, comparison: COMPARISON },
  savings: {
    estimatedLogged: 600.5,
    estimatedConfirmed: 450.25,
    awaiting: 150.25,
    comparison: COMPARISON,
  },
  meta: {
    scopeLabel: 'All branches',
    earliestDate: '2026-01-01T00:00:00.000Z',
    filtersEcho: {
      period: 'this_month',
      branchId: null,
      voucherType: null,
      from: null,
      to: null,
    },
  },
}

const TREND = {
  months: [
    { monthStartLondon: '2026-01-01', logged: 10, confirmed: 8 },
    { monthStartLondon: '2026-02-01', logged: 12, confirmed: 11 },
  ],
}

const VOUCHERS = {
  top: [
    {
      voucherId: 'v1',
      title: 'Free coffee',
      type7: 'FREEBIE',
      logged: 40,
      confirmed: 30,
      estimatedLogged: 100,
      estimatedConfirmed: 75,
    },
  ],
  byType: [
    { type7: 'FREEBIE', logged: 40, sharePct: 66.7 },
    { type7: 'BOGO', logged: 20, sharePct: 33.3 },
  ],
}

const BRANCHES = {
  rows: [
    {
      branchId: 'b1',
      name: 'High Street',
      logged: 60,
      confirmed: 45,
      estimatedLogged: 300,
      estimatedConfirmed: 225,
    },
  ],
}

const VALIDATION = {
  logged: 100,
  confirmed: 75,
  awaiting: 25,
  completionRate: 0.75,
  methods: [
    { method: 'MANUAL', count: 50 },
    { method: 'QR_SCAN', count: 25 },
  ],
}

const BUSY_TIMES = {
  mode: 'intensity',
  grid: [
    { day: 0, daypart: 0, intensity: 0 },
    { day: 0, daypart: 1, intensity: 2 },
    { day: 6, daypart: 5, intensity: 3 },
  ],
  busiest: { day: 6, daypart: 5 },
}

const CUSTOMERS = {
  newVsReturning: { newCount: 30, returningCount: 45, total: 75 },
  repeatRate: { value: 60, insufficient: false, comparison: COMPARISON },
}

beforeEach(() => {
  apiFetch.mockReset()
})

// ---- comparison shape ------------------------------------------------------

describe('comparisonSchema', () => {
  it('parses the AS-BUILT shape { cur, prev, pct, label } and null', () => {
    expect(comparisonSchema.parse(COMPARISON)).toEqual(COMPARISON)
    expect(comparisonSchema.parse({ cur: 1, prev: 0, pct: null, label: 'all' })).toEqual({
      cur: 1,
      prev: 0,
      pct: null,
      label: 'all',
    })
    expect(comparisonSchema.parse(null)).toBeNull()
  })

  it('does NOT require or surface a `kind` field (the AS-BUILT shape has none)', () => {
    // A `kind` is NOT part of the wire contract. The schema must parse WITHOUT it.
    const parsed = comparisonSchema.parse(COMPARISON)
    expect(parsed).not.toHaveProperty('kind')
  })

  it('coerces a STRING cur/prev (Decimal on the wire) to a number', () => {
    const parsed = comparisonSchema.parse({ cur: '120', prev: '100', pct: 20, label: 'last_3m' })
    expect(parsed).not.toBeNull()
    expect(parsed!.cur).toBe(120)
    expect(typeof parsed!.cur).toBe('number')
  })
})

// ---- overview --------------------------------------------------------------

describe('getInsightsOverview', () => {
  it('GETs /overview with the filter querystring and parses the payload', async () => {
    apiFetch.mockResolvedValueOnce(OVERVIEW)
    const res = await getInsightsOverview({ period: 'this_month' })
    const path = apiFetch.mock.calls[0][0] as string
    expect(path).toContain('/api/v1/merchant/insights/overview')
    expect(path).toContain('period=this_month')
    expect(apiFetch.mock.calls[0][1]).toEqual({ method: 'GET', auth: true })
    expect(res.redemptionActivity.logged).toBe(120)
    expect(res.meta.scopeLabel).toBe('All branches')
  })

  it('coerces STRING savings Decimals to numbers', async () => {
    apiFetch.mockResolvedValueOnce({
      ...OVERVIEW,
      savings: {
        estimatedLogged: '600.50',
        estimatedConfirmed: '450.25',
        awaiting: '150.25',
        comparison: null,
      },
    })
    const res = await getInsightsOverview({})
    expect(res.savings.estimatedLogged).toBe(600.5)
    expect(typeof res.savings.estimatedConfirmed).toBe('number')
  })

  it('parses the gated repeatRate { available:false } variant', async () => {
    apiFetch.mockResolvedValueOnce({ ...OVERVIEW, repeatRate: { available: false } })
    const res = await getInsightsOverview({})
    expect(res.repeatRate).toEqual({ available: false })
  })

  it('parses the insufficient repeatRate variant (value null)', () => {
    const parsed = overviewSchema.parse({
      ...OVERVIEW,
      repeatRate: { value: null, insufficient: true, comparison: null },
    })
    expect('available' in parsed.repeatRate).toBe(false)
    if (!('available' in parsed.repeatRate)) {
      expect(parsed.repeatRate.value).toBeNull()
      expect(parsed.repeatRate.insufficient).toBe(true)
    }
  })

  it('parses a null comparison on every KPI (incomplete period)', () => {
    const parsed = overviewSchema.parse({
      ...OVERVIEW,
      redemptionActivity: { logged: 1, confirmed: 1, awaiting: 0, comparison: null },
      distinctCustomers: { logged: 1, comparison: null },
      savings: { estimatedLogged: 0, estimatedConfirmed: 0, awaiting: 0, comparison: null },
    })
    expect(parsed.redemptionActivity.comparison).toBeNull()
    expect(parsed.distinctCustomers.comparison).toBeNull()
    expect(parsed.savings.comparison).toBeNull()
  })
})

// ---- trend -----------------------------------------------------------------

describe('getInsightsTrend', () => {
  it('GETs /trend and parses the months', async () => {
    apiFetch.mockResolvedValueOnce(TREND)
    const res = await getInsightsTrend({ period: 'last_6m' })
    expect(apiFetch.mock.calls[0][0]).toContain('/api/v1/merchant/insights/trend')
    expect(res.months).toHaveLength(2)
    expect(res.months[0].monthStartLondon).toBe('2026-01-01')
  })

  it('coerces STRING logged/confirmed to numbers', () => {
    const parsed = trendSchema.parse({ months: [{ monthStartLondon: '2026-01-01', logged: '10', confirmed: '8' }] })
    expect(parsed.months[0].logged).toBe(10)
    expect(parsed.months[0].confirmed).toBe(8)
  })
})

// ---- vouchers --------------------------------------------------------------

describe('getInsightsVouchers', () => {
  it('GETs /vouchers and parses top + byType', async () => {
    apiFetch.mockResolvedValueOnce(VOUCHERS)
    const res = await getInsightsVouchers({})
    expect(apiFetch.mock.calls[0][0]).toContain('/api/v1/merchant/insights/vouchers')
    expect(res.top[0].type7).toBe('FREEBIE')
    expect(res.byType[0].sharePct).toBe(66.7)
  })

  it('coerces STRING estimated Decimals on top rows', () => {
    const parsed = vouchersSchema.parse({
      top: [
        {
          voucherId: 'v1',
          title: 'X',
          type7: 'DISCOUNT',
          logged: '5',
          confirmed: '4',
          estimatedLogged: '10.50',
          estimatedConfirmed: '8.00',
        },
      ],
      byType: [],
    })
    expect(parsed.top[0].estimatedLogged).toBe(10.5)
    expect(parsed.top[0].type7).toBe('DISCOUNT')
  })
})

// ---- branches --------------------------------------------------------------

describe('getInsightsBranches', () => {
  it('GETs /branches and parses rows', async () => {
    apiFetch.mockResolvedValueOnce(BRANCHES)
    const res = await getInsightsBranches({})
    expect(apiFetch.mock.calls[0][0]).toContain('/api/v1/merchant/insights/branches')
    expect(res.rows[0].branchId).toBe('b1')
  })

  it('coerces STRING estimated Decimals on rows and parses empty rows', () => {
    expect(branchesSchema.parse({ rows: [] }).rows).toEqual([])
    const parsed = branchesSchema.parse({
      rows: [
        {
          branchId: 'b1',
          name: 'X',
          logged: '60',
          confirmed: '45',
          estimatedLogged: '300.00',
          estimatedConfirmed: '225.00',
        },
      ],
    })
    expect(parsed.rows[0].estimatedLogged).toBe(300)
  })
})

// ---- validation ------------------------------------------------------------

describe('getInsightsValidation', () => {
  it('GETs /validation and keeps completionRate as a 0..1 FRACTION', async () => {
    apiFetch.mockResolvedValueOnce(VALIDATION)
    const res = await getInsightsValidation({})
    expect(apiFetch.mock.calls[0][0]).toContain('/api/v1/merchant/insights/validation')
    // 0.75 must stay 0.75 (a fraction). The client formats the % display, NOT the schema.
    expect(res.completionRate).toBe(0.75)
    expect(res.methods).toHaveLength(2)
  })

  it('parses an EMPTY methods array (adaptive: <=1 method has data)', () => {
    const parsed = validationSchema.parse({ logged: 5, confirmed: 5, awaiting: 0, completionRate: 1, methods: [] })
    expect(parsed.methods).toEqual([])
    expect(parsed.completionRate).toBe(1)
  })

  it('coerces a STRING completionRate to a number and keeps it 0..1', () => {
    const parsed = validationSchema.parse({ logged: 4, confirmed: 1, awaiting: 3, completionRate: '0.25', methods: [] })
    expect(parsed.completionRate).toBe(0.25)
  })
})

// ---- busy-times ------------------------------------------------------------

describe('getInsightsBusyTimes', () => {
  it('GETs /busy-times and parses the intensity union', async () => {
    apiFetch.mockResolvedValueOnce(BUSY_TIMES)
    const res = await getInsightsBusyTimes({})
    expect(apiFetch.mock.calls[0][0]).toContain('/api/v1/merchant/insights/busy-times')
    expect('mode' in res && res.mode).toBe('intensity')
    if ('grid' in res) {
      expect(res.grid).toHaveLength(3)
      expect(res.busiest).toEqual({ day: 6, daypart: 5 })
    }
  })

  it('requires NO logged/count field on an intensity grid cell', () => {
    // A bare intensity cell (only day/daypart/intensity) must parse.
    const parsed = busyTimesSchema.parse({
      mode: 'intensity',
      grid: [{ day: 1, daypart: 2, intensity: 1 }],
      busiest: null,
    })
    expect('grid' in parsed).toBe(true)
  })

  it('tolerates a STRAY field on an intensity grid cell (forward-compat, does not break)', () => {
    // A stray field must NOT throw (the contract may add fields later); the client
    // only renders day/daypart/intensity. It must never threshold on a raw count.
    const parsed = busyTimesSchema.parse({
      mode: 'intensity',
      grid: [{ day: 1, daypart: 2, intensity: 1, somethingNew: 999 }],
      busiest: null,
    })
    expect('grid' in parsed).toBe(true)
  })

  it('parses a null busiest (near-empty peak / no approved threshold)', () => {
    const parsed = busyTimesSchema.parse({ mode: 'intensity', grid: [], busiest: null })
    if ('busiest' in parsed) expect(parsed.busiest).toBeNull()
  })

  it('parses the defensive { available:false } variant', () => {
    expect(busyTimesSchema.parse({ available: false })).toEqual({ available: false })
  })
})

// ---- customers (gated) -----------------------------------------------------

describe('getInsightsCustomers', () => {
  it('GETs /customers and parses both blocks', async () => {
    apiFetch.mockResolvedValueOnce(CUSTOMERS)
    const res = await getInsightsCustomers({})
    expect(apiFetch.mock.calls[0][0]).toContain('/api/v1/merchant/insights/customers')
    expect('newCount' in res.newVsReturning && res.newVsReturning.newCount).toBe(30)
  })

  it('parses the gated { available:false } variant on BOTH blocks', () => {
    const parsed = customersSchema.parse({
      newVsReturning: { available: false },
      repeatRate: { available: false },
    })
    expect(parsed.newVsReturning).toEqual({ available: false })
    expect(parsed.repeatRate).toEqual({ available: false })
  })

  it('coerces STRING counts on newVsReturning', () => {
    const parsed = customersSchema.parse({
      newVsReturning: { newCount: '30', returningCount: '45', total: '75' },
      repeatRate: { available: false },
    })
    if ('newCount' in parsed.newVsReturning) {
      expect(parsed.newVsReturning.newCount).toBe(30)
      expect(parsed.newVsReturning.total).toBe(75)
    }
  })
})

// ---- querystring builder ---------------------------------------------------

describe('filter querystring', () => {
  it('serialises all filter keys and skips undefined/empty', async () => {
    apiFetch.mockResolvedValueOnce(OVERVIEW)
    await getInsightsOverview({
      period: 'custom',
      from: '2026-01',
      to: '2026-03',
      branchId: 'b1',
      voucherType: 'BOGO',
    })
    const path = apiFetch.mock.calls[0][0] as string
    expect(path).toContain('period=custom')
    expect(path).toContain('from=2026-01')
    expect(path).toContain('to=2026-03')
    expect(path).toContain('branchId=b1')
    expect(path).toContain('voucherType=BOGO')
  })

  it('omits the querystring entirely when no filters are set', async () => {
    apiFetch.mockResolvedValueOnce(TREND)
    await getInsightsTrend({})
    expect(apiFetch.mock.calls[0][0]).toBe('/api/v1/merchant/insights/trend')
  })
})

// ---- export ----------------------------------------------------------------

describe('insightsExportUrl', () => {
  it('builds the /export.csv path with filters and without unrelated params', () => {
    const path = insightsExportUrl({ period: 'last_month', branchId: 'b1', voucherType: 'DISCOUNT' })
    expect(path).toContain('/api/v1/merchant/insights/export.csv')
    expect(path).toContain('period=last_month')
    expect(path).toContain('branchId=b1')
    expect(path).toContain('voucherType=DISCOUNT')
  })

  it('returns the bare path when there are no filters', () => {
    expect(insightsExportUrl({})).toBe('/api/v1/merchant/insights/export.csv')
  })
})

describe('downloadInsightsExport', () => {
  const realFetch = global.fetch
  afterEach(() => {
    global.fetch = realFetch
  })

  it('distinguishes the gated JSON { available:false } from a csv body', async () => {
    // The gate-closed path returns application/json { available:false }.
    const jsonRes = {
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({ available: false }),
      text: async () => {
        throw new Error('should not read text for json')
      },
    }
    global.fetch = jest.fn(async () => jsonRes) as unknown as typeof fetch
    const res = await downloadInsightsExport({ period: 'all' })
    expect(res).toEqual({ available: false })
  })

  it('returns the csv body when the gate is open (text/csv)', async () => {
    const csv = 'Redeemed date,Redeemed time\r\n"2026-01-01","10:00:00"'
    const csvRes = {
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'text/csv; charset=utf-8' : null) },
      text: async () => csv,
      json: async () => {
        throw new Error('should not read json for csv')
      },
    }
    global.fetch = jest.fn(async () => csvRes) as unknown as typeof fetch
    const res = await downloadInsightsExport({})
    expect(res).toEqual({ csv, filename: 'insights-redemptions.csv' })
  })
})
