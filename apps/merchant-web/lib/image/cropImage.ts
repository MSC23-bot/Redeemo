// Canvas-heavy crop-to-File helper for ImageCropModal. Isolated in its own module
// (rather than inlined in the component) so it can be exercised/mocked
// independently of react-easy-crop and of jsdom's lack of a real canvas backend.
import { IMAGE_CROP_RULES, type UploadKind } from '@/lib/uploads/imageRules'

export interface PixelArea {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Thrown when the chosen crop, at native source resolution, cannot meet the
 * kind's minimum pixel dimensions. We deliberately never upscale past the
 * source's real resolution to hit the minimum (that would just produce a soft/
 * blurry image the backend would accept but that looks bad) - instead this is
 * surfaced as a blocking, actionable message.
 */
export class CropTooSmallError extends Error {}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = src
  })
}

export interface GetCroppedImageFileParams {
  /** object URL (or data URL) for the source file, as shown in the cropper. */
  imageSrc: string
  /** react-easy-crop's onCropComplete `croppedAreaPixels`, in source-image pixels. */
  croppedAreaPixels: PixelArea
  kind: UploadKind
  /** original picked file's name (extension is replaced with the output type). */
  fileName: string
  /** original picked file's MIME type; PNG is preserved (transparency), else JPEG. */
  sourceType: string
  /** JPEG encode quality (ignored for PNG output). Defaults to 0.9. */
  jpegQuality?: number
}

/**
 * Renders the selected crop region to a canvas AT NATIVE SOURCE RESOLUTION (no
 * upscaling) and returns it as a new File. Throws CropTooSmallError before doing
 * any canvas work if that native resolution would fall below the kind's minimum.
 */
export async function getCroppedImageFile(params: GetCroppedImageFileParams): Promise<File> {
  const { imageSrc, croppedAreaPixels, kind, fileName, sourceType, jpegQuality = 0.9 } = params
  const rule = IMAGE_CROP_RULES[kind]

  const width = Math.round(croppedAreaPixels.width)
  const height = Math.round(croppedAreaPixels.height)
  if (width < rule.minWidth || height < rule.minHeight) {
    throw new CropTooSmallError(rule.requirement)
  }

  const image = await loadImage(imageSrc)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE')

  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    width,
    height,
  )

  // Preserve PNG (transparency, e.g. a logo on a transparent background);
  // everything else re-encodes as JPEG at high quality.
  const outputType = sourceType === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('CANVAS_TOBLOB_FAILED'))),
      outputType,
      outputType === 'image/jpeg' ? jpegQuality : undefined,
    )
  })

  const ext = outputType === 'image/png' ? 'png' : 'jpg'
  const baseName = fileName.replace(/\.[^./\\]+$/, '') || kind
  return new File([blob], `${baseName}.${ext}`, { type: outputType })
}
