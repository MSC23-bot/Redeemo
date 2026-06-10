import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrismaClient } from '../../../generated/prisma/client'
import {
  scanImage,
  photoCountCap,
  assertPhotoCapNotExceeded,
  PHOTO_COUNT_CAP_DEFAULT,
} from '../../../src/api/shared/moderation'

// Phase 0 PR-0.6: the photo-safeguards module. scanImage() is provider-agnostic +
// FAIL-SAFE (never returns CLEAN without a real CLEAN), and the per-branch count
// cap. No real provider / network — env-driven only.

const VARS = ['MODERATION_ENABLED', 'MODERATION_PROVIDER', 'PHOTO_COUNT_CAP_PER_BRANCH'] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = {}
  for (const k of VARS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('scanImage — FAIL-SAFE, dark by default', () => {
  it('returns UNAVAILABLE by default (MODERATION_ENABLED unset) → photo stays PENDING', async () => {
    expect(await scanImage('https://x/y.jpg')).toBe('UNAVAILABLE')
  })

  it('returns UNAVAILABLE when enabled but provider is none', async () => {
    process.env.MODERATION_ENABLED = 'true'
    process.env.MODERATION_PROVIDER = 'none'
    expect(await scanImage('https://x/y.jpg')).toBe('UNAVAILABLE')
  })

  it('returns UNAVAILABLE (fail-safe) for an enabled-but-UNIMPLEMENTED provider', async () => {
    process.env.MODERATION_ENABLED = 'true'
    process.env.MODERATION_PROVIDER = 'rekognition'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await scanImage('https://x/y.jpg')).toBe('UNAVAILABLE')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not implemented'))
    warn.mockRestore()
  })

  it('returns UNAVAILABLE when explicitly disabled', async () => {
    process.env.MODERATION_ENABLED = 'false'
    process.env.MODERATION_PROVIDER = 'sightengine'
    expect(await scanImage('https://x/y.jpg')).toBe('UNAVAILABLE')
  })
})

describe('photoCountCap', () => {
  it('defaults to 15 (D5)', () => {
    expect(photoCountCap()).toBe(15)
    expect(PHOTO_COUNT_CAP_DEFAULT).toBe(15)
  })
  it('honours a positive-integer env override', () => {
    process.env.PHOTO_COUNT_CAP_PER_BRANCH = '20'
    expect(photoCountCap()).toBe(20)
  })
  it('falls back to the default on a non-positive / invalid value', () => {
    for (const bad of ['0', '-5', 'abc', '3.5']) {
      process.env.PHOTO_COUNT_CAP_PER_BRANCH = bad
      expect(photoCountCap()).toBe(15)
    }
  })
})

describe('assertPhotoCapNotExceeded', () => {
  function fakePrisma(count: number) {
    const countFn = vi.fn(async (_args: unknown) => count)
    return { prisma: { branchPhoto: { count: countFn } } as unknown as PrismaClient, countFn }
  }

  it('resolves when below the cap (boundary: cap-1 still allows one more)', async () => {
    const { prisma } = fakePrisma(14) // default cap 15 → 14 used, 1 slot left
    await expect(assertPhotoCapNotExceeded(prisma, 'b1')).resolves.toBeUndefined()
  })

  it('throws PHOTO_LIMIT_REACHED AT the cap', async () => {
    const { prisma } = fakePrisma(15)
    await expect(assertPhotoCapNotExceeded(prisma, 'b1')).rejects.toThrow(/PHOTO_LIMIT_REACHED/)
  })

  it('counts NON-FLAGGED rows only (FLAGGED do not occupy a slot)', async () => {
    const { prisma, countFn } = fakePrisma(0)
    await assertPhotoCapNotExceeded(prisma, 'b1')
    expect(countFn).toHaveBeenCalledWith({ where: { branchId: 'b1', moderationStatus: { not: 'FLAGGED' } } })
  })

  it('respects the env-overridden cap', async () => {
    process.env.PHOTO_COUNT_CAP_PER_BRANCH = '3'
    const below = fakePrisma(2)
    await expect(assertPhotoCapNotExceeded(below.prisma, 'b1')).resolves.toBeUndefined()
    const at = fakePrisma(3)
    await expect(assertPhotoCapNotExceeded(at.prisma, 'b1')).rejects.toThrow(/PHOTO_LIMIT_REACHED/)
  })
})
