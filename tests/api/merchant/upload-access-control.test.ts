import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

// Staff & Access PR-B (B5): merchant image upload is split by `:kind`:
//   - kind === 'photo'           -> assertCanManageVouchers (OWNER || canManageVouchers)
//   - kind === 'logo' | 'banner' -> assertOwner (feeds OWNER-only business identity)
// The guard runs AFTER resolveMerchantContext (role-aware) and BEFORE any bytes are
// read. Storage is module-mocked so a SUCCESS path never touches real R2.

const { putObjectMock } = vi.hoisted(() => ({ putObjectMock: vi.fn() }))
vi.mock('../../../src/api/shared/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/shared/storage')>()
  return { ...actual, putObject: putObjectMock }
})

function pngBuffer(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrLen = Buffer.alloc(4); ihdrLen.writeUInt32BE(13, 0)
  const ihdrType = Buffer.from('IHDR', 'ascii')
  const dims = Buffer.alloc(13); dims.writeUInt32BE(width, 0); dims.writeUInt32BE(height, 4)
  return Buffer.concat([sig, ihdrLen, ihdrType, dims])
}

function multipartPayload(file: { filename: string; contentType: string; content: Buffer }): { body: Buffer; contentType: string } {
  const boundary = '----b5authuploadtestboundary'
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`,
    'utf8',
  )
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  return { body: Buffer.concat([head, file.content, tail]), contentType: `multipart/form-data; boundary=${boundary}` }
}

type Role = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'

function membershipRow(role: Role, canManageVouchers: boolean) {
  return {
    id: 'mm1', merchantId: 'm1', merchantAdminId: 'ma1', role,
    allBranches: true, canManageVouchers,
    merchant: { status: 'ACTIVE', businessName: 'Acme' }, branches: [],
  }
}

const validForKind: Record<string, Buffer> = {
  logo: pngBuffer(512, 512),
  banner: pngBuffer(1600, 600),
  photo: pngBuffer(1200, 600),
}

describe('merchant upload authorization split by kind (B5)', () => {
  let app: FastifyInstance | null = null
  let savedStorageEnabled: string | undefined
  let savedPublicBase: string | undefined

  beforeEach(() => {
    savedStorageEnabled = process.env.STORAGE_ENABLED
    savedPublicBase = process.env.R2_PUBLIC_BASE_URL
    process.env.STORAGE_ENABLED = 'true'
    process.env.R2_PUBLIC_BASE_URL = 'https://cdn.example'
    putObjectMock.mockReset()
  })

  afterEach(async () => {
    if (app) { await app.close(); app = null }
    if (savedStorageEnabled === undefined) delete process.env.STORAGE_ENABLED
    else process.env.STORAGE_ENABLED = savedStorageEnabled
    if (savedPublicBase === undefined) delete process.env.R2_PUBLIC_BASE_URL
    else process.env.R2_PUBLIC_BASE_URL = savedPublicBase
  })

  async function makeApp(role: Role, canManageVouchers: boolean) {
    const a = await buildApp()
    a.decorate('prisma', {
      merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: 'm1' }) },
      merchantMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([membershipRow(role, canManageVouchers)]),
      },
    } as any)
    a.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK'), exists: vi.fn().mockResolvedValue(1) } as any)
    await a.ready()
    const token = (a.jwt as any).merchant.sign({ sub: 'ma1', role: 'merchant', deviceId: 'd1', sessionId: 's1' }, { expiresIn: '1h' })
    return { a, token }
  }

  async function post(role: Role, cmv: boolean, kind: string) {
    const made = await makeApp(role, cmv)
    app = made.a
    // On the allowed path the service writes the object + composes the public URL;
    // give putObject a deterministic key so a SUCCESS path returns 200 (denied paths
    // throw at the guard, before this is ever called).
    putObjectMock.mockResolvedValue({ key: `${kind}/m1/abcdef0123456789.png` })
    const payload = multipartPayload({ filename: `${kind}.png`, contentType: 'image/png', content: validForKind[kind] })
    return made.a.inject({
      method: 'POST', url: `/api/v1/merchant/uploads/${kind}`,
      headers: { authorization: `Bearer ${made.token}`, 'content-type': payload.contentType },
      payload: payload.body,
    })
  }

  // OWNER: all kinds allowed
  for (const kind of ['logo', 'banner', 'photo']) {
    it(`OWNER can upload ${kind} (200)`, async () => {
      const res = await post('OWNER', false, kind)
      expect(res.statusCode).toBe(200)
    })
  }

  // BRANCH_MANAGER + canManageVouchers: photo allowed, logo/banner denied
  it('BRANCH_MANAGER+MV can upload photo (200)', async () => {
    const res = await post('BRANCH_MANAGER', true, 'photo')
    expect(res.statusCode).toBe(200)
  })
  for (const kind of ['logo', 'banner']) {
    it(`BRANCH_MANAGER+MV denied ${kind} -> 403 (assertOwner)`, async () => {
      const res = await post('BRANCH_MANAGER', true, kind)
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    })
  }

  // BRANCH_MANAGER without canManageVouchers: photo denied too
  it('BRANCH_MANAGER without MV denied photo -> 403 (assertCanManageVouchers)', async () => {
    const res = await post('BRANCH_MANAGER', false, 'photo')
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })

  // STAFF: denied every kind
  for (const kind of ['logo', 'banner', 'photo']) {
    it(`STAFF denied ${kind} -> 403`, async () => {
      const res = await post('STAFF', false, kind)
      expect(res.statusCode).toBe(403)
      expect(JSON.parse(res.body).error.code).toBe('INSUFFICIENT_PERMISSIONS')
    })
  }
})
