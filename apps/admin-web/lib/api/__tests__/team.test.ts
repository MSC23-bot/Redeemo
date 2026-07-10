/**
 * team.ts: typed client for the Team & Roles admin surface (S1 routes + the
 * S2 roster read).
 *
 * apiFetch is mocked to verify URL, method, body, auth option, and Zod
 * parsing. Mirrors lib/api/__tests__/redemptions.test.ts's style.
 */
import { teamApi, ASSIGNABLE_ROLES } from '../team'
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

const ADMIN_ROW = {
  id: 'a1',
  email: 'rep@redeemo.com',
  name: 'Rep One',
  role: 'FIELD',
  isActive: true,
  createdAt: '2026-07-01T00:00:00.000Z',
  activeGrants: ['approval:action'],
}

describe('ASSIGNABLE_ROLES', () => {
  it('is exactly the 5 non-SUPER_ADMIN roles, including FIELD', () => {
    expect([...ASSIGNABLE_ROLES]).toEqual(['OPERATIONS', 'FINANCE', 'CONTENT', 'SUPPORT', 'FIELD'])
  })
})

describe('teamApi.list', () => {
  it('GET /api/v1/admin/team with auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ admins: [ADMIN_ROW] })
    const result = await teamApi.list()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/team', { auth: true })
    expect(result.admins).toEqual([ADMIN_ROW])
  })

  it('propagates ApiError with .code on a 403 (ADMIN_CAPABILITY_DENIED)', async () => {
    const err = new ApiError(403, { error: { code: 'ADMIN_CAPABILITY_DENIED', message: 'Denied' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(teamApi.list()).rejects.toMatchObject({ code: 'ADMIN_CAPABILITY_DENIED' })
  })

  it('throws on a malformed response (Zod validation) — e.g. a leaked passwordHash-shaped row', async () => {
    mockedApiFetch.mockResolvedValueOnce({ admins: [{ ...ADMIN_ROW, isActive: 'not-a-boolean' }] })
    await expect(teamApi.list()).rejects.toThrow()
  })
})

describe('teamApi.create', () => {
  it('POST /api/v1/admin/team with the account fields, auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'new-1', email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'FIELD', isActive: true, createdAt: '2026-07-01T00:00:00.000Z',
    })
    const result = await teamApi.create({ email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'FIELD' })
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/team', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'FIELD' }),
    })
    expect(result.role).toBe('FIELD')
  })

  it('propagates ApiError with .code on a 409 (EMAIL_ALREADY_EXISTS)', async () => {
    const err = new ApiError(409, { error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Exists' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(teamApi.create({ email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'FIELD' })).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS',
    })
  })
})

describe('teamApi.setRole', () => {
  it('PATCH /api/v1/admin/team/:adminId/role with { role }, auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'a1', email: 'a@b.com', role: 'OPERATIONS', isActive: true })
    const result = await teamApi.setRole('a1', 'OPERATIONS')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/team/a1/role', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ role: 'OPERATIONS' }),
    })
    expect(result.role).toBe('OPERATIONS')
  })
})

describe('teamApi.deactivate', () => {
  it('POST /api/v1/admin/team/:adminId/deactivate, auth:true, no body', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'a1', email: 'a@b.com', role: 'FIELD', isActive: false })
    const result = await teamApi.deactivate('a1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/team/a1/deactivate', { method: 'POST', auth: true })
    expect(result.isActive).toBe(false)
  })

  it('propagates ApiError with .code on a 400 (ADMIN_SELF_ACTION_FORBIDDEN)', async () => {
    const err = new ApiError(400, { error: { code: 'ADMIN_SELF_ACTION_FORBIDDEN', message: 'No.' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(teamApi.deactivate('self-1')).rejects.toMatchObject({ code: 'ADMIN_SELF_ACTION_FORBIDDEN' })
  })

  it('propagates ApiError with .code on a 404 (ADMIN_NOT_FOUND)', async () => {
    const err = new ApiError(404, { error: { code: 'ADMIN_NOT_FOUND', message: 'Not found.' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(teamApi.deactivate('ghost')).rejects.toMatchObject({ code: 'ADMIN_NOT_FOUND' })
  })
})

describe('teamApi.grant', () => {
  it('POST /api/v1/admin/team/:adminId/grants with { capability }, auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 'g1', capability: 'approval:action', grantedAt: '2026-07-01T00:00:00.000Z', alreadyGranted: false })
    const result = await teamApi.grant('a1', 'approval:action')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/team/a1/grants', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ capability: 'approval:action' }),
    })
    expect(result.alreadyGranted).toBe(false)
  })

  it('propagates ApiError with .code on a 400 (CAPABILITY_NOT_GRANTABLE)', async () => {
    const err = new ApiError(400, { error: { code: 'CAPABILITY_NOT_GRANTABLE', message: 'No.' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(teamApi.grant('a1', 'admin:manage-team')).rejects.toMatchObject({ code: 'CAPABILITY_NOT_GRANTABLE' })
  })
})

describe('teamApi.revoke', () => {
  it('POST /api/v1/admin/team/:adminId/revoke with { capability }, auth:true', async () => {
    mockedApiFetch.mockResolvedValueOnce({ capability: 'approval:action', revokedCount: 1 })
    const result = await teamApi.revoke('a1', 'approval:action')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/team/a1/revoke', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ capability: 'approval:action' }),
    })
    expect(result.revokedCount).toBe(1)
  })

  it('propagates ApiError with .code on a 404 (GRANT_NOT_FOUND)', async () => {
    const err = new ApiError(404, { error: { code: 'GRANT_NOT_FOUND', message: 'Not found.' } })
    mockedApiFetch.mockRejectedValueOnce(err)
    await expect(teamApi.revoke('a1', 'approval:action')).rejects.toMatchObject({ code: 'GRANT_NOT_FOUND' })
  })
})
