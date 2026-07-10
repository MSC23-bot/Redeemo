/**
 * staff.ts: typed client for the admin staff roster read (Merchant 360 A4).
 *
 * apiFetch is mocked to verify URL, auth option, and Zod parsing. The mirror is
 * curated: no passwordHash / redemptionPin / token fields exist on the schema.
 */
import { adminStaffApi, adminStaffResponseSchema } from '../staff'
import { apiFetch } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => jest.clearAllMocks())

const ROSTER = {
  members: [
    {
      id: 'mm-1',
      name: 'Marta Okafor',
      email: 'marta@acme.test',
      role: 'OWNER',
      status: 'ACTIVE',
      allBranches: true,
      canManageVouchers: false,
      emailVerified: true,
      branchScopes: [],
      appAccess: false,
    },
  ],
  appLogins: [
    {
      id: 'bu-1',
      name: 'Sam Lee',
      email: 'sam@acme.test',
      status: 'ACTIVE',
      branch: { id: 'b-1', name: 'High Street' },
      appAccess: true,
    },
  ],
}

describe('adminStaffApi.list', () => {
  it('GET /admin/merchants/:id/staff with auth:true and parses the roster', async () => {
    mockedApiFetch.mockResolvedValueOnce(ROSTER)
    const result = await adminStaffApi.list('m-1')
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/merchants/m-1/staff', { auth: true })
    expect(result.members[0].role).toBe('OWNER')
    expect(result.appLogins[0].branch.name).toBe('High Street')
  })

  it('tolerates an unknown role / status string (drift resilience)', () => {
    const drifted = {
      members: [{ ...ROSTER.members[0], role: 'REGIONAL_LEAD', status: 'PROBATION' }],
      appLogins: [],
    }
    const parsed = adminStaffResponseSchema.parse(drifted)
    expect(parsed.members[0].role).toBe('REGIONAL_LEAD')
    expect(parsed.members[0].status).toBe('PROBATION')
  })

  it('throws when the response shape drifts (Zod)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ members: [{ id: 'x' }], appLogins: [] })
    await expect(adminStaffApi.list('m-1')).rejects.toThrow()
  })
})
