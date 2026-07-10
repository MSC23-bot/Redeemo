import { getCroppedImageFile, CropTooSmallError } from '../cropImage'

/**
 * jsdom has no real canvas rendering backend and never actually loads images, so
 * both are mocked here:
 *   - `HTMLCanvasElement.prototype.getContext`/`toBlob` are stubbed (drawImage is a
 *     no-op spy; toBlob synchronously hands back a real Blob of the requested type).
 *   - the global `Image` constructor is replaced with a fake that resolves `onload`
 *     on the next microtask when `src` is set (jsdom's real Image never fires
 *     onload without an actual network/file load).
 * This exercises the module's real logic (the upscale-guard threshold, and the
 * PNG-preserved / JPEG-elsewhere output-type branch) without needing a real
 * browser canvas.
 */
describe('getCroppedImageFile', () => {
  let drawImageSpy: jest.Mock
  let toBlobSpy: jest.Mock

  beforeEach(() => {
    drawImageSpy = jest.fn()
    toBlobSpy = jest.fn(function (
      this: HTMLCanvasElement,
      callback: (blob: Blob | null) => void,
      type?: string,
    ) {
      callback(new Blob(['fake-bytes'], { type: type ?? 'image/png' }))
    })
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: drawImageSpy,
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toBlob = toBlobSpy as unknown as typeof HTMLCanvasElement.prototype.toBlob

    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        Promise.resolve().then(() => this.onload?.())
      }
    }
    // @ts-expect-error - replacing the global Image constructor for the test.
    global.Image = FakeImage
  })

  it('blocks (throws CropTooSmallError) before touching the canvas when the native-resolution crop is below the kind minimum', async () => {
    await expect(
      getCroppedImageFile({
        imageSrc: 'blob:fake',
        croppedAreaPixels: { x: 0, y: 0, width: 100, height: 100 },
        kind: 'logo',
        fileName: 'logo.png',
        sourceType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(CropTooSmallError)

    // The guard fires before any canvas work.
    expect(drawImageSpy).not.toHaveBeenCalled()
  })

  it('states the kind minimum in the CropTooSmallError message', async () => {
    await expect(
      getCroppedImageFile({
        imageSrc: 'blob:fake',
        croppedAreaPixels: { x: 0, y: 0, width: 1000, height: 300 }, // banner needs >=1600x600
        kind: 'banner',
        fileName: 'cover.jpg',
        sourceType: 'image/jpeg',
      }),
    ).rejects.toThrow(/1600x600/)
  })

  it('renders a File at native resolution and preserves PNG type for a PNG source', async () => {
    const file = await getCroppedImageFile({
      imageSrc: 'blob:fake',
      croppedAreaPixels: { x: 10, y: 20, width: 600, height: 600 },
      kind: 'logo',
      fileName: 'my-logo.png',
      sourceType: 'image/png',
    })

    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('my-logo.png')
    expect(drawImageSpy).toHaveBeenCalledWith(expect.anything(), 10, 20, 600, 600, 0, 0, 600, 600)
  })

  it('re-encodes a non-PNG source as JPEG and swaps the extension', async () => {
    const file = await getCroppedImageFile({
      imageSrc: 'blob:fake',
      croppedAreaPixels: { x: 0, y: 0, width: 1600, height: 600 },
      kind: 'banner',
      fileName: 'cover.webp',
      sourceType: 'image/webp',
    })

    expect(file.type).toBe('image/jpeg')
    expect(file.name).toBe('cover.jpg')
    expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9)
  })
})
