import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 0 PR-0.5: the R2 (S3-compatible) storage LIBRARY. Pins the validation +
// key-scheme + presign safety rails. The AWS SDK is fully MOCKED — no real
// Cloudflare credentials, no network. This is a library only: NO HTTP route, NO
// multipart, NO DB writes, NO moderation (those are Phase 2 / PR-0.6).

const { getSignedUrlMock, sendMock, S3ClientCtor, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = vi.hoisted(() => ({
  getSignedUrlMock: vi.fn(),
  // B4: the S3 client `.send()` used by putObject / deleteObject (server-proxied).
  sendMock: vi.fn(),
  // regular functions so they work as constructors + capture their args
  S3ClientCtor: vi.fn(function (this: any, cfg: any) {
    this.config = cfg
    this.send = sendMock
  }),
  PutObjectCommand: vi.fn(function (this: any, input: any) {
    this.input = input
  }),
  GetObjectCommand: vi.fn(function (this: any, input: any) {
    this.input = input
  }),
  DeleteObjectCommand: vi.fn(function (this: any, input: any) {
    this.input = input
  }),
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: getSignedUrlMock }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: S3ClientCtor,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
}))

const R2_VARS = [
  'STORAGE_ENABLED',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_ENDPOINT',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
] as const
let saved: Record<string, string | undefined>

let storage: typeof import('../../../src/api/shared/storage')

