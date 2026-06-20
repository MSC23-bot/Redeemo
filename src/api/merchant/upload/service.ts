// M2 B5: merchant-facing server-proxied image upload (logo / banner / voucher
// photo). Mirrors the admin B4 `createMerchantDocument` server-proxied shape (the
// API holds the bytes, so content-type + size are HARD-enforced before the object
// is written) but for PUBLIC image kinds, with ADDITIONAL server-side image
// validation: PNG/JPEG only, a STRICTER per-kind size cap, and dimension rules
// (logo square; banner/photo landscape; per-kind minimums).
//
// This is upload-only: it returns the public URL. It does NOT write logoUrl /
// bannerUrl / voucher imageUrl (the profile / branch / voucher write paths own
// those columns) - keeping the upload decoupled and reusable.
//
// Dimensions are read from the raw buffer header with NO new dependency: PNG width/
// height live in the IHDR chunk; JPEG width/height live in an SOFn frame marker.

import { AppError } from '../../shared/errors'
import { putObject, publicUrl } from '../../shared/storage'

// The image kinds a merchant may upload. (NOT `document` - that is admin-only and
// out of scope for M2.) Each maps to an existing public storage kind.
export type ImageUploadKind = 'logo' | 'banner' | 'photo'

const MB = 1024 * 1024

// PNG/JPEG only (the storage `IMAGE_TYPES` allow-list also includes webp, but B5
// restricts to PNG/JPEG per the spec D7 rules).
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg'])

interface ImageRule {
  /** stricter-than-storage hard size cap on the real bytes. */
  maxBytes: number
  minWidth: number
  minHeight: number
  /** 'square' => width === height; 'landscape' => width > height. */
  shape: 'square' | 'landscape'
}

const IMAGE_RULES: Readonly<Record<ImageUploadKind, ImageRule>> = {
  logo: { maxBytes: 2 * MB, minWidth: 512, minHeight: 512, shape: 'square' },
  banner: { maxBytes: 5 * MB, minWidth: 1600, minHeight: 600, shape: 'landscape' },
  photo: { maxBytes: 5 * MB, minWidth: 1200, minHeight: 600, shape: 'landscape' },
}

const VALID_KINDS = Object.keys(IMAGE_RULES) as ImageUploadKind[]

export function isImageUploadKind(value: string): value is ImageUploadKind {
  return (VALID_KINDS as string[]).includes(value)
}

/**
 * Read pixel dimensions from a PNG or JPEG buffer header WITHOUT any image
 * dependency. Returns null when the bytes are not a recognisable PNG/JPEG with a
 * readable size header (caller maps null -> IMAGE_UNREADABLE).
 *
 * PNG: 8-byte signature, then the first chunk is IHDR (length 13). Width is the
 *   big-endian uint32 at offset 16, height at offset 20 (right after the "IHDR"
 *   chunk-type bytes at 12..16).
 * JPEG: SOI (FF D8), then a sequence of marker segments. Each non-standalone
 *   marker is FF <code> followed by a 2-byte big-endian segment length. A Start-of-
 *   Frame marker (SOFn: C0-C3, C5-C7, C9-CB, CD-CF - excluding C4/C8/CC which are
 *   not frame headers) carries: 1 byte precision, 2 bytes height, 2 bytes width.
 */
export function readImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a &&
    buf.toString('ascii', 12, 16) === 'IHDR'
  ) {
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    if (width > 0 && height > 0) return { width, height }
    return null
  }

  // JPEG
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      // Markers are FF-prefixed; fill bytes (FF FF...) are skipped.
      if (buf[offset] !== 0xff) {
        offset += 1
        continue
      }
      let marker = buf[offset + 1]
      // Skip any run of padding 0xFF bytes preceding the real marker code.
      let p = offset + 1
      while (p < buf.length && buf[p] === 0xff) p += 1
      if (p >= buf.length) break
      marker = buf[p]

      // Standalone markers (no length): RSTn (D0-D7), SOI (D8), EOI (D9), TEM (01).
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset = p + 1
        continue
      }

      const segStart = p + 1
      if (segStart + 1 >= buf.length) break
      const segLen = buf.readUInt16BE(segStart)

      // Start-of-Frame markers carry the dimensions. Exclude DHT (C4), JPG (C8),
      // and DAC (CC), which share the C0-CF band but are not frame headers.
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      if (isSof) {
        // segStart -> [2 len][1 precision][2 height][2 width]
        if (segStart + 6 >= buf.length) return null
        const height = buf.readUInt16BE(segStart + 3)
        const width = buf.readUInt16BE(segStart + 5)
        if (width > 0 && height > 0) return { width, height }
        return null
      }

      // Otherwise skip this whole segment (2-byte length INCLUDES the length bytes).
      offset = segStart + segLen
    }
    return null
  }

  return null
}

export interface UploadMerchantImageInput {
  merchantId: string
  kind: ImageUploadKind
  contentType: string
  body: Buffer
}

/**
 * Server-proxied image upload. Validates content-type + per-kind size + dimensions
 * against the REAL bytes, then writes to R2 via `putObject` (which independently
 * HARD-validates content-type + the storage size cap and asserts storage is
 * enabled) and returns the composed public URL. Throws an AppError BEFORE any write
 * on any validation failure. Does NOT persist the URL anywhere - upload-only.
 */
export async function uploadMerchantImage(input: UploadMerchantImageInput): Promise<{ url: string }> {
  const rule = IMAGE_RULES[input.kind]
  if (!rule) throw new AppError('INVALID_UPLOAD')

  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new AppError('UNSUPPORTED_FILE_TYPE')
  }
  if (!Buffer.isBuffer(input.body) || input.body.length === 0) {
    throw new AppError('FILE_REQUIRED')
  }
  // Stricter-than-storage per-kind size cap on the real bytes.
  if (input.body.length > rule.maxBytes) {
    throw new AppError('IMAGE_TOO_LARGE')
  }

  const dims = readImageDimensions(input.body)
  if (!dims) throw new AppError('IMAGE_UNREADABLE')

  const meetsMin = dims.width >= rule.minWidth && dims.height >= rule.minHeight
  const meetsShape = rule.shape === 'square' ? dims.width === dims.height : dims.width > dims.height
  if (!meetsMin || !meetsShape) {
    throw new AppError('IMAGE_DIMENSIONS_INVALID')
  }

  // putObject mints a safe `kind/ownerId/<random>.<ext>` key and re-validates
  // content-type + the storage size cap. The kind name maps 1:1 to the public
  // storage kind, and ownerId is the merchant id (validated [A-Za-z0-9_-]+).
  const { key } = await putObject({
    kind: input.kind,
    ownerId: input.merchantId,
    contentType: input.contentType,
    body: input.body,
  })

  return { url: publicUrl(key) }
}
