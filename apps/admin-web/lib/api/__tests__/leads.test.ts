/**
 * leads.ts: typed client for the MerchantLead recruitment pipeline (#500).
 *
 * apiFetch is mocked to verify URL, method, body, auth option, Zod parsing, and
 * the LITERAL 'true'/'false' serialisation of the boolean list params. Mirrors
 * lib/api/__tests__/team.test.ts's style.
 */
import { leadsApi, LEAD_SOURCES, LEAD_STAGES } from '../leads'
import { apiFetch, ApiError } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number
    statusCode: number
    code: string | undefined
    body: unknown
    constructor(status: number, body: unknown) {
      const b = body as { error?: { code?: string; message?: string }; code?: string; message?: string } | null
      const nested = b?.error != null && typeof b.error === 'object' ? (b.error as { code?: string; message?: string }) : null
      super(nested?.message ?? b?.message ?? `API error ${status}`)
      this.name = 'ApiError'
      this.status = status
      this.statusCode = status
      this.code = nested?.code ?? b?.code
      this.body = body
    }
  },
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => {
  jest.clearAllMocks()
})

// A distinctive, fully-populated lead fixture (non-vacuous assertions).
const LEAD_ROW = {
  id: 'lead-anchor',
  businessName: 'Anchor Street Coffee',
  categoryGuess: 'Food and drink',
  locationHint: 'Bristol BS1',
  contactName: 'Marta Vane',
  contactEmail: 'marta@anchorstreet.example',
  contactPhone: '+44 117 000 0000',
  source: 'REP_VISIT',
  stage: 'LEAD',
  nextAction: 'Call back after the weekend',
  dueDate: '2026-07-20T00:00:00.000Z',
  assignedRepId: 'rep-shebin',
  lostReason: null,
  convertedMerchantId: null,
  lastActivityAt: '2026-07-12T09:00:00.000Z',
  anonymisedAt: null,
  createdAt: '2026-07-10T09:00:00.000Z',
  updatedAt: '2026-07-12T09:00:00.000Z',
}

describe('lead enums', () => {
  it('LEAD_SOURCES is exactly the 6 backend sources', () => {
    expect([...LEAD_SOURCES]).toEqual([
      'REP_VISIT',
      'INBOUND_ENQUIRY',
      'PHONE',
      'SOCIAL',
      'EMAIL_CAMPAIGN',
      'CUSTOMER_REQUEST',
    ])
  })

  it('LEAD_STAGES includes the three lanes plus the two terminal states', () => {
    expect([...LEAD_STAGES]).toEqual(['LEAD', 'CONTACTED', 'VISIT_BOOKED', 'CONVERTED', 'LOST'])
  })
})

