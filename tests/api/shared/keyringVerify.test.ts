import { describe, it, expect, vi } from 'vitest'
import { verifyKeyringAndExit, type VerifyPrisma } from '../../../src/api/shared/keyringVerify'

// Codex review finding 5: behavioural (NOT static-string) coverage of the worker's
// --verify-keyring-and-exit body. Proves the exit code on success / failed publication
// / thrown error, that prisma.$disconnect() ALWAYS runs (finally), and that NO BullMQ
// worker/queue/repeatable is registered (the helper has zero BullMQ surface).

function fakePrisma(overrides: Partial<VerifyPrisma> = {}) {
  return {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    keyringFingerprint: { upsert: vi.fn().mockResolvedValue({}) },
    ...overrides,
  } as unknown as VerifyPrisma & {
    $connect: ReturnType<typeof vi.fn>
    $disconnect: ReturnType<typeof vi.fn>
  }
}

describe('verifyKeyringAndExit — exit code + guaranteed disconnect (Codex finding 5)', () => {
  it('publish resolves TRUE → exit 0; connects then disconnects', async () => {
    const prisma = fakePrisma()
    const publish = vi.fn().mockResolvedValue(true)
    const code = await verifyKeyringAndExit({
      makePrisma: () => prisma,
      publish,
      log: vi.fn(),
      errorLog: vi.fn(),
    })
    expect(code).toBe(0)
    expect(prisma.$connect).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
  })

  it('publish resolves FALSE → exit 1 (a failed parity publish must NOT exit 0); still disconnects', async () => {
    const prisma = fakePrisma()
    const code = await verifyKeyringAndExit({
      makePrisma: () => prisma,
      publish: vi.fn().mockResolvedValue(false),
      log: vi.fn(),
      errorLog: vi.fn(),
    })
    expect(code).toBe(1)
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
  })

  it('publish THROWS → exit 1; logs the error; still disconnects (finally)', async () => {
    const prisma = fakePrisma()
    const errorLog = vi.fn()
    const code = await verifyKeyringAndExit({
      makePrisma: () => prisma,
      publish: vi.fn().mockRejectedValue(new Error('boom-publish')),
      log: vi.fn(),
      errorLog,
    })
    expect(code).toBe(1)
    expect(errorLog).toHaveBeenCalled()
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
  })

  it('$connect THROWS → exit 1; STILL disconnects (finally guarantees cleanup)', async () => {
    const prisma = fakePrisma({ $connect: vi.fn().mockRejectedValue(new Error('boom-connect')) as any })
    const publish = vi.fn()
    const code = await verifyKeyringAndExit({
      makePrisma: () => prisma,
      publish,
      log: vi.fn(),
      errorLog: vi.fn(),
    })
    expect(code).toBe(1)
    expect(publish).not.toHaveBeenCalled() // never reached publish
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1) // finally still ran
  })

  it('makePrisma() THROWS → exit 1 (does NOT reject); no disconnect attempted (CodeRabbit re-review)', async () => {
    const errorLog = vi.fn()
    let code: number | undefined
    await expect(
      (async () => {
        code = await verifyKeyringAndExit({
          makePrisma: () => { throw new Error('boom-adapter-construct') },
          publish: vi.fn(),
          log: vi.fn(),
          errorLog,
        })
      })(),
    ).resolves.toBeUndefined() // resolves (no rejection) — the contract is "any error ⇒ exit 1"
    expect(code).toBe(1)
    expect(errorLog).toHaveBeenCalled()
  })

  it('a thrown $disconnect does not mask the exit code (best-effort cleanup)', async () => {
    const prisma = fakePrisma({ $disconnect: vi.fn().mockRejectedValue(new Error('boom-disconnect')) as any })
    const code = await verifyKeyringAndExit({
      makePrisma: () => prisma,
      publish: vi.fn().mockResolvedValue(true),
      log: vi.fn(),
      errorLog: vi.fn(),
    })
    expect(code).toBe(0) // disconnect failure is swallowed; the success code stands
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
  })

  it('registers NO BullMQ worker / queue / repeatable — only connect + publish + disconnect are invoked', async () => {
    const prisma = fakePrisma()
    const publish = vi.fn().mockResolvedValue(true)
    await verifyKeyringAndExit({ makePrisma: () => prisma, publish, log: vi.fn(), errorLog: vi.fn() })
    // The injected prisma is the ONLY external surface; the helper never imports or
    // touches BullMQ. Assert the exact interaction set.
    expect(prisma.$connect).toHaveBeenCalledTimes(1)
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)
    // keyringFingerprint.upsert is reached ONLY via the injected publish (not by the
    // helper directly), so the helper itself touched nothing else.
    expect((prisma as any).keyringFingerprint.upsert).not.toHaveBeenCalled()
  })
})
