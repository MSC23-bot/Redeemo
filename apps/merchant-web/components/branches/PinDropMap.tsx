'use client'

// Branch Location Trust Slice 3 (pin-drop addendum, plan PR-2 Task 10/11): the
// draggable-pin static map. Renders the backend-proxied Google Static Maps
// image (GET .../:id/map-preview, same-origin bytes via apiFetchRaw -> a
// blob: URL, so there is ZERO CSP change - no external tile/script host, the
// Google key stays server-side) with a shaded 1km-radius disc overlay and a
// draggable HTML pin, then submits the dropped pin via POST .../:id/pin-drop.
//
// The disc + pin are drawn in an SVG whose viewBox is the SAME 640x400 space
// the backend renders the image at (STATIC_MAP_WIDTH_PX/_HEIGHT_PX), and the
// container is CSS-locked to that aspect ratio, so the projection stays
// isotropic (a true circle on screen) with no ResizeObserver / pixel
// measurement needed. Pixel<->lat/lng conversion is the pure
// lib/branches/pinDropMercator module; the disc is a VISUAL aid only - the
// server is the sole authority on the radius admission (dropBranchPin
// independently re-resolves the postcode centroid and re-runs its own
// haversine check on whatever this component submits).
//
// The raw lat/lng are NEVER rendered as numbers (matches LocationCard's
// existing "You did not enter coordinates" stance). Copy locked per the
// addendum §5.3 / §9.2 D-L7: a PASS is "Merchant-set pin", never "verified".
//
// House style: brand tokens, no em-dashes, SVG icons not emojis.
import * as React from 'react'
import { MapPin, Info, CheckCircle2, AlertTriangle } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { useDropBranchPin } from '@/lib/branches/useBranches'
import { fetchBranchMapPreview } from '@/lib/api/branch'
import { ApiError } from '@/lib/api/client'
import type { Branch } from '@/lib/api/branch'
import {
  STATIC_MAP_WIDTH_PX,
  STATIC_MAP_HEIGHT_PX,
  LOCATION_TRUST_RADIUS_METRES,
  pixelToLatLng,
  latLngToPixel,
  clampToRadius,
  radiusMetresToPixels,
  type LatLng,
  type PixelPoint,
} from '@/lib/branches/pinDropMercator'

const CENTER_PIXEL: PixelPoint = { x: STATIC_MAP_WIDTH_PX / 2, y: STATIC_MAP_HEIGHT_PX / 2 }

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'ready'; src: string }
  | { kind: 'unavailable' } // MAP_PREVIEW_NOT_ENABLED (dark / usage-capped)
  | { kind: 'error' } // network / postcode / anything else

type SubmitError =
  | { kind: 'rate_limited' }
  | { kind: 'already_confirmed' }
  | { kind: 'generic' }

type Outcome = { kind: 'pass'; branch: Branch } | { kind: 'needs_review'; branch: Branch }