describe('leadsApi.list', () => {
  it('GET /api/v1/admin/leads with no params (default: live lanes), auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce([LEAD_ROW])
    const result = await leadsApi.list()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/leads', { auth: true })
    expect(result).toEqual([LEAD_ROW])
  })

  it('serialises includeTerminal as the LITERAL string "true"', async () => {
    mockedApiFetch.mockResolvedValueOnce([])
    await leadsApi.list({ includeTerminal: true })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/leads?includeTerminal=true', { auth: true })
  })

  it('serialises overdue:false as the LITERAL string "false" (never a Boolean coercion)', async () => {
    mockedApiFetch.mockResolvedValueOnce([])
    await leadsApi.list({ overdue: false })
    // The url must carry overdue=false, NOT be dropped or coerced to true.
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/leads?overdue=false', { auth: true })
  })

  it('passes stage / source / assignedRepId through as query params', async () => {
    mockedApiFetch.mockResolvedValueOnce([])
    await leadsApi.list({ stage: 'CONTACTED', source: 'CUSTOMER_REQUEST', assignedRepId: 'rep-9' })
    const url = mockedApiFetch.mock.calls[0][0] as string
    expect(url).toContain('stage=CONTACTED')
    expect(url).toContain('source=CUSTOMER_REQUEST')
    expect(url).toContain('assignedRepId=rep-9')
  })

  it('parses a fully-populated lead row', async () => {
    mockedApiFetch.mockResolvedValueOnce([LEAD_ROW])
    const [lead] = await leadsApi.list()
    expect(lead.businessName).toBe('Anchor Street Coffee')
    expect(lead.dueDate).toBe('2026-07-20T00:00:00.000Z')
    expect(lead.source).toBe('REP_VISIT')
  })

  it('throws on a drifted shape (Zod rejection): a missing required businessName', async () => {
    const { businessName: _drop, ...missing } = LEAD_ROW
    void _drop
    mockedApiFetch.mockResolvedValueOnce([missing])
    await expect(leadsApi.list()).rejects.toThrow()
  })

  it('throws on a drifted shape (Zod rejection): stage as a number instead of a string', async () => {
    mockedApiFetch.mockResolvedValueOnce([{ ...LEAD_ROW, stage: 7 }])
    await expect(leadsApi.list()).rejects.toThrow()
  })

  it('propagates ApiError with .code on a 403 (ADMIN_CAPABILITY_DENIED)', async () => {
    const err = new ApiError(403, { error: { code: 'ADMIN_CAPABILITY_DENIED', message: 'Denied' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(leadsApi.list()).rejects.toMatchObject({ code: 'ADMIN_CAPABILITY_DENIED' })
  })
})

describe('leadsApi.create', () => {
  it('POST /api/v1/admin/leads with the lead body, auth:true; returns lead + duplicateWarning', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      lead: LEAD_ROW,
      duplicateWarning: {
        count: 1,
        sample: [{ id: 'lead-dup', businessName: 'Anchor Street Coffee', locationHint: 'Bristol BS1' }],
      },
    })
    const result = await leadsApi.create({ businessName: 'Anchor Street Coffee', source: 'REP_VISIT' })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/leads', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ businessName: 'Anchor Street Coffee', source: 'REP_VISIT' }),
    })
    expect(result.duplicateWarning?.sample[0].businessName).toBe('Anchor Street Coffee')
  })

  it('accepts a null duplicateWarning', async () => {
    mockedApiFetch.mockResolvedValueOnce({ lead: LEAD_ROW, duplicateWarning: null })
    const result = await leadsApi.create({ businessName: 'Anchor Street Coffee' })
    expect(result.duplicateWarning).toBeNull()
  })
})

describe('leadsApi.update', () => {
  it('PATCH /api/v1/admin/leads/:leadId with the body, auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...LEAD_ROW, stage: 'CONTACTED' })
    const result = await leadsApi.update('lead-anchor', { stage: 'CONTACTED' })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/leads/lead-anchor', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ stage: 'CONTACTED' }),
    })
    expect(result.stage).toBe('CONTACTED')
  })

  it('sends a LOST move with lostReason', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...LEAD_ROW, stage: 'LOST', lostReason: 'No budget this quarter' })
    await leadsApi.update('lead-anchor', { stage: 'LOST', lostReason: 'No budget this quarter' })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/leads/lead-anchor', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ stage: 'LOST', lostReason: 'No budget this quarter' }),
    })
  })

  it('propagates ApiError with .code on a 400 (LEAD_LOST_REASON_REQUIRED)', async () => {
    const err = new ApiError(400, { error: { code: 'LEAD_LOST_REASON_REQUIRED', message: 'Reason required' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(leadsApi.update('lead-anchor', { stage: 'LOST' })).rejects.toMatchObject({
      code: 'LEAD_LOST_REASON_REQUIRED',
    })
  })
})

describe('leadsApi.convert', () => {
  it('POST /api/v1/admin/leads/:leadId/convert with owner fields, auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      draft: { merchantId: 'm-new', ownerAdminId: 'admin-1', ownerEmail: 'owner@anchor.example', passwordSetupRequired: true },
      leadId: 'lead-anchor',
      merchantId: 'm-new',
    })
    const result = await leadsApi.convert('lead-anchor', {
      ownerEmail: 'owner@anchor.example',
      ownerFirstName: 'Marta',
      ownerLastName: 'Vane',
    })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/leads/lead-anchor/convert', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ ownerEmail: 'owner@anchor.example', ownerFirstName: 'Marta', ownerLastName: 'Vane' }),
    })
    expect(result.merchantId).toBe('m-new')
  })

  it('propagates ApiError with .code on a 409 (LEAD_ALREADY_CONVERTED)', async () => {
    const err = new ApiError(409, { error: { code: 'LEAD_ALREADY_CONVERTED', message: 'Already converted' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(
      leadsApi.convert('lead-anchor', { ownerEmail: 'o@e.com', ownerFirstName: 'A', ownerLastName: 'B' })
    ).rejects.toMatchObject({ code: 'LEAD_ALREADY_CONVERTED' })
  })
})
