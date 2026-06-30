// src/api/shared/pinDecrypt.ts
//
// Encryption key-rotation R1 — shared classifier for a branch-PIN decrypt() throw
// (Codex review findings 2 + 3, corrected per the Codex re-review of the Guard-10
// semantics). ONE place maps the typed crypto-boundary errors to controlled outcomes so
// the redemption Guard-10 and the two merchant PIN readers (getBranchPin / sendBranchPin)
// cannot drift.
//
// KEY SEMANTIC (Codex re-review): a decrypt() throw is ALWAYS a server/data fault, NEVER a
// user error. The submitted PIN is compared to the decrypted plaintext AFTER decryption
// succeeds (redemption/service.ts), so it is never a decryption input — a user entering the
// wrong PIN therefore takes the successful-decrypt-then-plaintext-inequality path (handled
// by the caller), which is the ONLY silent INVALID_PIN path. Accordingly EVERY bucket here
// fails LOUDLY with a controlled AppError + a redacted operational alert, and NONE is
// silenced into INVALID_PIN or counted against the wrong-PIN lockout counter:
//
//   - KeyNotAvailableError → AppError('KEY_NOT_AVAILABLE')        (key absent/retired)
//   - EnvelopeParseError   → AppError('REDEMPTION_PIN_UNREADABLE') (malformed stored value)
//   - GcmAuthError         → AppError('REDEMPTION_PIN_UNREADABLE') (stored ciphertext failed
//                            AUTHENTICATION under the configured key: wrong key bytes,
//                            tampering, or corruption — NOT a wrong PIN)
//   - anything else        → AppError('REDEMPTION_PIN_UNREADABLE') (unexpected/runtime fault)
//
// The alert payload carries ONLY { code, branchId, (kid via the typed error's already
// redacted message), name } — never the stored ciphertext, the submitted plaintext PIN, or
// key bytes (request-path logging redaction, spec §3.10 / §3.11).

import { AppError } from './errors'
import { KeyNotAvailableError, EnvelopeParseError, GcmAuthError } from './keyring'

export function classifyPinDecryptError(
  err: unknown,
  opts: { branchId: string; source: string },
): AppError {
  const { branchId, source } = opts

  if (err instanceof KeyNotAvailableError) {
    // err.message = `No key available for pin kid "<safeKidLabel>"` — the kid is a safe
    // (redacted-if-invalid) index label, never key bytes (spec §3.10 "branch id + kid + code").
    console.error(`[${source}] decrypt: key unavailable`, {
      code: 'KEY_NOT_AVAILABLE',
      branchId,
      detail: err.message,
    })
    return new AppError('KEY_NOT_AVAILABLE')
  }

  if (err instanceof EnvelopeParseError) {
    console.error(`[${source}] decrypt: corrupt stored PIN value`, {
      code: 'REDEMPTION_PIN_UNREADABLE',
      branchId,
    })
    return new AppError('REDEMPTION_PIN_UNREADABLE')
  }

  if (err instanceof GcmAuthError) {
    // The resolved key + iv did not AUTHENTICATE the stored ciphertext. This is a
    // server/data-integrity fault (wrong key bytes / tampering / corruption), NOT a user
    // entering the wrong PIN — so it fails LOUDLY + alerts + does NOT touch the wrong-PIN
    // counter (silencing it would recreate the silent branch outage R1 prevents).
    console.error(`[${source}] decrypt: stored PIN failed authentication`, {
      code: 'REDEMPTION_PIN_UNREADABLE',
      branchId,
    })
    return new AppError('REDEMPTION_PIN_UNREADABLE')
  }

  // Unknown / unexpected (programming or runtime) — MUST fail loudly + be observable.
  // Log only the error NAME (e.g. "TypeError"), never its message/stack.
  console.error(`[${source}] decrypt: unexpected error`, {
    code: 'PIN_DECRYPT_UNEXPECTED',
    branchId,
    name: err instanceof Error ? err.name : 'unknown',
  })
  return new AppError('REDEMPTION_PIN_UNREADABLE')
}
