/**
 * LastUpdated — "Last updated HH:MM:SS" freshness indicator.
 *
 * Renders the time the queue data was last fetched from the server.
 * Receives `dataUpdatedAt` in ms (from React Query's `query.dataUpdatedAt`).
 */

interface LastUpdatedProps {
  dataUpdatedAt: number
}

function formatTime(ms: number): string {
  if (ms === 0) return '--:--:--'
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function LastUpdated({ dataUpdatedAt }: LastUpdatedProps) {
  return (
    <span className="text-xs text-muted-foreground">
      Last updated {formatTime(dataUpdatedAt)}
    </span>
  )
}