beforeEach(async () => {
  saved = {}
  for (const k of R2_VARS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  getSignedUrlMock.mockReset()
  sendMock.mockReset()
  S3ClientCtor.mockClear()
  PutObjectCommand.mockClear()
  GetObjectCommand.mockClear()
  DeleteObjectCommand.mockClear()
  getSignedUrlMock.mockResolvedValue('https://r2.example/signed?sig=abc')
  sendMock.mockResolvedValue({})
  vi.resetModules() // fresh module → lazy S3 client singleton reset
  storage = await import('../../../src/api/shared/storage')
})

afterEach(() => {
  for (const k of R2_VARS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function enableStorage() {
  process.env.STORAGE_ENABLED = 'true'
  process.env.R2_ACCESS_KEY_ID = 'r2-access-key'
  process.env.R2_SECRET_ACCESS_KEY = 'r2-secret-key'
  process.env.R2_ENDPOINT = 'https://acct.r2.cloudflarestorage.com'
  process.env.R2_BUCKET = 'redeemo-test'
  process.env.R2_PUBLIC_BASE_URL = 'https://media.redeemo.co.uk'
}

const OWNER = 'b1f2c3d4-0000-4000-8000-000000000001'

describe('storage — disabled (STORAGE_ENABLED != true)', () => {
  it('presignPut throws clearly and does NOT construct the S3 client / require R2 secrets', async () => {
    // No R2 secrets set at all.
    await expect(
      storage.presignPut({ kind: 'logo', ownerId: OWNER, contentType: 'image/png', sizeBytes: 1000 }),
    ).rejects.toThrow(/STORAGE_ENABLED|storage.*disabled/i)
    expect(S3ClientCtor).not.toHaveBeenCalled()
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })

  it('presignGet throws when disabled', async () => {
    await expect(storage.presignGet('document/x/y.pdf')).rejects.toThrow(/STORAGE_ENABLED|storage.*disabled/i)
    expect(S3ClientCtor).not.toHaveBeenCalled()
  })

  it('putObject throws when disabled and does NOT construct the S3 client', async () => {
    await expect(
      storage.putObject({ kind: 'document', ownerId: OWNER, contentType: 'application/pdf', body: Buffer.from('x') }),
    ).rejects.toThrow(/STORAGE_ENABLED|storage.*disabled/i)
    expect(S3ClientCtor).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('deleteObject throws when disabled', async () => {
    await expect(storage.deleteObject('document/x/y.pdf')).rejects.toThrow(/STORAGE_ENABLED|storage.*disabled/i)
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('storage — presignPut (enabled)', () => {
  beforeEach(enableStorage)

  it('returns a presigned URL + a deterministic key (kind/ownerId/<random>.<ext>) and a SHORT TTL', async () => {
    const res = await storage.presignPut({ kind: 'logo', ownerId: OWNER, contentType: 'image/png', sizeBytes: 2048 })
    expect(res.url).toBe('https://r2.example/signed?sig=abc')
    expect(res.key).toMatch(new RegExp(`^logo/${OWNER}/[A-Za-z0-9_-]+\\.png$`))
    expect(res.expiresIn).toBeGreaterThan(0)
    expect(res.expiresIn).toBeLessThanOrEqual(600) // short-lived
    // a PutObjectCommand was signed with bucket + key + content-type
    const [, putCmd, opts] = getSignedUrlMock.mock.calls[0]
    expect(putCmd.input).toMatchObject({ Bucket: 'redeemo-test', Key: res.key, ContentType: 'image/png' })
    expect(opts).toMatchObject({ expiresIn: res.expiresIn })
  })

  it('the random key component is unique per call (no reuse)', async () => {
    const a = await storage.presignPut({ kind: 'photo', ownerId: OWNER, contentType: 'image/jpeg', sizeBytes: 1000 })
    const b = await storage.presignPut({ kind: 'photo', ownerId: OWNER, contentType: 'image/jpeg', sizeBytes: 1000 })
    expect(a.key).not.toBe(b.key)
  })

  it('maps content-type to the extension (jpeg→jpg, webp→webp, pdf→pdf)', async () => {
    const jpg = await storage.presignPut({ kind: 'banner', ownerId: OWNER, contentType: 'image/jpeg', sizeBytes: 10 })
    expect(jpg.key.endsWith('.jpg')).toBe(true)
    const webp = await storage.presignPut({ kind: 'photo', ownerId: OWNER, contentType: 'image/webp', sizeBytes: 10 })
    expect(webp.key.endsWith('.webp')).toBe(true)
    const pdf = await storage.presignPut({ kind: 'document', ownerId: OWNER, contentType: 'application/pdf', sizeBytes: 10 })
    expect(pdf.key.endsWith('.pdf')).toBe(true)
  })

  it('rejects a disallowed content-type per kind', async () => {
    // logo/banner/photo: jpg/png/webp only — gif disallowed
    await expect(
      storage.presignPut({ kind: 'logo', ownerId: OWNER, contentType: 'image/gif', sizeBytes: 10 }),
    ).rejects.toThrow(/content.?type/i)
    // document: pdf/jpg/png only — webp disallowed
    await expect(
      storage.presignPut({ kind: 'document', ownerId: OWNER, contentType: 'image/webp', sizeBytes: 10 }),
    ).rejects.toThrow(/content.?type/i)
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })

  it('rejects over-cap sizes per kind (photo > 5MB, document > 10MB)', async () => {
    await expect(
      storage.presignPut({ kind: 'photo', ownerId: OWNER, contentType: 'image/png', sizeBytes: 5 * 1024 * 1024 + 1 }),
    ).rejects.toThrow(/size|too large|exceeds/i)
    await expect(
      storage.presignPut({ kind: 'document', ownerId: OWNER, contentType: 'application/pdf', sizeBytes: 10 * 1024 * 1024 + 1 }),
    ).rejects.toThrow(/size|too large|exceeds/i)
  })

  it('allows sizes AT the cap (boundary)', async () => {
    await expect(
      storage.presignPut({ kind: 'logo', ownerId: OWNER, contentType: 'image/png', sizeBytes: 5 * 1024 * 1024 }),
    ).resolves.toMatchObject({ key: expect.any(String) })
  })

  it('rejects zero / negative sizes', async () => {
    await expect(
      storage.presignPut({ kind: 'logo', ownerId: OWNER, contentType: 'image/png', sizeBytes: 0 }),
    ).rejects.toThrow(/size/i)
  })

  it('rejects an unknown kind', async () => {
    await expect(
      // @ts-expect-error — exercising the runtime guard against a bad kind
      storage.presignPut({ kind: 'avatar', ownerId: OWNER, contentType: 'image/png', sizeBytes: 10 }),
    ).rejects.toThrow(/kind/i)
  })

  it('PATH-TRAVERSAL SAFE: rejects an ownerId with slashes / dot-dot / unsafe chars', async () => {
    for (const bad of ['../evil', 'a/b', 'owner/..', 'owner id', 'owner\\x', '']) {
      await expect(
        storage.presignPut({ kind: 'photo', ownerId: bad, contentType: 'image/png', sizeBytes: 10 }),
      ).rejects.toThrow(/owner/i)
    }
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })

  it('never uses a user-supplied filename — the object name is random, the ext comes from the content-type allowlist', async () => {
    // there is no filename input at all; assert the key body is random hex/url-safe, not anything caller-controlled
    const res = await storage.presignPut({ kind: 'photo', ownerId: OWNER, contentType: 'image/png', sizeBytes: 10 })
    const objectName = res.key.split('/').pop()!
    expect(objectName).toMatch(/^[A-Za-z0-9_-]+\.png$/)
  })
})

describe('storage — presignGet (private docs)', () => {
  beforeEach(enableStorage)

  it('signs a GET with a short TTL', async () => {
    const res = await storage.presignGet('document/owner/abc.pdf')
    expect(res.url).toBe('https://r2.example/signed?sig=abc')
    expect(res.expiresIn).toBeGreaterThan(0)
    expect(res.expiresIn).toBeLessThanOrEqual(600)
    const [, getCmd, opts] = getSignedUrlMock.mock.calls[0]
    expect(getCmd.input).toMatchObject({ Bucket: 'redeemo-test', Key: 'document/owner/abc.pdf' })
    expect(opts).toMatchObject({ expiresIn: res.expiresIn })
  })

  it('rejects a malformed / traversal key before signing', async () => {
    for (const bad of ['logo/../document/o/x.pdf', '/document/o/x.pdf', 'document/o/x.exe', 'foo/o/x.pdf', 'document/o/x', '../etc/passwd']) {
      await expect(storage.presignGet(bad)).rejects.toThrow(/invalid object key/i)
    }
    expect(getSignedUrlMock).not.toHaveBeenCalled()
  })
})

describe('storage — publicUrl', () => {
  beforeEach(enableStorage)

  it('composes R2_PUBLIC_BASE_URL + key for a public kind', () => {
    expect(storage.publicUrl('logo/owner/abc.png')).toBe('https://media.redeemo.co.uk/logo/owner/abc.png')
  })

  it('strips a trailing slash on the base URL', () => {
    process.env.R2_PUBLIC_BASE_URL = 'https://media.redeemo.co.uk/'
    expect(storage.publicUrl('photo/o/x.jpg')).toBe('https://media.redeemo.co.uk/photo/o/x.jpg')
  })

  it('REFUSES a public URL for a private document key (documents are not public)', () => {
    expect(() => storage.publicUrl('document/owner/secret.pdf')).toThrow(/private|document|public/i)
  })

  it('REFUSES a traversal key that tries to escape a public prefix into a private path', () => {
    // logo/../document/... must NOT pass — the kind-prefix check alone is bypassable,
    // so publicUrl validates the FULL key shape and rejects it.
    expect(() => storage.publicUrl('logo/../document/owner/secret.pdf')).toThrow(/invalid object key/i)
    expect(() => storage.publicUrl('/logo/owner/x.png')).toThrow(/invalid object key/i)
  })
})

describe('storage — parsePublicUrl (P1 add-URL ownership inverse of publicUrl)', () => {
  beforeEach(enableStorage) // sets R2_PUBLIC_BASE_URL = https://media.redeemo.co.uk

  it('inverts publicUrl(key) back to { kind, ownerId } (round-trip)', () => {
    const url = storage.publicUrl(`photo/${OWNER}/abcdef0123456789.png`)
    expect(storage.parsePublicUrl(url)).toEqual({ kind: 'photo', ownerId: OWNER })
  })

  it('parses a valid owned URL for each public kind', () => {
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/logo/o/x.png')).toEqual({ kind: 'logo', ownerId: 'o' })
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/banner/o/x.jpg')).toEqual({ kind: 'banner', ownerId: 'o' })
  })

  it('returns null for an EXTERNAL origin', () => {
    expect(storage.parsePublicUrl('https://evil.com/photo/o/x.png')).toBeNull()
  })

  it('returns null for a MALFORMED / extra-segment / traversal key', () => {
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/photo/o/a/b.png')).toBeNull() // extra segment
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/photo//x.png')).toBeNull()     // empty ownerId segment
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/photo/o/x')).toBeNull()         // no extension
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/photo/o/..%2f')).toBeNull()     // traversal
  })

  it('returns null for an empty string and a base-only URL', () => {
    expect(storage.parsePublicUrl('')).toBeNull()
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/')).toBeNull()
  })

  it('returns null when R2_PUBLIC_BASE_URL is unset (no origin to anchor against)', () => {
    delete process.env.R2_PUBLIC_BASE_URL
    expect(storage.parsePublicUrl('https://media.redeemo.co.uk/photo/o/x.png')).toBeNull()
  })
})

describe('storage - putObject (B4 server-proxied upload)', () => {
  beforeEach(enableStorage)

  it('writes the object and returns a deterministic key; sends ContentLength = body.length', async () => {
    const body = Buffer.from('%PDF-1.4 hello')
    const res = await storage.putObject({ kind: 'document', ownerId: OWNER, contentType: 'application/pdf', body })
    expect(res.key).toMatch(new RegExp(`^document/${OWNER}/[A-Za-z0-9_-]+\\.pdf$`))
    expect(sendMock).toHaveBeenCalledTimes(1)
    const cmd = sendMock.mock.calls[0][0]
    expect(cmd.input).toMatchObject({
      Bucket: 'redeemo-test',
      Key: res.key,
      Body: body,
      ContentType: 'application/pdf',
      ContentLength: body.length,
    })
  })

  it('HARD size enforcement: rejects a body over the 10MB document cap (no write)', async () => {
    const tooBig = Buffer.alloc(10 * 1024 * 1024 + 1)
    await expect(
      storage.putObject({ kind: 'document', ownerId: OWNER, contentType: 'application/pdf', body: tooBig }),
    ).rejects.toThrow(/size|exceeds|too large/i)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('allows a body AT the cap (boundary)', async () => {
    const atCap = Buffer.alloc(10 * 1024 * 1024)
    await expect(
      storage.putObject({ kind: 'document', ownerId: OWNER, contentType: 'application/pdf', body: atCap }),
    ).resolves.toMatchObject({ key: expect.any(String) })
  })

  it('rejects a disallowed content-type (no write)', async () => {
    await expect(
      storage.putObject({ kind: 'document', ownerId: OWNER, contentType: 'image/webp', body: Buffer.from('x') }),
    ).rejects.toThrow(/content.?type/i)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('rejects an empty body (no write)', async () => {
    await expect(
      storage.putObject({ kind: 'document', ownerId: OWNER, contentType: 'application/pdf', body: Buffer.alloc(0) }),
    ).rejects.toThrow(/body/i)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('PATH-TRAVERSAL SAFE: rejects an unsafe ownerId (no write)', async () => {
    for (const bad of ['../evil', 'a/b', 'owner id', '']) {
      await expect(
        storage.putObject({ kind: 'document', ownerId: bad, contentType: 'application/pdf', body: Buffer.from('x') }),
      ).rejects.toThrow(/owner/i)
    }
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('storage - deleteObject (B4)', () => {
  beforeEach(enableStorage)

  it('deletes by key (sends a DeleteObjectCommand with bucket + key)', async () => {
    await storage.deleteObject('document/owner/abc.pdf')
    expect(sendMock).toHaveBeenCalledTimes(1)
    const cmd = sendMock.mock.calls[0][0]
    expect(cmd.input).toMatchObject({ Bucket: 'redeemo-test', Key: 'document/owner/abc.pdf' })
  })

  it('rejects a malformed / traversal key before sending', async () => {
    for (const bad of ['logo/../document/o/x.pdf', '/document/o/x.pdf', 'document/o/x.exe', '../etc/passwd']) {
      await expect(storage.deleteObject(bad)).rejects.toThrow(/invalid object key/i)
    }
    expect(sendMock).not.toHaveBeenCalled()
  })
})

describe('storage — kind policies (introspectable)', () => {
  it('exposes the per-kind allowed content-types + size caps + visibility', () => {
    expect(storage.STORAGE_KINDS).toEqual(expect.arrayContaining(['document', 'logo', 'banner', 'photo']))
    const doc = storage.kindPolicy('document')
    expect(doc.maxBytes).toBe(10 * 1024 * 1024)
    expect(doc.visibility).toBe('private')
    expect(Object.keys(doc.contentTypes)).toEqual(expect.arrayContaining(['application/pdf', 'image/jpeg', 'image/png']))
    const photo = storage.kindPolicy('photo')
    expect(photo.maxBytes).toBe(5 * 1024 * 1024)
    expect(photo.visibility).toBe('public')
    expect(Object.keys(photo.contentTypes)).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/webp']))
  })
})
