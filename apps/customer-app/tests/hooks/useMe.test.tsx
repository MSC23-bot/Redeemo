import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { profileApi } from '@/lib/api/profile'
import { useMe } from '@/hooks/useMe'

jest.spyOn(profileApi, 'getMe')

describe('useMe', () => {
  it('fetches profile via profileApi.getMe', async () => {
    (profileApi.getMe as jest.Mock).mockResolvedValue({ id: 'u1', email: 'a@x.com' } as any)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data?.id).toBe('u1'))
  })
})
