import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Phase 0 PR-0.3: the Resend email CLIENT wrapper. Pins the dark/sandbox safety
// rails + the D-F sender policy. The `resend` SDK is fully MOCKED — no real API
// key, no network. Nothing here writes CommunicationLog/Notification or touches
// BullMQ — that's PR-0.4.

// vi.hoisted so these exist when the hoisted vi.mock factory runs.
const { sendMock, ResendCtor } = vi.hoisted(() => {
  const sendMock = vi.fn()
  // A regular function (not an arrow) so `new Resend(...)` works as a constructor.
  const ResendCtor = vi.fn(function () {
    return { emails: { send: sendMock } }
  })
  return { sendMock, ResendCtor }
})
vi.mock('resend', () => ({ Resend: ResendCtor }))

// Re-imported fresh per test (below) so email.ts's lazy Resend singleton resets
// between cases — otherwise the client is memoised after the first enabled send
// and ResendCtor stops being called.
let sendEmail: typeof import('../../../src/api/shared/email').sendEmail

// Capture + restore every env var this suite touches.
const EMAIL_VARS = [
  'EMAIL_ENABLED',
  'EMAIL_SANDBOX',
  'EMAIL_SANDBOX_ALLOWLIST',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_REPLY_TO',
  'RESEND_MERCHANT_FROM',
] as const
let saved: Record<string, string | undefined>

beforeEach(async () => {
  saved = {}
  for (const k of EMAIL_VARS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
  sendMock.mockReset()
  ResendCtor.mockClear()
  sendMock.mockResolvedValue({ data: { id: 're_mock_id_123' }, error: null })
  vi.resetModules() // fresh email.ts → lazy client singleton reset
  ;({ sendEmail } = await import('../../../src/api/shared/email'))
})

afterEach(() => {
  for (const k of EMAIL_VARS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const base = { to: 'user@example.com', subject: 'Hi', html: '<p>hi</p>' }

describe('sendEmail — disabled (EMAIL_ENABLED != true)', () => {
  it('skips with NO network call when EMAIL_ENABLED is unset', async () => {
    const res = await sendEmail(base)
    expect(res).toEqual({ skipped: true, reason: 'disabled' })
    expect(sendMock).not.toHaveBeenCalled()
    expect(ResendCtor).not.toHaveBeenCalled() // never even constructs the client
  })

  it('skips when EMAIL_ENABLED=false', async () => {
    process.env.EMAIL_ENABLED = 'false'
    const res = await sendEmail(base)
    expect(res).toEqual({ skipped: true, reason: 'disabled' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('does NOT require RESEND_API_KEY when disabled (no boot/secret dependency)', async () => {
    // RESEND_API_KEY intentionally unset — a disabled send must not throw.
    await expect(sendEmail(base)).resolves.toEqual({ skipped: true, reason: 'disabled' })
  })
})

describe('sendEmail — enabled, no sandbox', () => {
  beforeEach(() => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_a_real_key'
  })

  it('sends via Resend with the D-F From + Reply-To defaults and returns the externalId', async () => {
    const res = await sendEmail(base)
    expect(res).toEqual({ skipped: false, externalId: 're_mock_id_123', status: 'sent' })
    expect(ResendCtor).toHaveBeenCalledWith('re_a_real_key')
    expect(sendMock).toHaveBeenCalledTimes(1)
    const [payload] = sendMock.mock.calls[0]
    expect(payload.from).toBe('Redeemo <noreply@redeemo.co.uk>') // D-F default
    expect(payload.replyTo).toBe('support@redeemo.co.uk') // D-F reply-to
    expect(payload.to).toBe('user@example.com') // not redirected (sandbox off)
    expect(payload.subject).toBe('Hi')
    expect(payload.html).toBe('<p>hi</p>')
  })

  it('honours RESEND_FROM_EMAIL / RESEND_REPLY_TO overrides from env', async () => {
    process.env.RESEND_FROM_EMAIL = 'Redeemo <hello@redeemo.co.uk>'
    process.env.RESEND_REPLY_TO = 'help@redeemo.co.uk'
    await sendEmail(base)
    const [payload] = sendMock.mock.calls[0]
    expect(payload.from).toBe('Redeemo <hello@redeemo.co.uk>')
    expect(payload.replyTo).toBe('help@redeemo.co.uk')
  })

  it("sender: 'merchant' uses the merchants@ From (D-F merchant policy)", async () => {
    const res = await sendEmail({ ...base, sender: 'merchant' })
    expect(res).toMatchObject({ skipped: false })
    const [payload] = sendMock.mock.calls[0]
    expect(payload.from).toBe('Redeemo Merchants <merchants@redeemo.co.uk>')
  })

  it('explicit from / replyTo overrides beat the defaults', async () => {
    await sendEmail({ ...base, from: 'Custom <x@redeemo.co.uk>', replyTo: 'y@redeemo.co.uk' })
    const [payload] = sendMock.mock.calls[0]
    expect(payload.from).toBe('Custom <x@redeemo.co.uk>')
    expect(payload.replyTo).toBe('y@redeemo.co.uk')
  })

  it('passes the idempotencyKey to Resend as the request option', async () => {
    await sendEmail({ ...base, idempotencyKey: 'comm-log-id-42' })
    const [, options] = sendMock.mock.calls[0]
    expect(options).toMatchObject({ idempotencyKey: 'comm-log-id-42' })
  })

  it('omits the idempotency option when no key is given', async () => {
    await sendEmail(base)
    const [, options] = sendMock.mock.calls[0]
    expect(options?.idempotencyKey).toBeUndefined()
  })

  it('forwards optional text alongside html', async () => {
    await sendEmail({ ...base, text: 'hi (plain)' })
    const [payload] = sendMock.mock.calls[0]
    expect(payload.text).toBe('hi (plain)')
  })

  it('throws when Resend returns an error (so callers/workers can retry)', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { name: 'rate_limit_exceeded', message: 'slow down' } })
    await expect(sendEmail(base)).rejects.toThrow(/slow down/)
  })
})

describe('sendEmail — sandbox redirect (EMAIL_SANDBOX=true)', () => {
  beforeEach(() => {
    process.env.EMAIL_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_a_real_key'
    process.env.EMAIL_SANDBOX = 'true'
  })

  it('rewrites the recipient to the allowlist (no mail to the real address)', async () => {
    process.env.EMAIL_SANDBOX_ALLOWLIST = 'qa@redeemo.co.uk'
    await sendEmail({ ...base, to: 'real-customer@gmail.com' })
    const [payload] = sendMock.mock.calls[0]
    expect(payload.to).toEqual(['qa@redeemo.co.uk'])
    expect(JSON.stringify(payload)).not.toContain('real-customer@gmail.com')
  })

  it('supports a multi-address allowlist (comma-separated)', async () => {
    process.env.EMAIL_SANDBOX_ALLOWLIST = 'qa@redeemo.co.uk, dev@redeemo.co.uk'
    await sendEmail({ ...base, to: 'real-customer@gmail.com' })
    const [payload] = sendMock.mock.calls[0]
    expect(payload.to).toEqual(['qa@redeemo.co.uk', 'dev@redeemo.co.uk'])
  })

  it('REFUSES to send when sandbox is on but the allowlist is empty (fail-safe)', async () => {
    process.env.EMAIL_SANDBOX_ALLOWLIST = '   '
    const res = await sendEmail({ ...base, to: 'real-customer@gmail.com' })
    expect(res).toEqual({ skipped: true, reason: 'sandbox-no-allowlist' })
    expect(sendMock).not.toHaveBeenCalled() // never sends to the real address
  })
})
