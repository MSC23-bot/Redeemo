import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { favouritesApi } from '@/lib/api/favourites'
import { useToast } from '@/design-system/motion/Toast'
import { lightHaptic } from '@/design-system/haptics'

type RemoveType = 'merchant' | 'voucher'

export function useRemoveFavourite(type: RemoveType) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const undoCalledRef = useRef(false)

  const remove = useCallback(async (id: string) => {
    const queryKey = type === 'merchant' ? ['favouriteMerchants'] : ['favouriteVouchers']
    undoCalledRef.current = false

    const previous = queryClient.getQueryData(queryKey)

    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          items: page.items.filter((item: any) => item.id !== id),
          total: Math.max(0, page.total - 1),
        })),
      }
    })

    lightHaptic()

    const apiCall = type === 'merchant'
      ? favouritesApi.removeMerchant(id)
      : favouritesApi.removeVoucher(id)

    show(`Removed from favourites`, 'neutral')

    const undo = async () => {
      undoCalledRef.current = true
      try {
        if (type === 'merchant') {
          await favouritesApi.addMerchant(id)
        } else {
          await favouritesApi.addVoucher(id)
        }
        queryClient.invalidateQueries({ queryKey })
      } catch {
        show("Couldn't undo — please try again", 'danger')
      }
    }

    try {
      await apiCall
    } catch {
      if (!undoCalledRef.current) {
        queryClient.setQueryData(queryKey, previous)
        show("Couldn't remove — try again", 'danger')
      }
    }

    return { undo }
  }, [type, queryClient, show])

  return { remove }
}
