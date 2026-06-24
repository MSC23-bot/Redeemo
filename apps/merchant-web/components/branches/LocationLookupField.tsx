'use client'

// Branches PR-6 (Layer 3): the reusable search-and-pick location lookup. The merchant
// types a business name / address; after a min-length-3 debounce the field calls the
// server-proxied Google search (POST /merchant/location/search); the candidate list
// renders name + formatted address + a "Use this address" action. On pick it calls
// onPick with { candidateToken, addressParts, formattedAddress } so the PARENT form
// autofills its OWN address fields and stores the token for submit.
//
// SECURITY / privacy (the never-expose invariant): this field NEVER renders or holds
// latitude / longitude / a map pin. The candidate DTO has no coords; the picked token
// is opaque. The only network is the search POST.
//
// Cheap abuse protection (§4e): min query length 3 + a ~400ms debounce before the
// search fires. Below the minimum the field no-ops (no request).
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, MapPin, Info } from '@/lib/icons'
import { searchLocation, type LocationCandidate } from '@/lib/api/location'
import { ApiError } from '@/lib/api/client'

const MIN_QUERY_LEN = 3
const DEBOUNCE_MS = 400

export interface LocationPick {
  candidateToken: string
  formattedAddress: string
  addressParts: LocationCandidate['addressParts']
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; candidates: LocationCandidate[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

// Map the route's client-safe error codes to calm copy. We never surface provider
// internals: a missing key / quota / transport failure all collapse to "unavailable".
function errorMessage(err: unknown): string {
  const code = err instanceof ApiError ? err.code : undefined
  if (code === 'LOCATION_SEARCH_RATE_LIMITED') {
    return 'Too many searches just now. Wait a moment, then try again.'
  }
  // LOCATION_SEARCH_UNAVAILABLE + anything unexpected.
  return 'Address search is unavailable right now. You can enter the address by hand below.'
}

export function LocationLookupField({
  id = 'location-lookup',
  label = 'Find your business or address',
  onPick,
}: {
  id?: string
  label?: string
  onPick: (pick: LocationPick) => void
}) {
  const [query, setQuery] = React.useState('')
  const [state, setState] = React.useState<SearchState>({ kind: 'idle' })

  // A run id guards against an out-of-order resolve: only the latest search may set
  // state. Bumped on every new debounced fire (and on clear).
  const runIdRef = React.useRef(0)

  React.useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      // Below the minimum: no request, no results. (Empty input resets to idle.)
      runIdRef.current += 1
      setState({ kind: 'idle' })
      return
    }

    const runId = ++runIdRef.current
    const timer = setTimeout(async () => {
      setState({ kind: 'loading' })
      try {
        const candidates = await searchLocation(trimmed)
        if (runIdRef.current !== runId) return
        setState(
          candidates.length > 0 ? { kind: 'results', candidates } : { kind: 'empty' },
        )
      } catch (err) {
        if (runIdRef.current !== runId) return
        const code = err instanceof ApiError ? err.code : undefined
        if (code === 'LOCATION_SEARCH_NO_RESULTS') {
          setState({ kind: 'empty' })
          return
        }
        setState({ kind: 'error', message: errorMessage(err) })
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  function handlePick(c: LocationCandidate) {
    onPick({
      candidateToken: c.candidateToken,
      formattedAddress: c.formattedAddress,
      addressParts: c.addressParts,
    })
    // Collapse the result list after a pick; keep the typed query visible.
    runIdRef.current += 1
    setState({ kind: 'idle' })
  }

  const listboxId = `${id}-results`

  return (
    <div className="space-y-2" data-testid="location-lookup">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
        />
        <Input
          id={id}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Old Foundry Kitchen, Huddersfield"
          autoComplete="off"
          className="pl-9"
          role="combobox"
          aria-expanded={state.kind === 'results'}
          aria-controls={listboxId}
          aria-describedby={`${id}-hint`}
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Search by business name or address, then pick a result to fill in the address below. You can
        edit it before saving.
      </p>

      {/* Loading */}
      {state.kind === 'loading' ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="location-lookup-loading"
          className="px-1 py-2 text-sm text-muted-foreground"
        >
          Searching...
        </p>
      ) : null}

      {/* Empty (no matches) */}
      {state.kind === 'empty' ? (
        <p
          role="status"
          data-testid="location-lookup-empty"
          className="flex items-start gap-2 rounded-[10px] px-3 py-2 text-sm text-muted-foreground"
          style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
        >
          <Info size={15} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
          No matches found. Check the spelling, or enter the address by hand below.
        </p>
      ) : null}

      {/* Error (calm; never leaks provider internals) */}
      {state.kind === 'error' ? (
        <p
          role="alert"
          data-testid="location-lookup-error"
          className="rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {state.message}
        </p>
      ) : null}

      {/* Results */}
      {state.kind === 'results' ? (
        <ul
          id={listboxId}
          data-testid="location-lookup-results"
          className="divide-y overflow-hidden rounded-[12px] border"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {state.candidates.map((c) => (
            <li key={c.candidateToken} className="bg-card">
              <button
                type="button"
                data-testid="location-lookup-result"
                onClick={() => handlePick(c)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--tint)]"
              >
                <MapPin
                  size={16}
                  aria-hidden
                  className="mt-0.5 shrink-0"
                  style={{ color: 'var(--rose)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.formattedAddress}
                  </span>
                </span>
                <span className="shrink-0 self-center text-xs font-semibold" style={{ color: 'var(--rose)' }}>
                  Use this address
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
