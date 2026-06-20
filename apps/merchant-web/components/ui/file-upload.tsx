'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api/client'

// FileUpload: click-to-upload image control for the onboarding flow (F3 logo/cover,
// F4 branch banner/photo). It runs a CLIENT-SIDE type (PNG/JPG) + per-kind size
// pre-check, then POSTs the file to the B5 server-proxied route
// `POST /api/v1/merchant/uploads/:kind` via the shared API client (which attaches
// the in-memory bearer token when `auth: true`, and leaves the Content-Type unset
// for a FormData body so the browser sets the multipart boundary). On success the
// backend returns `{ url }`; we surface the public URL via `onUploaded`.
//
// The client-side checks are a UX pre-filter only - the backend re-validates type,
// size, AND dimensions server-side (it is the security boundary). The size caps
// here mirror the backend per-kind caps so the user gets fast feedback.

export type UploadKind = 'logo' | 'banner' | 'photo'

const MB = 1024 * 1024

// Per-kind client size caps (mirror the B5 service IMAGE_RULES maxBytes).
const MAX_BYTES: Record<UploadKind, number> = {
  logo: 2 * MB,
  banner: 5 * MB,
  photo: 5 * MB,
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
const ACCEPT_ATTR = 'image/png,image/jpeg'

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

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Client-side type pre-check.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setStatus('error')
      setFileName(null)
      setError('Use a PNG or JPG image.')
      return
    }
    // Client-side size pre-check (mirrors the backend per-kind cap).
    const cap = MAX_BYTES[kind]
    if (file.size > cap) {
      setStatus('error')
      setFileName(null)
      setError(`That file is too large. Keep it under ${humanMb(cap)}.`)
      return
    }

    setFileName(file.name)
    setStatus('uploading')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch<{ url: string }>(`/api/v1/merchant/uploads/${kind}`, {
        method: 'POST',
        auth: true,
        body: form,
      })
      setStatus('done')
      onUploaded?.(res.url)
    } catch {
      setStatus('error')
      setError('Upload failed. Please try again.')
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
    </div>
  )
}
