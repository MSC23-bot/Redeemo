// src/api/shared/pinDecrypt.ts
//
// Encryption key-rotation R1 — shared classifier for a branch-PIN decrypt() throw
// (Codex review findings 2 + 3). ONE place maps the typed crypto-boundary errors to
// controlled outcomes so the redemption Guard-10 and the two merchant PIN readers
// (getBranchPin / sendBranchPin) cannot drift:
//
//   - KeyNotAvailableError  → LOUD: AppError('KEY_NOT_AVAILABLE')        + redacted alert
//   - EnvelopeParseError    → LOUD: AppError('REDEMPTION_PIN_UNREADABLE') + redacted alert
//   - GcmAuthError          → genuine AES-GCM auth mismatch. SILENT (a real wrong-PIN)
//                             ONLY where the caller compares a user-submitted PIN
//                             (redemption, silenceGcmMismatch:true). At a pure READER
//                             there is no submitted PIN, so an un-authenticating stored
//                             value is an unreadable PIN → LOUD REDEMPTION_PIN_UNREADABLE.
//   - anything else         → an unexpected/runtime fault. NEVER silently swallowed into
//                             INVALID_PIN: LOUD AppError('REDEMPTION_PIN_UNREADABLE') +
//                             a redacted, observable alert (code + branchId + err.name).
//
// The alert payload carries ONLY { code, branchId, (kid via the typed error's already
// redacted message), name } — never the stored ciphertext, the submitted plaintext PIN,
// or key bytes (request-path logging redaction, spec §3.10 / §3.11).

import { AppError } from './errors'
import { KeyNotAvailableError, EnvelopeParseError, GcmAuthError } from './keyring'

export type PinDecryptOutcome = { silent: true } | { silent: false; appError: AppError }

export function classifyPinDecryptError(
  err: unknown,
  opts: { branchId: string; source: string; silenceGcmMismatch: boolean },
): PinDecryptOutcome {
  const { branchId, source } = opts

  if (err instanceof KeyNotAvailableError) {
    // err.message = `No key available for pin kid "<safeKidLabel>"` — the kid is a safe
    // (redacted-if-invalid) index label, never key bytes (spec §3.10 "branch id + kid + code").
    console.error(`[${source}] decrypt: key unavailable`, {
      code: 'KEY_NOT_AVAILABLE',
      branchId,
      detail: err.message,
    })
    return { silent: false, appError: new AppError('KEY_NOT_AVAILABLE') }
  }

  if (err instanceof EnvelopeParseError) {
    console.error(`[${source}] decrypt: corrupt stored PIN value`, {
      code: 'REDEMPTION_PIN_UNREADABLE',
      branchId,
    })
    return { silent: false, appError: new AppError('REDEMPTION_PIN_UNREADABLE') }
  }

  if (err instanceof GcmAuthError) {
    // The resolved key + iv did not authenticate the ciphertext.
    if (opts.silenceGcmMismatch) return { silent: true } // genuine wrong-PIN at a compare site
    // At a pure reader this is an unreadable stored value → loud (and alerted).
    console.error(`[${source}] decrypt: stored PIN failed authentication`, {
      code: 'REDEMPTION_PIN_UNREADABLE',
      branchId,
    })
    return { silent: false, appError: new AppError('REDEMPTION_PIN_UNREADABLE') }
  }

  // Unknown / unexpected (programming or runtime) — MUST fail loudly + be observable,
  // never silently become INVALID_PIN. Log only the error NAME (e.g. "TypeError"),
  // never its message/stack (which we cannot prove is secret-free).
  console.error(`[${source}] decrypt: unexpected error`, {
    code: 'PIN_DECRYPT_UNEXPECTED',
    branchId,
    name: err instanceof Error ? err.name : 'unknown',
  })
  return { silent: false, appError: new AppError('REDEMPTION_PIN_UNREADABLE') }
}
