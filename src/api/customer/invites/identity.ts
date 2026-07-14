// src/api/customer/invites/identity.ts
//
// Pure helpers for the customer merchant-invite programme (M0). No I/O, no
// Prisma — everything here is unit-testable in isolation. `submitInvite` in
// ./service.ts is the only caller.

import crypto from 'node:crypto'

/**
 * Lowercase + trim (mirrors normalizeEmail in ../../shared/pwdResetLimiter.ts).
 * Feeds the Phase-2 ANONYMOUS lane only (the reserved 'e:'-prefixed
 * inviterKey form below, keyed off a verified-but-unregistered email).
 * Phase 1 (signed-in) persists NO email at all — see buildInviterKey.
 */
export function normalizeInviterEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Canonical, STABLE inviter identity for the (inviterKey, placeKey)
 * invariant. HONEST CLASSIFICATION (correction round 3): while the account
 * exists this is PSEUDONYMOUS PERSONAL DATA (it resolves to a user);
 * account deletion SEVERS it (nulled with inviterUserId by
 * scrubInvitesForUser), after which the row is non-personal aggregate
 * demand. It is identity for dedupe, never a privacy control.
 * uniqueness invariant. `'u:' + userId` for registered inviters — stable
 * across account-email changes, so a changed email can never bypass the
 * person+business dedupe. The Phase-2 anonymous lane's reserved form,
 * `'e:' + keyedHash(emailNorm)`, is NOT implemented here — do not implement
 * it in this round.
 */
export function buildInviterKey(userId: string): string {
  return `u:${userId}`
}

/**
 * Slugify a free-text fragment for the fuzzy placeKey (buildPlaceKey below):
 * lowercase, diacritics stripped (NFD decomposition + combining-mark strip),
 * every run of non [a-z0-9] characters collapsed to a single '-', leading/
 * trailing '-' trimmed. Empty input (or input that slugifies to nothing, e.g.
 * pure punctuation) resolves to the literal 'unknown' sentinel so placeKey
 * never ends with a bare/dangling separator.
 */
export function slugForPlaceKey(s: string): string {
  const slug = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks (post-NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'unknown' : slug
}

/**
 * Canonical business identity key for a MerchantInvite. Places-resolved
 * businesses key on the Google Place id (stable across name/spelling
 * changes); everything else falls back to a fuzzy name+locality slug. NEVER
 * derived client-side — the server is the sole source of placeKey.
 */
export function buildPlaceKey(input: {
  googlePlaceId?: string | null
  businessName: string
  locality?: string | null
}): string {
  if (input.googlePlaceId) return `gp:${input.googlePlaceId}`
  return `fz:${slugForPlaceKey(input.businessName)}:${slugForPlaceKey(input.locality ?? '')}`
}

/**
 * Keyless SHA-256 truncation of a submitting IP — mirrors hashEmail in
 * ../../shared/pwdResetLimiter.ts EXACTLY (sha256 hex, first 32 chars). Raw
 * IPs are NEVER persisted on MerchantInvite rows; only this hash is stored
 * (ipHash), and it is nulled by the anonymise sweep.
 */
export function hashInviteIp(ip: string): string {
  return crypto.createHash('sha256').update(ip.trim()).digest('hex').slice(0, 32)
}

// Small starter list of terms that hold an invite for admin review instead of
// rejecting it outright — the note is kept (it may be genuine useful
// context), but the invite does not count as demand evidence until an admin
// looks at it. Case-insensitive substring match.
export const HELD_REVIEW_TERMS = ['scam', 'lawsuit', 'refund me', 'hate'] as const

const NOTE_MAX_LENGTH = 240
const URL_PATTERN = /(https?:\/\/|www\.)/i

export type ValidateInviteNoteResult =
  | { ok: true; note: string | null; held: boolean }
  | { ok: false; code: 'INVITE_NOTE_INVALID' }

/**
 * Validate + classify an optional invite note. Never throws — callers decide
 * how to surface the `ok: false` case (service.ts throws AppError('INVITE_NOTE_INVALID')).
 */
export function validateInviteNote(note: string | undefined | null): ValidateInviteNoteResult {
  if (note === undefined || note === null) return { ok: true, note: null, held: false }

  const trimmed = note.trim()
  if (trimmed === '') return { ok: true, note: null, held: false }

  if (trimmed.length > NOTE_MAX_LENGTH) return { ok: false, code: 'INVITE_NOTE_INVALID' }
  if (URL_PATTERN.test(trimmed)) return { ok: false, code: 'INVITE_NOTE_INVALID' }

  const lower = trimmed.toLowerCase()
  const held = HELD_REVIEW_TERMS.some((term) => lower.includes(term))

  return { ok: true, note: trimmed, held }
}
