import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImageCropModal } from '../ImageCropModal'
import { CropTooSmallError, getCroppedImageFile } from '@/lib/image/cropImage'

/**
 * react-easy-crop is canvas/gesture-heavy (drag, pinch, ResizeObserver) and not
 * meaningfully exercisable in jsdom. It is replaced with a minimal fake that
 * renders the `aspect` prop it was given (so the aspect-per-kind wiring is
 * assertable) and exposes buttons to fire `onCropComplete` with a controllable
 * `croppedAreaPixels`, which is all ImageCropModal's own logic (the upscale
 * guard, the live-preview draw, and the confirm handler) actually depends on.
 */
jest.mock('react-easy-crop', () => ({
  __esModule: true,
  default: (props: {
    aspect: number
    onCropComplete?: (area: unknown, areaPixels: { x: number; y: number; width: number; height: number }) => void
  }) => (
    <div data-testid="mock-cropper" data-aspect={props.aspect}>
      <button
        type="button"
        data-testid="mock-crop-large"
        onClick={() =>
          props.onCropComplete?.(
            { x: 0, y: 0, width: 100, height: 100 },
            { x: 0, y: 0, width: 2000, height: Math.round(2000 / props.aspect) },
          )
        }
      >
        simulate large crop
      </button>
      <button
        type="button"
        data-testid="mock-crop-small"
        onClick={() =>
          props.onCropComplete?.(
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 0, y: 0, width: 50, height: Math.round(50 / props.aspect) },
          )
        }
      >
        simulate small crop
      </button>
    </div>
  ),
}))

// The canvas-render step is unit-tested directly against cropImage.ts
// (lib/image/__tests__/cropImage.test.ts); here it's mocked so ImageCropModal's
// own wiring (guard, confirm/cancel, error surfacing) is what's under test.
jest.mock('@/lib/image/cropImage', () => {
  const actual = jest.requireActual('@/lib/image/cropImage')
  return {
    ...actual,
    getCroppedImageFile: jest.fn(),
  }
})

const getCroppedImageFileMock = getCroppedImageFile as jest.Mock

function makeFile(name: string, type: string): File {
  return new File(['x'], name, { type })
}

// URL.createObjectURL / revokeObjectURL are polyfilled globally in jest.setup.ts
// (jsdom implements neither).

describe('ImageCropModal', () => {
  beforeEach(() => {
    getCroppedImageFileMock.mockReset()
  })

  it.each([
    ['logo', 1],
    ['banner', 1600 / 600],
    ['photo', 1200 / 600],
  ] as const)('renders the Cropper with the %s kind fixed aspect ratio', (kind, expectedAspect) => {
    render(<ImageCropModal file={makeFile('a.png', 'image/png')} kind={kind} onCancel={jest.fn()} onConfirm={jest.fn()} />)
    const cropper = screen.getByTestId('mock-cropper')
    expect(Number(cropper.getAttribute('data-aspect'))).toBeCloseTo(expectedAspect, 5)
  })

  it('blocks confirm and shows the minimum-dimension message when the native-resolution crop is too small', () => {
    render(<ImageCropModal file={makeFile('logo.png', 'image/png')} kind="logo" onCancel={jest.fn()} onConfirm={jest.fn()} />)

    fireEvent.click(screen.getByTestId('mock-crop-small'))

    expect(screen.getByTestId('image-crop-too-small')).toHaveTextContent(/512x512/)
    expect(screen.getByTestId('image-crop-confirm')).toBeDisabled()
    expect(getCroppedImageFileMock).not.toHaveBeenCalled()
  })

  it('enables confirm once a crop at/above the minimum resolution is selected, and produces a File on confirm', async () => {
    const outputFile = new File(['cropped'], 'logo.png', { type: 'image/png' })
    getCroppedImageFileMock.mockResolvedValue(outputFile)
    const onConfirm = jest.fn()

    render(<ImageCropModal file={makeFile('logo.png', 'image/png')} kind="logo" onCancel={jest.fn()} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByTestId('mock-crop-large'))
    expect(screen.getByTestId('image-crop-confirm')).not.toBeDisabled()

    fireEvent.click(screen.getByTestId('image-crop-confirm'))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(outputFile))
    expect(getCroppedImageFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'logo', fileName: 'logo.png', sourceType: 'image/png' }),
    )
  })

  it('surfaces the CropTooSmallError message inline if the crop step itself rejects with it', async () => {
    getCroppedImageFileMock.mockRejectedValue(new CropTooSmallError('Logos must be square, at least 512x512 pixels.'))
    render(<ImageCropModal file={makeFile('logo.png', 'image/png')} kind="logo" onCancel={jest.fn()} onConfirm={jest.fn()} />)

    fireEvent.click(screen.getByTestId('mock-crop-large'))
    fireEvent.click(screen.getByTestId('image-crop-confirm'))

    expect(await screen.findByTestId('image-crop-error')).toHaveTextContent(/512x512/)
  })

  it('calls onCancel without ever invoking the crop step', () => {
    const onCancel = jest.fn()
    render(<ImageCropModal file={makeFile('logo.png', 'image/png')} kind="logo" onCancel={onCancel} onConfirm={jest.fn()} />)

    fireEvent.click(screen.getByTestId('image-crop-cancel'))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(getCroppedImageFileMock).not.toHaveBeenCalled()
  })
})
