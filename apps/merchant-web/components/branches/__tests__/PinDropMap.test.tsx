import { render, screen, fireEvent } from '@testing-library/react'
import { PinDropMap } from '@/components/branches/PinDropMap'
import { ApiError } from '@/lib/api/client'
import type { Branch } from '@/lib/api/branch'

// Branch Location Trust Slice 3 (pin-drop addendum, plan PR-2 Task 10): the
// draggable-pin static map. Covers: preview load states (ready / unavailable /
// error), the confirm submit outcomes (PASS / NEEDS_REVIEW / already-confirmed
// / rate-limited / generic error), and that raw lat/lng are never rendered.

const fetchBranchMapPreview = jest.fn()
jest.mock('@/lib/api/branch', () => ({
  fetchBranchMapPreview: (...args: unknown[]) => fetchBranchMapPreview(...args),
}))

const mutateAsync = jest.fn()
let isPending = false
jest.mock('@/lib/branches/useBranches', () => ({
  useDropBranchPin: () => ({ mutateAsync, isPending }),
}))

function branch(over: Record<string, unknown> = {}): Branch {
  return {
    id: 'b1',
    name: 'High Street',
    postcode: 'CB2 1AB',
    latitude: 52.2053,
    longitude: 0.1218,
    locationConfidence: 'POSTCODE_CENTROID',
    ...over,
  } as Branch
}

const onDone = jest.fn()
const onCancel = jest.fn()

// jsdom (this project's jest testEnvironment) has no PointerEvent constructor,
// so @testing-library's fireEvent.pointerDown/-Move dispatch an event with
// clientX/clientY silently dropped (confirmed against a minimal repro).
// Dispatching a MouseEvent explicitly TYPED as 'pointerdown'/'pointermove'
// works: React's synthetic event system dispatches onPointerDown/onPointerMove
// by matching the native event's `type` string, not by checking
// `instanceof PointerEvent`, and MouseEvent carries clientX/clientY faithfully
// in jsdom. This only affects the TEST harness; real browsers dispatch true
// PointerEvent instances.
function firePointer(type: 'pointerdown' | 'pointermove' | 'pointerup', el: Element, clientX: number, clientY: number) {
  fireEvent(el, new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true }))
}

beforeEach(() => {
  fetchBranchMapPreview.mockReset()
  mutateAsync.mockReset()
  onDone.mockReset()
  onCancel.mockReset()
  isPending = false
  // jsdom does not implement createObjectURL/revokeObjectURL.
  global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = jest.fn()
})

describe('PinDropMap preview loading', () => {
  it('shows a loading state, then the map once the preview resolves', async () => {
    let resolvePreview: (blob: Blob) => void = () => {}
    fetchBranchMapPreview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve
      }),
    )
    render(<PinDropMap branch={branch()} onDone={onDone} onCancel={onCancel} />)
    expect(screen.getByTestId('pin-drop-preview-loading')).toBeInTheDocument()
    resolvePreview(new Blob(['x'], { type: 'image/png' }))
    expect(await screen.findByTestId('pin-drop-map')).toBeInTheDocument()
    expect(screen.getByAltText(/map centred on your postcode area/i)).toBeInTheDocument()
  })

  it('shows the unavailable notice on MAP_PREVIEW_NOT_ENABLED and offers no manual coordinate input', async () => {
    fetchBranchMapPreview.mockRejectedValue(new ApiError(503, { error: { code: 'MAP_PREVIEW_NOT_ENABLED' } }))
    render(<PinDropMap branch={branch()} onDone={onDone} onCancel={onCancel} />)
    expect(await screen.findByTestId('pin-drop-preview-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('pin-drop-map')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('pin-drop-confirm')).not.toBeInTheDocument()
  })

  it('shows a calm error + Retry on any other preview failure', async () => {
    fetchBranchMapPreview.mockRejectedValueOnce(new ApiError(503, { error: { code: 'GAZETTEER_UNAVAILABLE' } }))
    render(<PinDropMap branch={branch()} onDone={onDone} onCancel={onCancel} />)
    expect(await screen.findByTestId('pin-drop-preview-error')).toBeInTheDocument()

    fetchBranchMapPreview.mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByTestId('pin-drop-map')).toBeInTheDocument()
  })

  it('never renders the raw lat/lng anywhere', async () => {
    fetchBranchMapPreview.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    render(<PinDropMap branch={branch()} onDone={onDone} onCancel={onCancel} />)
    await screen.findByTestId('pin-drop-map')
    expect(screen.queryByText(/52\.2053/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0\.1218/)).not.toBeInTheDocument()
  })
})

