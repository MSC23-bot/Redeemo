/**
 * categories.ts (B2.3) - typed client for GET /api/v1/admin/categories.
 *
 * apiFetch is mocked to verify URL, auth option, and Zod parsing.
 */
import { adminCategoriesApi } from '../categories'
import { apiFetch } from '../client'

jest.mock('../client', () => ({
  apiFetch: jest.fn(),
}))

const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>

afterEach(() => {
  jest.clearAllMocks()
})

describe('adminCategoriesApi.list', () => {
  it('GET /api/v1/admin/categories with auth:true and Zod-parses', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      categories: [
        { id: 'c1', name: 'Food', parentId: null, eligible: true },
        { id: 'c2', name: 'Empty', parentId: null, eligible: false },
      ],
    })
    const result = await adminCategoriesApi.list()
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/v1/admin/categories', { auth: true })
    expect(result.categories).toHaveLength(2)
    expect(result.categories[0]).toEqual({ id: 'c1', name: 'Food', parentId: null, eligible: true })
  })

  it('throws on a malformed response (Zod validation)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ categories: [{ id: 'c1' }] })
    await expect(adminCategoriesApi.list()).rejects.toThrow()
  })
})
