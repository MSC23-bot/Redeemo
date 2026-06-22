/**
 * approvals.ts — typed client for GET /admin/approvals.
 *
 * apiFetch is mocked to verify URL, method, auth option, and Zod parsing.
 */
import { approvalsApi } from '../approvals'
import { apiFetch } from '../client'

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MERCHANT = {
  id: 'merchant-1',
  businessName: 'Acme Coffee',
  status: 'PENDING_APPROVAL',
  onboardingStep: 'SUBMIT_FOR_REVIEW',
  verificationStatus: 'PENDING',
  contractStatus: 'SIGNED',
}

const APPROVAL = {
  id: 'approval-1',
  type: 'MERCHANT_ONBOARDING',
  referenceId: 'merchant-1',
  referenceType: 'MERCHANT',
  status: 'PENDING',
  adminUserId: null,
  comment: null,
  submittedAt: '2026-06-12T10:00:00.000Z',
  actionedAt: null,
  claimedById: null,
  claimedAt: null,
  claimedBy: null,
  merchant: MERCHANT,
}

const LIST_RESPONSE = {
  page: 1,
  pageSize: 100,
  total: 1,
  approvals: [APPROVAL],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('approvalsApi.list', () => {
  it('calls the correct URL with auth: true and no params', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST_RESPONSE)

    const result = await approvalsApi.list()

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/approvals', { auth: true })
    expect(result.approvals).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('appends status and pageSize when provided', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...LIST_RESPONSE, approvals: [] })

    await approvalsApi.list({ status: 'PENDING', pageSize: 100 })

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals?status=PENDING&pageSize=100',
      { auth: true }
    )
  })

  it('appends status=CHANGES_REQUESTED when provided', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...LIST_RESPONSE, approvals: [] })

    await approvalsApi.list({ status: 'CHANGES_REQUESTED', pageSize: 100 })

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals?status=CHANGES_REQUESTED&pageSize=100',
      { auth: true }
    )
  })

  it('omits params that are undefined', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST_RESPONSE)

    await approvalsApi.list({ page: 1 })

    const url = (mockedApiFetch.mock.calls[0][0] as string)
    expect(url).toContain('page=1')
    expect(url).not.toContain('status=')
    expect(url).not.toContain('claimedById=')
  })

  it('appends all provided optional params', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST_RESPONSE)

    await approvalsApi.list({
      type: 'MERCHANT_ONBOARDING',
      status: 'PENDING',
      claimedById: 'admin-42',
      olderThanMinutes: 60,
      page: 2,
      pageSize: 50,
    })

    const url = (mockedApiFetch.mock.calls[0][0] as string)
    expect(url).toContain('type=MERCHANT_ONBOARDING')
    expect(url).toContain('status=PENDING')
    expect(url).toContain('claimedById=admin-42')
    expect(url).toContain('olderThanMinutes=60')
    expect(url).toContain('page=2')
    expect(url).toContain('pageSize=50')
  })

  it('parses a realistic payload including a row with merchant: null', async () => {
    const withNullMerchant = {
      ...APPROVAL,
      id: 'approval-2',
      type: 'VOUCHER',
      merchant: null,
    }
    mockedApiFetch.mockResolvedValueOnce({
      ...LIST_RESPONSE,
      total: 2,
      approvals: [APPROVAL, withNullMerchant],
    })

    const result = await approvalsApi.list()

    expect(result.approvals).toHaveLength(2)
    expect(result.approvals[1].merchant).toBeNull()
  })

  it('parses a Day-2 VOUCHER row enriched with a voucher summary + goLiveHint', async () => {
    const voucherRow = {
      ...APPROVAL,
      id: 'approval-v1',
      type: 'VOUCHER',
      referenceId: 'voucher-1',
      referenceType: 'voucher',
      // VOUCHER-row merchant carries only { id, businessName, status }.
      merchant: { id: 'merchant-1', businessName: 'Acme Coffee', status: 'ACTIVE' },
      voucher: { title: '20% off all mains', type: 'DISCOUNT', status: 'PENDING_APPROVAL', approvalStatus: 'PENDING' },
      goLiveHint: 'live-now',
    }
    mockedApiFetch.mockResolvedValueOnce({ ...LIST_RESPONSE, approvals: [voucherRow] })

    const result = await approvalsApi.list()

    expect(result.approvals[0].voucher?.title).toBe('20% off all mains')
    expect(result.approvals[0].goLiveHint).toBe('live-now')
    expect(result.approvals[0].merchant?.businessName).toBe('Acme Coffee')
    // The onboarding-only merchant fields are absent on a VOUCHER row.
    expect(result.approvals[0].merchant?.verificationStatus).toBeUndefined()
  })

  it('parses a VOUCHER row whose voucher could not be loaded (voucher:null, goLiveHint:null)', async () => {
    const voucherRow = {
      ...APPROVAL,
      id: 'approval-v2',
      type: 'VOUCHER',
      referenceId: 'voucher-x',
      referenceType: 'voucher',
      merchant: null,
      voucher: null,
      goLiveHint: null,
    }
    mockedApiFetch.mockResolvedValueOnce({ ...LIST_RESPONSE, approvals: [voucherRow] })

    const result = await approvalsApi.list()

    expect(result.approvals[0].voucher).toBeNull()
    expect(result.approvals[0].goLiveHint).toBeNull()
  })

  it('still parses a MERCHANT_ONBOARDING row carrying the full merchant summary', async () => {
    mockedApiFetch.mockResolvedValueOnce(LIST_RESPONSE)
    const result = await approvalsApi.list()
    expect(result.approvals[0].merchant?.verificationStatus).toBe('PENDING')
    expect(result.approvals[0].merchant?.onboardingStep).toBe('SUBMIT_FOR_REVIEW')
    // No voucher enrichment on an onboarding row.
    expect(result.approvals[0].voucher).toBeUndefined()
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })

    await expect(approvalsApi.list()).rejects.toThrow()
  })

  it('throws when an approval row has an unknown type (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...LIST_RESPONSE,
      approvals: [{ ...APPROVAL, type: 'UNKNOWN_TYPE' }],
    })

    await expect(approvalsApi.list()).rejects.toThrow()
  })
})
