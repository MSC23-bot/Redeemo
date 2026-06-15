/**
 * useAdminCategories (B2.3) - fetches via adminCategoriesApi.list, honours the
 * `enabled` gate, and exposes the categories array.
 */
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAdminCategories } from '../useAdminCategories'
import { adminCategoriesApi } from '@/lib/api/categories'

jest.mock('@/lib/api/categories', () => ({
  adminCategoriesApi: {
    list: jest.fn(),
  },
}))

const CATS = {
  categories: [
    { id: 'c1', name: 'Food', parentId: null, eligible: true },
    { id: 'c2', name: 'Empty', parentId: null, eligible: false },
  ],
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return Wrapper
}

afterEach(() => jest.clearAllMocks())

describe('useAdminCategories', () => {
  it('fetches and exposes categories when enabled', async () => {
    ;(adminCategoriesApi.list as jest.Mock).mockResolvedValueOnce(CATS)
    const { result } = renderHook(() => useAdminCategories(true), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.categories).toHaveLength(2))
    expect(adminCategoriesApi.list).toHaveBeenCalled()
    expect(result.current.categories[0].eligible).toBe(true)
  })

  it('does NOT fetch when disabled and returns an empty array', async () => {
    const { result } = renderHook(() => useAdminCategories(false), { wrapper: makeWrapper() })
    await new Promise((r) => setTimeout(r, 0))
    expect(adminCategoriesApi.list).not.toHaveBeenCalled()
    expect(result.current.categories).toEqual([])
  })

  it('surfaces isError when the fetch rejects', async () => {
    ;(adminCategoriesApi.list as jest.Mock).mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAdminCategories(true), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
