import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// B5: merchant-facing server-proxied image upload (logo / banner / voucher photo).
// The storage library is module-mocked so the tests never touch real R2: putObject
// is stubbed (returns a deterministic key), while kindPolicy + isStorageEnabled +
// publicUrl stay REAL (isStorageEnabled reads STORAGE_ENABLED, toggled per test;
// publicUrl needs R2_PUBLIC_BASE_URL, set per test). The merchant resolves their
// own merchant via the merchant JWT (sub = merchantAdminId -> membership -> id).
const { putObjectMock } = vi.hoisted(() => ({ putObjectMock: vi.fn() }))
vi.mock('../../../src/api/shared/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/storage')>()
  return { ...actual, putObject: putObjectMock }
})

// ── Dependency-free image-buffer builders (real header bytes) ────────────────
//
// We build genuine PNG/JPEG headers so the server-side dimension parser reads the
// width/height we set. The pixel payload after the header is irrelevant to parsing.

function pngBuffer(width: number, height: number): Buffer {
  // 8-byte PNG signature + a single IHDR chunk (length 13). The parser reads
  // width at bytes 16..20 and height at 20..24 (big-endian, immediately after the
  // "IHDR" type at byte 12).
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrLen = Buffer.alloc(4)
  ihdrLen.writeUInt32BE(13, 0)
  const ihdrType = Buffer.from('IHDR', 'ascii')
  const dims = Buffer.alloc(13)
  dims.writeUInt32BE(width, 0)
  dims.writeUInt32BE(height, 4)
  // remaining 5 bytes (bit depth/colour/compression/filter/interlace) left zero
  return Buffer.concat([sig, ihdrLen, ihdrType, dims])
}

function jpegBuffer(width: number, height: number): Buffer {
  // SOI + a baseline SOF0 frame marker. SOF0 = FF C0, then a 2-byte length, then
  // 1 byte precision, 2 bytes height, 2 bytes width. The parser scans for an SOFn
  // marker and reads height/width from it.
  const soi = Buffer.from([0xff, 0xd8])
  const sofMarker = Buffer.from([0xff, 0xc0])
  const segLen = Buffer.alloc(2)
  segLen.writeUInt16BE(17, 0) // typical SOF0 segment length (8 + 3*3 components)
  const precision = Buffer.from([0x08])
  const h = Buffer.alloc(2)
  h.writeUInt16BE(height, 0)
  const w = Buffer.alloc(2)
  w.writeUInt16BE(width, 0)
  return Buffer.concat([soi, sofMarker, segLen, precision, h, w, Buffer.from([0x03])])
}

