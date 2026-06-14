/**
 * RefreshButton — manual refresh trigger for the queue.
 *
 * Shows a spinning RefreshCw icon while a fetch is in progress.
 * Disabled during the fetch to prevent double-triggers.
 */
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface RefreshButtonProps {
  onRefresh: () => void
  isFetching?: boolean
}

export function RefreshButton({ onRefresh, isFetching = false }: RefreshButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={isFetching}
      aria-label="Refresh queue"
    >
      <RefreshCw
        className={cn('size-4', isFetching && 'animate-spin')}
        aria-hidden="true"
      />
      Refresh
    </Button>
  )
}
