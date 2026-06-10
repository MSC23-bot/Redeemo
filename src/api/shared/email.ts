// src/api/shared/email.ts
//
// Phase 0 PR-0.3: the Resend email CLIENT wrapper. This is the low-level send
// surface only — it does NOT write CommunicationLog/Notification or enqueue
// anything (that's the PR-0.4 notify dispatcher + email worker). It exists so
// the rest of Phase 0 has ONE safe place to send transactional email through.
//
// Two safety rails make this safe to ship "dark":
//   - EMAIL_ENABLED (master switch). Off (the default) ⇒ no network call, no
//     client construction, no RESEND_API_KEY needed. Returns { skipped: true }.
//     Production email stays OFF until the runbook §6 pre-send gates are met (§13).
//   - EMAIL_SANDBOX. On ⇒ every recipient is rewritten to EMAIL_SANDBOX_ALLOWLIST
//     so no test mail can reach a real address; if the allowlist is empty we
//     REFUSE to send (fail-safe) rather than risk a real send.
//
// Sender identity follows the locked D-F policy:
//   default  → RESEND_FROM_EMAIL      (Redeemo <noreply@redeemo.co.uk>)
//   merchant → RESEND_MERCHANT_FROM   (Redeemo Merchants <merchants@redeemo.co.uk>)
//   reply-to → RESEND_REPLY_TO        (support@redeemo.co.uk)

import { Resend } from 'resend'
import { requireSecret } from './env'

// D-F sender policy defaults (overridable via env; used when env is unset).
const DF_FROM = 'Redeemo <noreply@redeemo.co.uk>'
const DF_MERCHANT_FROM = 'Redeemo Merchants <merchants@redeemo.co.uk>'
const DF_REPLY_TO = 'support@redeemo.co.uk'

export interface SendEmailInput {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Which sender identity to use (D-F policy). Default: 'default' (noreply@). */
  sender?: 'default' | 'merchant'
  /** Explicit From override — beats `sender`. */
  from?: string
  /** Reply-To override — defaults to RESEND_REPLY_TO. */
  replyTo?: string
  /** Forwarded to Resend as the Idempotency-Key header (PR-0.4 passes the CommunicationLog id). */
  idempotencyKey?: string
}

export type SendEmailResult =
  | { skipped: true; reason: 'disabled' | 'sandbox-no-allowlist' }
  | { skipped: false; externalId: string; status: 'sent' }

const isEmailEnabled = (): boolean => (process.env.EMAIL_ENABLED ?? '') === 'true'
const isSandbox = (): boolean => (process.env.EMAIL_SANDBOX ?? '') === 'true'

function sandboxAllowlist(): string[] {
  return (process.env.EMAIL_SANDBOX_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolveFrom(input: SendEmailInput): string {
  if (input.from) return input.from
  if (input.sender === 'merchant') return process.env.RESEND_MERCHANT_FROM || DF_MERCHANT_FROM
  return process.env.RESEND_FROM_EMAIL || DF_FROM
}

// Lazy singleton — constructed only on the first ENABLED send, so a disabled
// deploy never needs RESEND_API_KEY.
let client: Resend | null = null
function resendClient(): Resend {
  if (!client) client = new Resend(requireSecret('RESEND_API_KEY'))
  return client
}

/**
 * Send one transactional email through Resend, honouring the EMAIL_ENABLED /
 * EMAIL_SANDBOX rails + the D-F sender policy.
 *
 * Returns `{ skipped: true, reason }` when outbound is off or sandbox can't
 * safely redirect — NEVER throws on a skip. On an enabled send it returns
 * `{ skipped: false, externalId, status: 'sent' }`, and THROWS if Resend
 * reports an error (so the PR-0.4 worker can retry).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    console.info(`[email] skipped (EMAIL_ENABLED != true) — would have sent "${input.subject}"`)
    return { skipped: true, reason: 'disabled' }
  }

  let to = input.to
  if (isSandbox()) {
    const allow = sandboxAllowlist()
    if (allow.length === 0) {
      console.warn(
        '[email] EMAIL_SANDBOX=true but EMAIL_SANDBOX_ALLOWLIST is empty — refusing to send (no safe redirect target)',
      )
      return { skipped: true, reason: 'sandbox-no-allowlist' }
    }
    console.info(`[email] sandbox redirect — ${Array.isArray(input.to) ? input.to.length : 1} recipient(s) redirected to ${allow.join(', ')}`)
    to = allow
  }

  const { data, error } = await resendClient().emails.send(
    {
      from: resolveFrom(input),
      to,
      replyTo: input.replyTo ?? process.env.RESEND_REPLY_TO ?? DF_REPLY_TO,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  )

  if (error) {
    throw new Error(`[email] Resend send failed: ${error.message ?? error.name ?? 'unknown error'}`)
  }
  return { skipped: false, externalId: data?.id ?? '', status: 'sent' }
}
