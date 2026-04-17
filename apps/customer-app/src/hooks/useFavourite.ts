import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Params = {
  type: 'voucher' | 'merchant'
  id: string
  isFavourited: boolean
}

export function useFavourite({ type, id, isFavourited: initial }: Params) {
  const [isFavourited, setIsFavourited] = useState(initial)
  const queryClient = useQueryClient()

  useEffect(() => {
    setIsFavourited(initial)
  }, [initial])

  const addMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/customer/favourites/${type}s/${id}`, undefined),
    onSuccess: () => {
      setIsFavourited(true)
      queryClient.invalidateQueries({ queryKey: [`favourite${type === 'voucher' ? 'Vouchers' : 'Merchants'}`] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => api.del(`/api/v1/customer/favourites/${type}s/${id}`),
    onSuccess: () => {
      setIsFavourited(false)
      queryClient.invalidateQueries({ queryKey: [`favourite${type === 'voucher' ? 'Vouchers' : 'Merchants'}`] })
    },
  })

  const toggle = useCallback(async () => {
    if (isFavourited) {
      await removeMutation.mutateAsync()
    } else {
      await addMutation.mutateAsync()
    }
  }, [isFavourited, addMutation, removeMutation])

  return { isFavourited, toggle, isLoading: addMutation.isPending || removeMutation.isPending }
}
