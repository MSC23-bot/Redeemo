import { useQuery } from '@tanstack/react-query'
import { discoveryApi } from '@/lib/api/discovery'

export const eligibleAmenitiesQueryKey = (categoryId: string) =>
  ['discovery', 'eligible-amenities', categoryId] as const

/**
 * Loads eligible amenities for a category. FilterSheet uses this to hide the
 * amenity section when no category is selected (decision #3 in the rebaseline
 * plan); pass `categoryId = null` to disable the query.
 */
export function useEligibleAmenities(categoryId: string | null | undefined) {
  return useQuery({
    queryKey: eligibleAmenitiesQueryKey(categoryId ?? ''),
    queryFn:  () => discoveryApi.getEligibleAmenities(categoryId as string),
    enabled:  Boolean(categoryId),
    staleTime: 5 * 60 * 1000,    // 5 min — eligibility is seed-locked
  })
}