export function PinDropMap({
  branch,
  onDone,
  onCancel,
}: {
  branch: Branch
  onDone: (branch: Branch) => void
  onCancel: () => void
}) {
  const centerLat = branch.latitude ?? null
  const centerLng = branch.longitude ?? null
  const hasCenter = centerLat != null && centerLng != null

  const [preview, setPreview] = React.useState<PreviewState>({ kind: 'loading' })
  const [pinPixel, setPinPixel] = React.useState<PixelPoint>(CENTER_PIXEL)
  const [submitError, setSubmitError] = React.useState<SubmitError | null>(null)
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const draggingRef = React.useRef(false)
  const dropPin = useDropBranchPin()

  const params = hasCenter
    ? { centerLat: centerLat as number, centerLng: centerLng as number }
    : null

  // Load the static-map preview once (or on retry). Cleans up the blob: URL
  // on unmount/reload so we never leak object URLs.
  const loadPreview = React.useCallback(() => {
    if (!hasCenter) return
    let cancelled = false
    let objectUrl: string | null = null
    setPreview({ kind: 'loading' })
    fetchBranchMapPreview(branch.id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setPreview({ kind: 'ready', src: objectUrl })
      })
      .catch((err) => {
        if (cancelled) return
        const code = err instanceof ApiError ? err.code : undefined
        setPreview(code === 'MAP_PREVIEW_NOT_ENABLED' ? { kind: 'unavailable' } : { kind: 'error' })
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [branch.id, hasCenter])

  React.useEffect(() => {
    const cleanup = loadPreview()
    return cleanup
  }, [loadPreview])

  const radiusPx = params ? radiusMetresToPixels(LOCATION_TRUST_RADIUS_METRES, params) : 0

  function pixelFromClientPoint(clientX: number, clientY: number): PixelPoint {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return pinPixel
    const scaleX = STATIC_MAP_WIDTH_PX / rect.width
    const scaleY = STATIC_MAP_HEIGHT_PX / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  function moveTo(clientX: number, clientY: number) {
    if (!params) return
    const raw = pixelFromClientPoint(clientX, clientY)
    const candidate = pixelToLatLng(raw, params)
    const clamped = clampToRadius(candidate, { lat: params.centerLat, lng: params.centerLng }, LOCATION_TRUST_RADIUS_METRES)
    setPinPixel(latLngToPixel(clamped, params))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!params) return
    draggingRef.current = true
    // Optional chaining: jsdom (the jest test environment) does not implement
    // pointer capture; real browsers do. Capture keeps drag events routed to
    // this element even if the pointer leaves it mid-drag.
    e.currentTarget.setPointerCapture?.(e.pointerId)
    moveTo(e.clientX, e.clientY)
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    moveTo(e.clientX, e.clientY)
  }
  function handlePointerUp() {
    draggingRef.current = false
  }

  async function confirm() {
    if (!params) return
    setSubmitError(null)
    const target = pixelToLatLng(pinPixel, params)
    const clamped: LatLng = clampToRadius(
      target,
      { lat: params.centerLat, lng: params.centerLng },
      LOCATION_TRUST_RADIUS_METRES,
    )
    try {
      const updated = await dropPin.mutateAsync({ id: branch.id, latitude: clamped.lat, longitude: clamped.lng })
      setOutcome(
        updated.locationConfidence === 'MERCHANT_CONFIRMED'
          ? { kind: 'pass', branch: updated }
          : { kind: 'needs_review', branch: updated },
      )
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : undefined
      if (apiErr?.status === 429) {
        setSubmitError({ kind: 'rate_limited' })
        return
      }
      if (apiErr?.code === 'BRANCH_LOCATION_ALREADY_CONFIRMED') {
        setSubmitError({ kind: 'already_confirmed' })
        return
      }
      setSubmitError({ kind: 'generic' })
    }
  }

  // --- Outcome panel (replaces the drag UI once a submit has resolved) -----
  if (outcome) {
    return (
      <div data-testid="pin-drop-outcome" className="space-y-4">
        {outcome.kind === 'pass' ? (
          <div
            className="flex items-start gap-3 rounded-[14px] p-4"
            style={{ background: 'rgba(15, 122, 62, 0.10)', border: '1px solid rgba(15, 122, 62, 0.25)' }}
          >
            <CheckCircle2 size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
            <div>
              <p className="text-sm font-semibold text-foreground">Merchant-set pin</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You set this pin on the map. It is now live for customers.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex items-start gap-3 rounded-[14px] p-4"
            style={{ background: 'var(--warning-bg)', border: '1px solid var(--border-subtle)' }}
          >
            <Info size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
            <div>
              <p className="text-sm font-semibold text-foreground">We will check this pin</p>
              <p className="mt-1 text-sm text-muted-foreground">
                That looks outside {branch.postcode ?? 'your postcode'}. We will have someone check it before it
                goes on the map. Your listing keeps showing the general area for now.
              </p>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={() => onDone(outcome.branch)} data-testid="pin-drop-done">
            Done
          </Button>
        </div>
      </div>
    )
  }

  // --- No usable centre (defensive; the caller only mounts this for
  // POSTCODE_CENTROID / NEEDS_REVIEW branches, which always carry a resolved
  // centroid) --------------------------------------------------------------
  if (!hasCenter) {
    return (
      <div className="space-y-4">
        <PreviewUnavailableNotice />
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  // --- Preview not yet usable: loading / unavailable / error. No manual
  // lat/lng input in any of these states -- coordinates only ever leave the
  // client via the drag interaction, which needs a loaded map. ------------
  if (preview.kind === 'loading') {
    return (
      <div className="space-y-4">
        <div
          data-testid="pin-drop-preview-loading"
          className="flex items-center justify-center rounded-[14px] border"
          style={{
            aspectRatio: `${STATIC_MAP_WIDTH_PX} / ${STATIC_MAP_HEIGHT_PX}`,
            borderColor: 'var(--border-subtle)',
            background: 'var(--page)',
          }}
        >
          <p className="text-sm text-muted-foreground">Loading map preview...</p>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  if (preview.kind === 'unavailable') {
    return (
      <div className="space-y-4">
        <PreviewUnavailableNotice />
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  if (preview.kind === 'error') {
    return (
      <div className="space-y-4">
        <div
          data-testid="pin-drop-preview-error"
          className="space-y-3 rounded-[14px] border p-4 text-sm"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          <p>We could not load the map preview. Please try again shortly.</p>
          <Button type="button" variant="secondary" size="sm" onClick={loadPreview}>
            Retry
          </Button>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  // --- Ready: the draggable map + confirm/cancel. --------------------------
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Info size={15} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
        Drag the pin to your exact entrance. Keep it inside your postcode area (shown).
      </p>

      <div
        ref={containerRef}
        data-testid="pin-drop-map"
        className="relative w-full touch-none overflow-hidden rounded-[14px] border select-none"
        style={{
          aspectRatio: `${STATIC_MAP_WIDTH_PX} / ${STATIC_MAP_HEIGHT_PX}`,
          borderColor: 'var(--border-subtle)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- an ephemeral
            client-generated blob: URL (see loadPreview); next/image's optimizer
            is for static/remote assets, not one-off blobs. */}
        <img
          src={preview.src}
          alt="Map centred on your postcode area"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <svg
          viewBox={`0 0 ${STATIC_MAP_WIDTH_PX} ${STATIC_MAP_HEIGHT_PX}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden
        >
          <circle
            cx={STATIC_MAP_WIDTH_PX / 2}
            cy={STATIC_MAP_HEIGHT_PX / 2}
            r={radiusPx}
            fill="rgba(226, 12, 4, 0.12)"
            stroke="rgba(226, 12, 4, 0.5)"
            strokeWidth={2}
          />
        </svg>
        <div
          data-testid="pin-drop-marker"
          className="pointer-events-none absolute"
          style={{
            left: `${(pinPixel.x / STATIC_MAP_WIDTH_PX) * 100}%`,
            top: `${(pinPixel.y / STATIC_MAP_HEIGHT_PX) * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <MapPin size={30} aria-hidden style={{ color: 'var(--rose)' }} fill="var(--rose)" />
        </div>
      </div>

      {submitError ? (
        <p
          role="alert"
          data-testid="pin-drop-submit-error"
          className="rounded-[10px] border px-3 py-2 text-sm font-medium"
          style={{ borderColor: '#FBCED0', background: '#FEECEC', color: 'var(--destructive)' }}
        >
          {submitErrorMessage(submitError)}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={dropPin.isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={confirm} disabled={dropPin.isPending} data-testid="pin-drop-confirm">
          {dropPin.isPending ? 'Setting pin...' : 'Set this pin'}
        </Button>
      </div>
    </div>
  )
}

function submitErrorMessage(err: SubmitError): string {
  switch (err.kind) {
    case 'rate_limited':
      return 'Too many attempts just now. Wait a moment, then try again.'
    case 'already_confirmed':
      return 'This location is already confirmed and cannot be changed here.'
    default:
      return 'We could not set your pin. Please try again.'
  }
}

function PreviewUnavailableNotice() {
  return (
    <div
      data-testid="pin-drop-preview-unavailable"
      className="flex items-start gap-3 rounded-[14px] p-4 text-sm"
      style={{ background: 'var(--tint)', border: '1px solid var(--border-subtle)' }}
    >
      <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: 'var(--rose)' }} />
      <p className="text-muted-foreground">
        Map preview is not available right now. Please try again shortly.
      </p>
    </div>
  )
}
