# Design spec: merchant logout durability (backend/BFF) - in-flight-refresh cannot restore a logged-out account

Status: DRAFT design spec, PLANNING ONLY. Separate backend/BFF track from the client-side cache-isolation design (`docs/superpowers/specs/2026-07-05-merchant-web-session-cache-isolation-design.md` section 10). Implementation is OWNER-GATED and requires its own approval + a fresh review; NO backend/Redis/provider action is taken by this document.
Provenance: source inspection against main `3a097161`. Every file:line cites that commit.
Origin: Codex Wave 11 accepted Option A (reliable server-side revocation) in principle for the cookie-arm logout-durability defect; the client PR deliberately scopes it out. This doc specifies it.

## 1. The defect (source-grounded)

Logout is not durable against a `/refresh` that is in flight when logout fires. Two layers see it:

- **Client/BFF cookie arm** (from the client design section 3): the `/refresh` BFF route (`apps/merchant-web/app/api/merchant-auth/refresh/route.ts:48-52`) rotates and re-writes a fresh valid httpOnly cookie server-side before the client can react; the client epoch guard cannot un-set a `Set-Cookie`.
- **Backend Redis arm (root cause):** `refreshMerchantToken` (`src/api/auth/merchant/service.ts:283-338`) reads the refresh-token key `RedisKey.refreshToken('merchant', entityId, sessionId)`, validates it, then `redis.del(key)` + `storeRefreshToken(...)` a NEW key. `logoutMerchant` (`service.ts:340-348`) revokes by `revokeRefreshToken(...)` which deletes that SAME key + `redis.del(RedisKey.authMerchant(entityId))`. The two flows are NOT ordered or atomic against each other. Interleaving that resurrects the session:
  1. `/refresh` reads the key (present) and validates OK.
  2. `logoutMerchant` deletes the key (revoke) - logout believes the session is dead.
  3. `/refresh` proceeds to `storeRefreshToken(newHash)` - a brand-new valid refresh token for the SAME sessionId is now in Redis, and the BFF writes its cookie.

The logged-out account is fully re-armed server-side. On a shared merchant device (branch tablet, back-office machine) the next person can `refresh-on-mount` back into the previous account. This is the unsafe-rehydration Codex flagged.

## 2. Why the rejected options fail

- **Option C (accept + document):** rejected - shared merchant devices make previous-account rehydration a real cross-user exposure, not a cosmetic staleness.
- **Option B (BFF-only re-clear guard):** insufficient. The BFF runs on stateless serverless functions; a "logout-in-progress" flag in one instance's memory does not see a `/refresh` served by another instance. B only works with a shared cross-instance store - and once you have that store, the durable fix belongs at the backend session layer (A), not a BFF patch.

## 3. Option A - reliable server-side revocation (the design)

### 3.1 Revocation tombstone, checked inside the refresh critical section

Introduce an explicit, short-lived REVOCATION MARKER keyed by session, written by logout and checked by refresh AFTER it reads the token but BEFORE it rotates:

- `logoutMerchant` writes `RedisKey.sessionRevoked('merchant', entityId, sessionId)` = `1` with a TTL >= the max refresh-token lifetime (so a straddling refresh cannot outlive the marker), THEN deletes the refresh-token key + `authMerchant` key (revoke stays first, so even a crash between steps leaves the session unusable, not half-alive).
- `refreshMerchantToken`, after `validateRefreshToken` passes, checks the revocation marker; if present, it treats the session as dead: no rotation, no new token, throw `REFRESH_TOKEN_INVALID` (the BFF then clears the cookie via its existing `!res.ok` branch, `refresh/route.ts:29-38`).

This closes the interleaving in section 1 step 3: the refresh sees the marker written in step 2 and refuses to rotate.

### 3.2 Atomicity of the marker-check-then-rotate

