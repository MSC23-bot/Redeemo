/**
 * Client-only session cache-isolation CORE (T1).
 *
 * A module-scope monotonically increasing counter - the single "which session
 * issued this work?" discriminator. It is bumped at EVERY session boundary
 * (signOut, the hard-logout teardown, and setSession on every login/verify path)
 * BEFORE any other teardown step, so an in-flight request or pending refresh
 * captured against an earlier epoch can be recognised as stale by the transport
 * layer (lib/api/client.ts) and discarded rather than delivered into a cache that
 * has since been cleared for a different account.
 *
 * The epoch is NOT part of any React Query key (no token/credential key material,
 * and key-partitioning would leak old-session cache entries until GC).
 *
 * See docs/superpowers/specs/2026-07-05-merchant-web-session-cache-isolation-design.md §4.1.
 */
let epoch = 0

export function getSessionEpoch(): number {
  return epoch
}

export function bumpSessionEpoch(): void {
  epoch += 1
}
