'use client'

// ImageCropModal: client-side crop/reframe step inserted before an image upload
// (file-upload.tsx). Kraft Store walkthrough finding: merchants had no preview of
// a picked logo/banner/photo, and a wrong-dimension image was HARD-REJECTED by the
// backend (IMAGE_DIMENSIONS_INVALID, src/api/merchant/upload/service.ts) with no
// way to fix it short of re-editing the file outside the app. This lets the
// merchant reposition/zoom any reasonable source image into the kind's FIXED
// aspect ratio (logo 1:1, banner 8:3, photo 2:1 - see lib/uploads/imageRules.ts,
// which mirrors the backend IMAGE_RULES) before it ever reaches the upload route.
//
// Upscale guard: the confirm action is blocked (with an inline message stating
// the kind's minimum) whenever the crop, at the source's NATIVE resolution,
// would fall below the backend's minimum pixel size - we never stretch a small
// source past its real resolution just to pass the check.
import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { Dialog } from './dialog'
import { Button } from './button'
import { IMAGE_CROP_RULES, IMAGE_KIND_LABEL, type UploadKind } from '@/lib/uploads/imageRules'
import { getCroppedImageFile, CropTooSmallError } from '@/lib/image/cropImage'

export interface ImageCropModalProps {
  /** The just-picked source file, before any crop. */
  file: File
  kind: UploadKind
  onCancel: () => void
  /** Called with the cropped output file once the merchant confirms. */
  onConfirm: (file: File) => void
}

const PREVIEW_WIDTH = 160

export function ImageCropModal({ file, kind, onCancel, onConfirm }: ImageCropModalProps) {
  const rule = IMAGE_CROP_RULES[kind]
  const label = IMAGE_KIND_LABEL[kind]

  // Stable for the file's lifetime in this modal; revoked on unmount.
  const imageSrc = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(imageSrc), [imageSrc])

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const sourceImageRef = useRef<HTMLImageElement | null>(null)

  // Load the full-resolution image once for the live preview canvas (the
  // interactive Cropper below loads/manages its own copy for dragging/zooming).
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) sourceImageRef.current = img
    }
    img.src = imageSrc
    return () => {
      cancelled = true
    }
  }, [imageSrc])

  const tooSmall =
    croppedAreaPixels != null &&
    (Math.round(croppedAreaPixels.width) < rule.minWidth || Math.round(croppedAreaPixels.height) < rule.minHeight)

  function handleCropComplete(_croppedArea: Area, areaPixels: Area) {
    setCroppedAreaPixels(areaPixels)

    // Live preview: draw the current crop region, downscaled, into a small
    // canvas so the merchant sees what will actually be saved (distinct from
    // the interactive Cropper view, which shows the full un-cropped media).
    const canvas = previewCanvasRef.current
    const source = sourceImageRef.current
    if (!canvas || !source) return
    const previewHeight = Math.round(PREVIEW_WIDTH / rule.aspect)
    canvas.width = PREVIEW_WIDTH
    canvas.height = previewHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, PREVIEW_WIDTH, previewHeight)
    ctx.drawImage(
      source,
      areaPixels.x,
      areaPixels.y,
      areaPixels.width,
      areaPixels.height,
      0,
      0,
      PREVIEW_WIDTH,
      previewHeight,
    )
  }

  async function handleConfirm() {
    if (!croppedAreaPixels || tooSmall || processing) return
    setProcessing(true)
    setError(null)
    try {
      const output = await getCroppedImageFile({
        imageSrc,
        croppedAreaPixels,
        kind,
        fileName: file.name,
        sourceType: file.type,
      })
      onConfirm(output)
    } catch (err) {
      setError(err instanceof CropTooSmallError ? err.message : 'Could not process that image. Try a different file.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog
      label={`Crop ${label}`}
      onClose={onCancel}
      scrimTestId="image-crop-scrim"
      panelTestId="image-crop-dialog"
    >
      <h2 className="mb-1 font-display text-lg font-semibold text-[#010C35]">Crop your {label}</h2>
      <p className="mb-4 text-sm text-[#455373]">
        {rule.requirement} Drag to reposition, use the slider to zoom.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
        <div
          className="relative h-72 w-full overflow-hidden rounded-[14px] bg-[#010C35]"
          data-testid="image-crop-area"
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={rule.aspect}
            // Always a rect mask: the saved file is rectangular either way (a logo
            // keeps its corners; the portal renders logos as rounded SQUARES, not
            // circles), so a round mask would misrepresent what gets stored.
            cropShape="rect"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7390]">Preview</span>
          <canvas
            ref={previewCanvasRef}
            width={PREVIEW_WIDTH}
            height={Math.round(PREVIEW_WIDTH / rule.aspect)}
            className="rounded-[10px] border border-[#D1D5DB] bg-[#FFF9F5]"
            data-testid="image-crop-preview"
            aria-hidden="true"
          />
        </div>
      </div>

      <label htmlFor="image-crop-zoom" className="mb-1.5 mt-4 block text-sm font-medium text-[#010C35]">
        Zoom
      </label>
      <input
        id="image-crop-zoom"
        type="range"
        min={1}
        max={3}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label="Zoom"
        className="w-full"
        data-testid="image-crop-zoom"
      />

      {croppedAreaPixels ? (
        <p className="mt-2 text-xs text-[#6B7390]" data-testid="image-crop-output-size">
          Will be saved at {Math.round(croppedAreaPixels.width)}x{Math.round(croppedAreaPixels.height)} pixels.
        </p>
      ) : null}

      {tooSmall ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[#B91C1C]" data-testid="image-crop-too-small">
          Zoom out or choose a larger image. {rule.requirement}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[#B91C1C]" data-testid="image-crop-error">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={processing}
          data-testid="image-crop-cancel"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!croppedAreaPixels || tooSmall || processing}
          data-testid="image-crop-confirm"
        >
          {processing ? 'Processing...' : 'Use this image'}
        </Button>
      </div>
    </Dialog>
  )
}
