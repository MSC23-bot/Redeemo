import { useQuery } from '@tanstack/react-query'
import { discoveryApi, SearchResponse } from '@/lib/api/discovery'

type BoundingBox = { minLat: number; maxLat: number; minLng: number; maxLng: number }

export function useMapMerchants(bbox: BoundingBox | null, categoryId?: string | null) {
  return useQuery<SearchResponse>({
    queryKey: ['mapMerchants', bbox, categoryId],
    queryFn: () =>
      discoveryApi.searchMerchants({
        minLat: bbox!.minLat,
        maxLat: bbox!.maxLat,
        minLng: bbox!.minLng,
        maxLng: bbox!.maxLng,
        ...(categoryId ? { categoryId } : {}),
        limit: 50,
      }),
    enabled: bbox !== null,
    staleTime: 30 * 1000,
  })
}