function multipartPayload(file?: {
  filename: string
  contentType: string
  content: Buffer
}): { body: Buffer; contentType: string } {
  const boundary = '----b5imageuploadtestboundary'
  const head = file
    ? Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`,
        'utf8',
      )
    : Buffer.from('', 'utf8')
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  const body = file ? Buffer.concat([head, file.content, tail]) : Buffer.from(`--${boundary}--\r\n`, 'utf8')
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

describe('B5: merchant image upload routes', () => {
  let app: FastifyInstance
  let merchantToken: string
  let savedStorageEnabled: string | undefined
  let savedPublicBase: string | undefined

  const url = (kind: string) => `/api/v1/merchant/uploads/${kind}`

  beforeEach(async () => {
    savedStorageEnabled = process.env.STORAGE_ENABLED
    savedPublicBase = process.env.R2_PUBLIC_BASE_URL
    process.env.STORAGE_ENABLED = 'true'
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example'
    putObjectMock.mockReset()

    app = await buildApp()
    app.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mm1',
          merchantId: 'm1',
          merchantAdminId: 'ma1',
          merchant: { status: 'ACTIVE' },
        }),
      },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      exists: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    merchantToken = (app.jwt as any).merchant.sign(
      { sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' },
    )
  })

  afterEach(async () => {
    await app.close()
    if (savedStorageEnabled === undefined) delete process.env.STORAGE_ENABLED
    else process.env.STORAGE_ENABLED = savedStorageEnabled
    if (savedPublicBase === undefined) delete process.env.R2_PUBLIC_BASE_URL
    else process.env.R2_PUBLIC_BASE_URL = savedPublicBase
  })

  const post = (kind: string, payload: { body: Buffer; contentType: string }, token = merchantToken) =>
    app.inject({
      method: 'POST',
      url: url(kind),
      headers: token
        ? { authorization: `Bearer ${token}`, 'content-type': payload.contentType }
        : { 'content-type': payload.contentType },
      payload: payload.body,
    })

  // ── Auth ────────────────────────────────────────────────────────────────

  it('401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'POST', url: url('logo') })
    expect(res.statusCode).toBe(401)
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  // ── Happy paths (each kind) ───────────────────────────────────────────────

  it('200 logo: square PNG >= 512x512 -> public URL', async () => {
    putObjectMock.mockResolvedValue({ key: 'logo/m1/abcdef0123456789.png' })
    const res = await post('logo', multipartPayload({ filename: 'logo.png', contentType: 'image/png', content: pngBuffer(512, 512) }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ url: 'https://cdn.example/logo/m1/abcdef0123456789.png' })
    expect(putObjectMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'logo', ownerId: 'm1', contentType: 'image/png' }))
    // The response is ONLY the public URL (composed from the public CDN base + key
    // for a public kind); no key/contentType/internals echoed beyond the URL.
    expect(Object.keys(JSON.parse(res.body))).toEqual(['url'])
  })

  it('200 banner: landscape JPEG >= 1600x600 -> public URL', async () => {
    putObjectMock.mockResolvedValue({ key: 'banner/m1/abcdef0123456789.jpg' })
    const res = await post('banner', multipartPayload({ filename: 'b.jpg', contentType: 'image/jpeg', content: jpegBuffer(1600, 600) }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ url: 'https://cdn.example/banner/m1/abcdef0123456789.jpg' })
    expect(putObjectMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'banner', ownerId: 'm1', contentType: 'image/jpeg' }))
  })

  it('200 photo: landscape PNG >= 1200x600 -> public URL', async () => {
    putObjectMock.mockResolvedValue({ key: 'photo/m1/abcdef0123456789.png' })
    const res = await post('photo', multipartPayload({ filename: 'p.png', contentType: 'image/png', content: pngBuffer(1200, 600) }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ url: 'https://cdn.example/photo/m1/abcdef0123456789.png' })
    expect(putObjectMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'photo', ownerId: 'm1', contentType: 'image/png' }))
  })

  // ── Kind validation ───────────────────────────────────────────────────────

  it('400 for an unknown kind', async () => {
    const res = await post('document', multipartPayload({ filename: 'd.png', contentType: 'image/png', content: pngBuffer(512, 512) }))
    expect(res.statusCode).toBe(400)
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  // ── Content-type validation (PNG / JPEG only) ─────────────────────────────

  it('400 UNSUPPORTED_FILE_TYPE for a webp image (not PNG/JPEG)', async () => {
    const res = await post('logo', multipartPayload({ filename: 'l.webp', contentType: 'image/webp', content: pngBuffer(512, 512) }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 UNSUPPORTED_FILE_TYPE for a gif image', async () => {
    const res = await post('logo', multipartPayload({ filename: 'l.gif', contentType: 'image/gif', content: Buffer.from('GIF89a') }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('UNSUPPORTED_FILE_TYPE')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  // ── Size validation (per-kind: logo 2MB, banner/photo 5MB) ────────────────

  it('413 IMAGE_TOO_LARGE when the logo exceeds 2MB', async () => {
    // Valid 512x512 PNG header, then padded past 2MB.
    const header = pngBuffer(512, 512)
    const big = Buffer.concat([header, Buffer.alloc(2 * 1024 * 1024 + 1)])
    const res = await post('logo', multipartPayload({ filename: 'l.png', contentType: 'image/png', content: big }))
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_TOO_LARGE')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('200 banner: a 3MB file is allowed (under the 5MB banner cap)', async () => {
    putObjectMock.mockResolvedValue({ key: 'banner/m1/abcdef0123456789.png' })
    const header = pngBuffer(1600, 600)
    const big = Buffer.concat([header, Buffer.alloc(3 * 1024 * 1024)])
    const res = await post('banner', multipartPayload({ filename: 'b.png', contentType: 'image/png', content: big }))
    expect(res.statusCode).toBe(200)
    expect(putObjectMock).toHaveBeenCalled()
  })

  // ── Dimension validation ──────────────────────────────────────────────────

  it('400 IMAGE_DIMENSIONS_INVALID when the logo is under 512x512', async () => {
    const res = await post('logo', multipartPayload({ filename: 'l.png', contentType: 'image/png', content: pngBuffer(400, 400) }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_DIMENSIONS_INVALID')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 IMAGE_DIMENSIONS_INVALID when the logo is not square (640x512)', async () => {
    const res = await post('logo', multipartPayload({ filename: 'l.png', contentType: 'image/png', content: pngBuffer(640, 512) }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_DIMENSIONS_INVALID')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 IMAGE_DIMENSIONS_INVALID when the banner is under 1600x600', async () => {
    const res = await post('banner', multipartPayload({ filename: 'b.jpg', contentType: 'image/jpeg', content: jpegBuffer(1200, 600) }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_DIMENSIONS_INVALID')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 IMAGE_DIMENSIONS_INVALID when the banner is not landscape (1600x1600)', async () => {
    const res = await post('banner', multipartPayload({ filename: 'b.jpg', contentType: 'image/jpeg', content: jpegBuffer(1600, 1600) }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_DIMENSIONS_INVALID')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 IMAGE_DIMENSIONS_INVALID when the photo is under 1200x600', async () => {
    const res = await post('photo', multipartPayload({ filename: 'p.png', contentType: 'image/png', content: pngBuffer(1000, 600) }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_DIMENSIONS_INVALID')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 IMAGE_DIMENSIONS_INVALID when the photo is portrait (1200x1400)', async () => {
    const res = await post('photo', multipartPayload({ filename: 'p.png', contentType: 'image/png', content: pngBuffer(1200, 1400) }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_DIMENSIONS_INVALID')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 IMAGE_UNREADABLE when the bytes are not a decodable PNG/JPEG header', async () => {
    const res = await post('logo', multipartPayload({ filename: 'l.png', contentType: 'image/png', content: Buffer.from('not an image at all') }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IMAGE_UNREADABLE')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  // ── Missing file ──────────────────────────────────────────────────────────

  it('400 FILE_REQUIRED when no file part is present', async () => {
    const res = await post('logo', multipartPayload())
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('FILE_REQUIRED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  it('400 FILE_REQUIRED for a non-multipart (JSON) body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: url('logo'),
      headers: { authorization: `Bearer ${merchantToken}`, 'content-type': 'application/json' },
      payload: { foo: 'bar' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('FILE_REQUIRED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })

  // ── STORAGE_ENABLED gating ────────────────────────────────────────────────

  it('503 STORAGE_NOT_ENABLED when storage is dark (before reading bytes)', async () => {
    delete process.env.STORAGE_ENABLED
    const res = await post('logo', multipartPayload({ filename: 'l.png', contentType: 'image/png', content: pngBuffer(512, 512) }))
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error.code).toBe('STORAGE_NOT_ENABLED')
    expect(putObjectMock).not.toHaveBeenCalled()
  })
})
