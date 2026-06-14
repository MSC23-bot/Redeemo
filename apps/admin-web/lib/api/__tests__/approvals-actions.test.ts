/**
 * approvals-actions.test.ts — the 5 new action calls in approvalsApi.
 *
 * Tests: correct URL + method + auth:true + body; success Zod-parses;
 * a thrown ApiError carries .code.
 *
 * Pattern: mock only apiFetch (not ApiError), then throw real ApiError instances
 * constructed in the test.
 */
import { approvalsApi } from '../approvals'
import { apiFetch, ApiError } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
  // Re-export ApiError so imports from other modules resolve; use the actual class.
  ApiError: class ApiError extends Error {
    status: number
    statusCode: number
    code: string | undefined
    body: unknown
    constructor(status: number, body: unknown) {
      const b = body as { error?: { code?: string; message?: string }; code?: string; message?: string } | null
      const nested = b?.error != null && typeof b.error === 'object' ? b.error as { code?: string; message?: string } : null
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

// ── claim ─────────────────────────────────────────────────────────────────────

describe('approvalsApi.claim', () => {
  it('POST /api/v1/admin/approvals/:id/claim with auth:true and no body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ claimed: true })
    const result = await approvalsApi.claim('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/approvals/apr-1/claim', {
      method: 'POST',
      auth: true,
    })
    expect(result.claimed).toBe(true)
  })

  it('Zod-parses the success response', async () => {
    mockedApiFetch.mockResolvedValueOnce({ claimed: true })
    const result = await approvalsApi.claim('apr-1')
    expect(result).toEqual({ claimed: true })
  })

  it('propagates ApiError with .code on failure', async () => {
    const err = new ApiError(409, { error: { code: 'APPROVAL_ALREADY_CLAIMED', message: 'Already claimed' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(approvalsApi.claim('apr-1')).rejects.toMatchObject({
      code: 'APPROVAL_ALREADY_CLAIMED',
    })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(approvalsApi.claim('apr-1')).rejects.toThrow()
  })
})

// ── release ───────────────────────────────────────────────────────────────────

describe('approvalsApi.release', () => {
  it('POST /api/v1/admin/approvals/:id/release with auth:true and no body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ released: true })
    const result = await approvalsApi.release('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/approvals/apr-1/release', {
      method: 'POST',
      auth: true,
    })
    expect(result.released).toBe(true)
  })

  it('propagates ApiError with .code on failure', async () => {
    const err = new ApiError(403, { error: { code: 'APPROVAL_NOT_CLAIMER', message: 'Not claimer' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(approvalsApi.release('apr-1')).rejects.toMatchObject({
      code: 'APPROVAL_NOT_CLAIMER',
    })
  })
})

// ── requestChanges ────────────────────────────────────────────────────────────

describe('approvalsApi.requestChanges', () => {
  it('POST /api/v1/admin/approvals/:id/request-changes with auth:true and body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ changesRequested: true })
    const result = await approvalsApi.requestChanges('apr-1', 'Please update your docs.')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/request-changes',
      {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ reason: 'Please update your docs.' }),
      }
    )
    expect(result.changesRequested).toBe(true)
  })

  it('propagates ApiError on failure', async () => {
    const err = new ApiError(422, { error: { code: 'APPROVAL_NOT_ACTIONABLE', message: 'Not actionable' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(approvalsApi.requestChanges('apr-1', 'reason')).rejects.toMatchObject({
      code: 'APPROVAL_NOT_ACTIONABLE',
    })
  })
})

// ── reject ────────────────────────────────────────────────────────────────────

describe('approvalsApi.reject', () => {
  it('POST /api/v1/admin/approvals/:id/reject with auth:true and body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ rejected: true })
    const result = await approvalsApi.reject('apr-1', 'Duplicate account.')
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/api/v1/admin/approvals/apr-1/reject',
      {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ reason: 'Duplicate account.' }),
      }
    )
    expect(result.rejected).toBe(true)
  })

  it('propagates ApiError on failure', async () => {
    const err = new ApiError(404, { error: { code: 'APPROVAL_NOT_FOUND', message: 'Not found' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(approvalsApi.reject('apr-1', 'reason')).rejects.toMatchObject({
      code: 'APPROVAL_NOT_FOUND',
    })
  })
})

// ── approve ───────────────────────────────────────────────────────────────────

describe('approvalsApi.approve', () => {
  it('POST /api/v1/admin/approvals/:id/approve with auth:true and no body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ approved: true, alreadyLive: false })
    const result = await approvalsApi.approve('apr-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/approvals/apr-1/approve', {
      method: 'POST',
      auth: true,
    })
    expect(result.approved).toBe(true)
  })

  it('parses optional alreadyLive field', async () => {
    mockedApiFetch.mockResolvedValueOnce({ approved: true })
    const result = await approvalsApi.approve('apr-1')
    expect(result.approved).toBe(true)
    expect(result.alreadyLive).toBeUndefined()
  })

  it('propagates ApiError with .code on gate failure', async () => {
    const err = new ApiError(422, {
      error: {
        code: 'ONBOARDING_GATES_INCOMPLETE',
        message: 'Gates incomplete',
        checklist: { branch_created: true, contract_signed: false, rmv_configured: false },
      },
    })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(approvalsApi.approve('apr-1')).rejects.toMatchObject({
      code: 'ONBOARDING_GATES_INCOMPLETE',
    })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ bad: 'shape' })
    await expect(approvalsApi.approve('apr-1')).rejects.toThrow()
  })
})
