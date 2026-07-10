'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api/client'
import { ImageCropModal } from './ImageCropModal'
import type { UploadKind } from '@/lib/uploads/imageRules'

// FileUpload: click-to-upload image control for the onboarding flow (F3 logo/cover,
// F4 branch banner/photo). A picked image is first run through ImageCropModal (the
// Kraft Store walkthrough finding: no preview + a hard IMAGE_DIMENSIONS_INVALID
// rejection with no way to fix it) so the merchant can reframe it into the kind's
// required aspect ratio; the CROPPED output is what gets pre-checked and POSTed to
// the B5 server-proxied route `POST /api/v1/merchant/uploads/:kind` via the shared
// API client (which attaches the in-memory bearer token when `auth: true`, and
// leaves the Content-Type unset for a FormData body so the browser sets the
// multipart boundary). On success the backend returns `{ url }`; we surface the
// public URL via `onUploaded`, and show a small thumbnail preview of what was
// saved.
//
// The client-side checks are a UX pre-filter only - the backend re-validates type,
// size, AND dimensions server-side (it is the security boundary). The size caps
// here mirror the backend per-kind caps so the user gets fast feedback.

export type { UploadKind }

const MB = 1024 * 1024

// Per-kind client size caps (mirror the B5 service IMAGE_RULES maxBytes).
const MAX_BYTES: Record<UploadKind, number> = {
  logo: 2 * MB,
  banner: 5 * MB,
  photo: 5 * MB,
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
const ACCEPT_ATTR = 'image/png,image/jpeg'

// WF5 (staging acceptance walk): these backend codes (src/api/shared/errors.ts)
// already carry a message that states the actual requirement (dimensions,
// size, type, unreadable file) - surface it verbatim instead of the generic
// "Upload failed" fallback so the merchant knows what to fix.
const SURFACEABLE_UPLOAD_ERROR_CODES = new Set([
  'IMAGE_DIMENSIONS_INVALID',
  'IMAGE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'IMAGE_UNREADABLE',
])

interface FileUploadProps {
  kind: UploadKind
  /** Accessible label for the control. */
  label: string
  /** Size/format guidance shown under the control. */
  hint?: string
  /** Called with the public URL once the upload succeeds. */
  onUploaded?: (url: string) => void
  className?: string
  /** id for the file input (defaults to a kind-derived id). */
  id?: string
}

type Status = 'idle' | 'uploading' | 'done' | 'error'

function humanMb(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`
}

export function FileUpload({ kind, label, hint, onUploaded, className, id }: FileUploadProps) {
  const inputId = id ?? `file-upload-${kind}`
  const [status, setStatus] = React.useState<Status>('idle')
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // The just-picked, not-yet-cropped file. Set => the ImageCropModal is open.
  const [pendingCropFile, setPendingCropFile] = React.useState<File | null>(null)
  // Object URL for the CROPPED file that was actually uploaded, shown as a
  // post-upload success thumbnail so the merchant can see what was saved.
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)

  // Revoke the preview object URL whenever it changes or the control unmounts.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    // Reset immediately (not just on error/finally): the crop step is now an
    // async detour (open modal -> confirm/cancel), so the native input must be
    // clear right away for a re-pick of the SAME file to refire onChange,
    // whether the merchant cancels the crop or a later upload attempt fails.
    input.value = ''
    if (!file) return

    setError(null)

    // Client-side type pre-check runs on the RAW picked file, before crop.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setStatus('error')
      setFileName(null)
      setError('Use a PNG or JPG image.')
      return
    }

    // Open the crop step; the actual upload happens on crop confirm.
    setPendingCropFile(file)
  }

  function handleCropCancel() {
    setPendingCropFile(null)
  }

  async function handleCropConfirm(croppedFile: File) {
    setPendingCropFile(null)
    setError(null)

    // Client-side size pre-check (mirrors the backend per-kind cap), now run
    // against the CROPPED output rather than the original picked file.
    const cap = MAX_BYTES[kind]
    if (croppedFile.size > cap) {
      setStatus('error')
      setFileName(null)
      setError(`That file is too large. Keep it under ${humanMb(cap)}.`)
      return
    }

    setFileName(croppedFile.name)
    setStatus('uploading')
    try {
      const form = new FormData()
      form.append('file', croppedFile, croppedFile.name)
      const res = await apiFetch<{ url: string }>(`/api/v1/merchant/uploads/${kind}`, {
        method: 'POST',
        auth: true,
        body: form,
      })
      setStatus('done')
      setPreviewUrl(URL.createObjectURL(croppedFile))
      onUploaded?.(res.url)
    } catch (err) {
      setStatus('error')
      // Honest degrade when the storage capability is dark (feature-flagged off):
      // the control stays visible but explains itself instead of a generic failure.
      // Duck-typed (not instanceof) so partial client mocks in tests stay valid.
      const typed = err as { code?: unknown; message?: unknown } | null | undefined
      const code = typed?.code
      const backendMessage = typeof typed?.message === 'string' ? typed.message : null
      setError(
        code === 'STORAGE_NOT_ENABLED'
          ? 'Image upload is not available yet. You can add a photo later.'
          : typeof code === 'string' && SURFACEABLE_UPLOAD_ERROR_CODES.has(code) && backendMessage
            ? backendMessage
            : 'Upload failed. Please try again.',
      )
    }
  }

  return (
    <div data-slot="file-upload" className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={inputId}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed px-4 py-6 text-center transition-colors',
          status === 'error'
            ? 'border-[#B91C1C] bg-[#FEECEC]'
            : status === 'done'
              ? 'border-[#0F7A3E] bg-[#FFFFFF]'
              : 'border-[#D1D5DB] bg-[#FFF9F5] hover:border-[#E20C04] hover:bg-[#FEF6F5]',
        )}
      >
        <span className="text-sm font-semibold text-[#010C35]">{label}</span>
        {fileName ? (
          <span className="text-xs text-[#455373]">
            {status === 'uploading' ? 'Uploading ' : ''}
            {fileName}
          </span>
        ) : (
          <span className="text-xs text-[#6B7390]">Click to upload</span>
        )}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        aria-label={label}
        className="sr-only"
        onChange={handleChange}
      />
      {hint ? <span className="text-xs text-[#6B7390]">{hint}</span> : null}
      {error ? (
        <span role="alert" className="text-xs font-medium text-[#B91C1C]">
          {error}
        </span>
      ) : null}
      {status === 'done' && previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL preview, not an optimizable remote asset
        <img
          src={previewUrl}
          alt=""
          data-testid="file-upload-preview"
          className="h-16 w-16 rounded-[10px] border border-[#D1D5DB] object-cover"
        />
      ) : null}
      {pendingCropFile ? (
        <ImageCropModal
          file={pendingCropFile}
          kind={kind}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      ) : null}
    </div>
  )
}