describe('PinDropMap drag + confirm', () => {
  async function renderReady(branchOverrides: Record<string, unknown> = {}) {
    fetchBranchMapPreview.mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
    render(<PinDropMap branch={branch(branchOverrides)} onDone={onDone} onCancel={onCancel} />)
    const map = await screen.findByTestId('pin-drop-map')
    // jsdom returns a 0x0 rect for every element by default; give the map a
    // real box so pixelFromClientPoint's scale math is well-defined.
    map.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 640, bottom: 400, width: 640, height: 400, x: 0, y: 0, toJSON: () => {},
    })
    return map
  }

  it('starts with the pin at the map centre', async () => {
    await renderReady()
    const marker = screen.getByTestId('pin-drop-marker')
    expect(marker.style.left).toBe('50%')
    expect(marker.style.top).toBe('50%')
  })

  it('dragging moves the pin marker', async () => {
    const map = await renderReady()
    firePointer('pointerdown', map, 340, 180)
    const marker = screen.getByTestId('pin-drop-marker')
    expect(marker.style.left).not.toBe('50%')
  })

  it('confirm submits the dragged pin and shows the PASS outcome (Merchant-set pin, never "verified")', async () => {
    const map = await renderReady()
    firePointer('pointerdown', map, 330, 200)
    mutateAsync.mockResolvedValue({
      id: 'b1',
      locationConfidence: 'MERCHANT_CONFIRMED',
      latitude: 52.206,
      longitude: 0.122,
    })
    fireEvent.click(screen.getByTestId('pin-drop-confirm'))
    expect(await screen.findByTestId('pin-drop-outcome')).toBeInTheDocument()
    expect(screen.getByText(/merchant-set pin/i)).toBeInTheDocument()
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument()

    const [{ id, latitude, longitude }] = mutateAsync.mock.calls[0]
    expect(id).toBe('b1')
    expect(typeof latitude).toBe('number')
    expect(typeof longitude).toBe('number')

    fireEvent.click(screen.getByTestId('pin-drop-done'))
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1', locationConfidence: 'MERCHANT_CONFIRMED' }),
    )
  })

  it('confirm shows the honest NEEDS_REVIEW outcome on a FAIL (never claims it applied the pin)', async () => {
    await renderReady()
    mutateAsync.mockResolvedValue({
      id: 'b1',
      locationConfidence: 'NEEDS_REVIEW',
      postcode: 'CB2 1AB',
      latitude: 52.2053,
      longitude: 0.1218,
    })
    fireEvent.click(screen.getByTestId('pin-drop-confirm'))
    expect(await screen.findByTestId('pin-drop-outcome')).toBeInTheDocument()
    expect(screen.getByText(/we will check this pin/i)).toBeInTheDocument()
    expect(screen.getByText(/CB2 1AB/)).toBeInTheDocument()
    expect(screen.queryByText(/merchant-set pin/i)).not.toBeInTheDocument()
  })

  it('shows a rate-limit message on a 429 (detected via status, not .code)', async () => {
    await renderReady()
    mutateAsync.mockRejectedValue(new ApiError(429, { statusCode: 429, error: 'Too Many Requests' }))
    fireEvent.click(screen.getByTestId('pin-drop-confirm'))
    expect(await screen.findByTestId('pin-drop-submit-error')).toHaveTextContent(/too many attempts/i)
    expect(screen.queryByTestId('pin-drop-outcome')).not.toBeInTheDocument()
  })

  it('shows an already-confirmed message on BRANCH_LOCATION_ALREADY_CONFIRMED', async () => {
    await renderReady()
    mutateAsync.mockRejectedValue(new ApiError(409, { error: { code: 'BRANCH_LOCATION_ALREADY_CONFIRMED' } }))
    fireEvent.click(screen.getByTestId('pin-drop-confirm'))
    expect(await screen.findByTestId('pin-drop-submit-error')).toHaveTextContent(/already confirmed/i)
  })

  it('shows a calm generic message on any other submit failure', async () => {
    await renderReady()
    mutateAsync.mockRejectedValue(new ApiError(500, { error: { code: 'INTERNAL' } }))
    fireEvent.click(screen.getByTestId('pin-drop-confirm'))
    expect(await screen.findByTestId('pin-drop-submit-error')).toHaveTextContent(/could not set your pin/i)
  })

  it('Cancel calls onCancel without submitting', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})

describe('PinDropMap defensive: no usable centroid', () => {
  it('shows the unavailable notice (never crashes / never a manual lat-lng input) when the branch has no coordinates', () => {
    render(
      <PinDropMap
        branch={branch({ latitude: null, longitude: null })}
        onDone={onDone}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByTestId('pin-drop-preview-unavailable')).toBeInTheDocument()
    expect(fetchBranchMapPreview).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
  })
})
