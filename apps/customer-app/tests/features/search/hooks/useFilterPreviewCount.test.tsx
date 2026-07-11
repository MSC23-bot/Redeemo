import { renderHook, act } from '@testing-library/react-native'
import { useFilterPreviewCount } from '@/features/search/hooks/useFilterPreviewCount'
import { EMPTY_FILTERS, type FilterState } from '@/features/search/components/FilterSheet'

const mockUseSearch = jest.fn()

jest.mock('@/hooks/useSearch', () => ({
  useSearch: (...args: unknown[]) => mockUseSearch(...args),
}))

describe('useFilterPreviewCount', () => {
  beforeEach(() => {
    mockUseSearch.mockReset()
    mockUseSearch.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('is disabled (no useSearch fetch) when the sheet is not active, even with a queryable context', () => {
    jest.useFakeTimers()
    try {
      renderHook(() => useFilterPreviewCount(false, { q: 'pizza' }, EMPTY_FILTERS))
      act(() => { jest.advanceTimersByTime(1000) })
      const lastCall = mockUseSearch.mock.calls[mockUseSearch.mock.calls.length - 1]!
      expect(lastCall[1]).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('is disabled when active but there is no queryable context (no q / categoryId / bbox)', () => {
    jest.useFakeTimers()
    try {
      renderHook(() => useFilterPreviewCount(true, {}, EMPTY_FILTERS))
      act(() => { jest.advanceTimersByTime(1000) })
      const lastCall = mockUseSearch.mock.calls[mockUseSearch.mock.calls.length - 1]!
      expect(lastCall[1]).toBe(false)
    } finally {
      jest.useRealTimers()
    }
  })

  it('enables once a base q is present, after the debounce settles', () => {
    jest.useFakeTimers()
    try {
      renderHook(() => useFilterPreviewCount(true, { q: 'pizza' }, EMPTY_FILTERS))
      act(() => { jest.advanceTimersByTime(350) })
      const lastCall = mockUseSearch.mock.calls[mockUseSearch.mock.calls.length - 1]!
      expect(lastCall[1]).toBe(true)
      expect(lastCall[0]).toEqual(expect.objectContaining({ q: 'pizza' }))
    } finally {
      jest.useRealTimers()
    }
  })

  it('enables when the DRAFT carries a categoryId even with an empty base (CategoryResultsScreen contract)', () => {
    jest.useFakeTimers()
    try {
      const draft: FilterState = { ...EMPTY_FILTERS, categoryId: 'c1' }
      renderHook(() => useFilterPreviewCount(true, {}, draft))
      act(() => { jest.advanceTimersByTime(350) })
      const lastCall = mockUseSearch.mock.calls[mockUseSearch.mock.calls.length - 1]!
      expect(lastCall[1]).toBe(true)
      expect(lastCall[0]).toEqual(expect.objectContaining({ categoryId: 'c1' }))
    } finally {
      jest.useRealTimers()
    }
  })

  it('enables when a full bbox is present in base params', () => {
    jest.useFakeTimers()
    try {
      renderHook(() => useFilterPreviewCount(
        true,
        { minLat: 1, maxLat: 2, minLng: 3, maxLng: 4 },
        EMPTY_FILTERS,
      ))
      act(() => { jest.advanceTimersByTime(350) })
      const lastCall = mockUseSearch.mock.calls[mockUseSearch.mock.calls.length - 1]!
      expect(lastCall[1]).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('composes draft filter fields (sortBy/voucherTypes/amenityIds/openNow) into the query params', () => {
    jest.useFakeTimers()
    try {
      const draft: FilterState = {
        categoryId: 'c1', sortBy: 'nearest', voucherTypes: ['BOGO'], amenityIds: ['a1'], openNow: true,
      }
      renderHook(() => useFilterPreviewCount(true, {}, draft))
      act(() => { jest.advanceTimersByTime(350) })
      const lastCall = mockUseSearch.mock.calls[mockUseSearch.mock.calls.length - 1]!
      expect(lastCall[0]).toEqual(expect.objectContaining({
        categoryId: 'c1', sortBy: 'nearest', voucherTypes: ['BOGO'], amenityIds: ['a1'], openNow: true,
      }))
    } finally {
      jest.useRealTimers()
    }
  })

  it('does NOT re-fire on every keystroke — debounces draft changes', () => {
    jest.useFakeTimers()
    try {
      mockUseSearch.mockClear()
      const { rerender } = renderHook(
        ({ draft }: { draft: FilterState }) => useFilterPreviewCount(true, { q: 'p' }, draft),
        { initialProps: { draft: { ...EMPTY_FILTERS, sortBy: 'nearest' } as FilterState } },
      )
      const callsAfterMount = mockUseSearch.mock.calls.length
      rerender({ draft: { ...EMPTY_FILTERS, sortBy: 'top_rated' } })
      act(() => { jest.advanceTimersByTime(100) })
      // Still within the 350ms debounce window — no NEW enabled=true call
      // reflecting 'top_rated' yet (the debounced value hasn't landed).
      const paramsSoFar = mockUseSearch.mock.calls.slice(callsAfterMount).map((c) => c[0])
      expect(paramsSoFar.every((p) => p.sortBy !== 'top_rated')).toBe(true)
      act(() => { jest.advanceTimersByTime(300) })
      const lastCall = mockUseSearch.mock.calls[mockUseSearch.mock.calls.length - 1]!
      expect(lastCall[0]).toEqual(expect.objectContaining({ sortBy: 'top_rated' }))
    } finally {
      jest.useRealTimers()
    }
  })

  it('extracts the count from totalBranches, falling back to branches.length, else null', () => {
    mockUseSearch.mockReturnValue({ data: { totalBranches: 5, branches: [1, 2] }, isLoading: false })
    const { result } = renderHook(() => useFilterPreviewCount(true, { q: 'a' }, EMPTY_FILTERS))
    expect(result.current.count).toBe(5)

    mockUseSearch.mockReturnValue({ data: { branches: [1, 2, 3] }, isLoading: false })
    const { result: result2 } = renderHook(() => useFilterPreviewCount(true, { q: 'a' }, EMPTY_FILTERS))
    expect(result2.current.count).toBe(3)

    mockUseSearch.mockReturnValue({ data: undefined, isLoading: false })
    const { result: result3 } = renderHook(() => useFilterPreviewCount(true, { q: 'a' }, EMPTY_FILTERS))
    expect(result3.current.count).toBeNull()
  })

  it('pending is true only while enabled AND loading', () => {
    mockUseSearch.mockReturnValue({ data: undefined, isLoading: true })
    const { result: enabled } = renderHook(() => useFilterPreviewCount(true, { q: 'a' }, EMPTY_FILTERS))
    expect(enabled.current.pending).toBe(true)

    const { result: disabled } = renderHook(() => useFilterPreviewCount(false, { q: 'a' }, EMPTY_FILTERS))
    expect(disabled.current.pending).toBe(false)
  })
})