The check and the rotate must be atomic against a concurrent logout, or the same race reappears one layer in (logout writes the marker between refresh's check and its `storeRefreshToken`). Options, in preference order:

- **(A1) Single-key compare-and-delete rotation (preferred).** Fold the revocation into the refresh-token key's own lifecycle: refresh does an atomic `GETDEL` (or a Lua script) that reads-and-deletes the current token in one round trip, then only rotates if the read succeeded AND no revocation marker exists; logout's `revokeRefreshToken` deletes the same key. With `GETDEL`, a logout that deletes the key first makes refresh's `GETDEL` return nil -> refuse. This removes the read-then-delete window entirely without a second key in the hot path (the marker in 3.1 remains as the belt-and-braces cross-instance signal for the cookie-already-rotated edge).
- **(A2) Lua script (`EVAL`) doing check-marker + validate + del + store in one atomic server-side execution.** Strongest ordering guarantee; one script, no round-trip races. Heavier to maintain; specify only if A1's `GETDEL` proves insufficient for the rotate step.

The design MUST pick one and pin it with a concurrency test (section 5); it does not hand-wave "atomic."

### 3.3 Reliable (non-best-effort) revoke on the logout path

Today the BFF logout forwards a best-effort backend revoke and swallows failures (`logout/route.ts:16-21`); the backend `logoutMerchant` is fire-and-mostly-forget. Under A:

- The BFF logout MUST await the backend revoke and treat a NON-timeout failure as a logout that has not yet durably revoked - see 3.4 for bounded behaviour.
- The backend `logoutMerchant` writes the revocation marker (3.1) as its FIRST durable step, before deleting keys, so "revoke happened" is observable even if a later step fails.

### 3.4 Bounded failure - logout always reaches a locally-clean state

A remote revoke can be slow or fail; logout must never hang or silently no-op. Contract:

- The BFF awaits the backend revoke with a BOUNDED timeout (e.g. a few seconds). On timeout OR error, it STILL `clearSessionCookie` locally and returns success to the client (the client-side teardown - cache clear + epoch bump - proceeds regardless; the local device is clean).
- BUT: a failed/timed-out remote revoke means the refresh token MAY still be live server-side. The design records this residual honestly: on a shared device, until the refresh token naturally expires, a determined actor with the cookie could still refresh. Mitigation for that residual: (a) the revocation marker's short TTL bounds the exposure; (b) an OPTIONAL fire-and-forget backend retry queue for failed revokes (specify only if the residual is deemed unacceptable). The design surfaces this as an explicit accepted-or-mitigated risk rather than pretending an offline backend can be durably revoked synchronously.

### 3.5 Refresh-versus-logout ordering (summary invariant)

The normative invariant the implementation must guarantee and test: **for any interleaving of a single `/refresh` and a single `logout` on the same sessionId, the terminal Redis state is UNAUTHENTICATED** - either the refresh completed then logout revoked it, or logout revoked first and refresh refused. There is no interleaving whose terminal state is a live, rotated session for a logged-out account.

## 4. Surfaces touched (scoping the eventual PR)

- `src/api/auth/merchant/service.ts` - `refreshMerchantToken` (marker check + atomic rotate), `logoutMerchant` (marker-first revoke).
- The shared refresh-token helpers (`storeRefreshToken` / `revokeRefreshToken` / `validateRefreshToken`) - possibly a new `revokeSessionAtomic` / `rotateIfNotRevoked` helper; check whether customer/branch/admin auth share these and whether the same defect + fix applies to them (LIKELY yes - flag for the implementer to audit `revokeRefreshToken` call sites across roles; this doc scopes merchant, but the helper change may be cross-role and needs its own regression pass).
- `src/api/shared/redis-keys.ts` - new `sessionRevoked` key.
- `apps/merchant-web/app/api/merchant-auth/logout/route.ts` + `refresh/route.ts` - bounded-await revoke; keep the always-clear-cookie guarantee.
- NO Prisma schema change (Redis-only session state); NO provider change.

## 5. Test strategy

- **Concurrency/interleaving (the core):** a harness that drives `/refresh` and `logout` on the same sessionId with controlled ordering across ALL interleavings of section 3.5, asserting the terminal Redis state is always unauthenticated and no post-logout `storeRefreshToken` survives. Include the specific step-1/2/3 race from section 1.
- **Cross-instance simulation:** two BFF "instances" (no shared memory) - logout on one, in-flight refresh on the other - asserting the shared Redis marker/`GETDEL` closes it (proves B's gap is closed by A).
- **Bounded failure:** backend revoke times out -> BFF still clears the cookie + returns success; refresh token residual bounded by marker TTL (assert the marker expiry).
- **Reliable revoke happy path:** logout writes the marker before deleting keys; a subsequent refresh refuses.
- **No regression:** normal login/refresh/logout single-threaded flows unchanged; the SUSPENDED-merchant refuse path (`service.ts:305-309`) intact; audit-log events unchanged.
- **Cross-role audit pin (if the helper is shared):** the same interleaving test for customer/branch/admin refresh+logout if they share the mutated helper.

## 6. Rollback + risk

- Rollback: `git revert` of the backend PR restores best-effort revoke; the marker key self-expires; no schema/migration, no persisted state beyond short-TTL Redis keys.
- R1 - marker TTL vs refresh-token lifetime: TTL must be >= max refresh-token lifetime or a long-lived straddling refresh could outlive the marker. Pin the relationship in code + test.
- R2 - cross-role helper blast radius: if `revokeRefreshToken`/rotation helpers are shared, the change touches all four roles; either scope the fix merchant-only (separate code path) or take the cross-role regression pass. Implementer decides with evidence; flagged here.
- R3 - added Redis round trips on the hot refresh path: one marker check (or one `GETDEL` replacing a `GET`+`DEL`) - negligible; measure if refresh QPS is ever a concern.

## 7. Out of scope

Client-side cache isolation (the companion client design owns that); multi-tab propagation; non-merchant roles EXCEPT the shared-helper audit (section 4 / R2); any provider or infra change. This is a design only - no backend, Redis, or deployment action is authorised by this document.
