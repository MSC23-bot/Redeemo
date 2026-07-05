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

The clean fix (corrected per adversarial review F4) does NOT need a second marker key on the hot path. The resurrection race exists purely because refresh's read-validate-delete-store is not atomic against logout's delete on the SAME key. Make the rotation ONE atomic server-side operation on the single refresh-token key, and make logout a plain delete of that key:

- `refreshMerchantToken` rotates via a single Lua script (`EVAL`) that, on the one key `RedisKey.refreshToken('merchant', entityId, sessionId)`, atomically GETs the stored token, validates it matches (hash compare), DELs it, and SETs the new rotated hash - all in one server-side execution (Redis runs a script atomically; no other command interleaves).
- `logoutMerchant` revokes by a plain DEL of that same key (its existing `revokeRefreshToken`) plus `redis.del(authMerchant)`.

Every interleaving of one refresh and one logout then terminates UNAUTHENTICATED, because Redis is single-threaded so the logout DEL is atomically either fully before or fully after the refresh Lua - there is no "during":

- Logout DEL BEFORE the Lua: the Lua's GET returns nil -> the script refuses (no SET) -> `REFRESH_TOKEN_INVALID` -> the BFF clears the cookie via its `!res.ok` branch (`refresh/route.ts:29-38`). Terminal: dead.
- Logout DEL AFTER the Lua: the Lua rotated a new token, then logout DELs it. Terminal: dead (the next refresh with the rotated cookie fails).

This satisfies the section 3.5 invariant for the same-instance AND cross-instance cases (the single Redis store is shared across all serverless instances; both flows hit the same key). It REMOVES the F4 hole: a separate revocation-marker key only atomised the token read+delete and left the marker-check-vs-store window open, so a live rotated session could still exist after logout - the single-key atomic rotate closes that window entirely.

### 3.2 The revocation marker is OPTIONAL and observability-only (narrowed per F4)

The correctness guarantee rests entirely on 3.1 (atomic rotate + logout DEL on one shared key), NOT on a marker. A `RedisKey.sessionRevoked` marker is retained only if an operator wants an explicit "this session was logged out" signal for diagnostics; it is NOT load-bearing for the section 3.5 invariant and carries no safety TTL requirement. The concurrency test (section 5) pins the invariant against the atomic rotate, not against any marker.

### 3.3 Reliable (non-best-effort) revoke on the logout path

Today the BFF logout forwards a best-effort backend revoke and swallows failures (`logout/route.ts:16-21`); the backend `logoutMerchant` is fire-and-mostly-forget. Under A:

- The BFF logout MUST await the backend revoke and treat a NON-timeout failure as a logout that has not yet durably revoked - see 3.4 for bounded behaviour.
- The backend `logoutMerchant` DELs the refresh-token key (3.1) as its FIRST durable step, so once it runs, the session is atomically unusable regardless of any straddling refresh.

### 3.4 Bounded failure - logout always reaches a locally-clean state

A remote revoke can be slow or fail; logout must never hang or silently no-op. Contract:

- The BFF awaits the backend revoke with a BOUNDED timeout (e.g. a few seconds). On timeout OR error, it STILL `clearSessionCookie` locally and returns success to the client (the client-side teardown - cache clear + epoch bump - proceeds regardless; the local device is clean).
- HONEST RESIDUAL (corrected per F5): when the remote revoke TIMES OUT or the backend is unreachable, `logoutMerchant`'s DEL never ran, so the refresh-token key is STILL LIVE. There is no marker (3.2) and no short TTL bounding this - the residual is bounded only by the refresh-token's own lifetime, which is **90 days** (`REFRESH_TOKEN_TTL_SECONDS`, `src/api/shared/session.ts:6`). On a shared merchant device that is a real 90-day rehydration window for the logged-out account. The earlier claim that "a short marker TTL bounds the exposure" was WRONG for exactly this case (the marker is written by the same `logoutMerchant` that failed to run).
- Therefore the mitigation is NOT optional: the design MUST include a durable failed-revoke path so a timed-out logout still revokes eventually. Options (pick one at implementation, pin it): (a) a backend-side revoke retry/queue that re-attempts the DEL until it succeeds; (b) a revoke-on-next-refresh sweep - since refresh is the only way to re-arm, a server-side "pending-logout" set checked at the top of the refresh Lua would refuse a refresh for a session whose logout is still pending (this reintroduces a small shared-state check but ONLY on the failed-revoke path, not the hot path). The design does not ship the client change implying durability while leaving a 90-day hole unmitigated.

### 3.5 Refresh-versus-logout ordering (summary invariant)

The normative invariant the implementation must guarantee and test: **for any interleaving of a single `/refresh` and a single `logout` on the same sessionId, the terminal Redis state is UNAUTHENTICATED** - either the refresh completed then logout revoked it, or logout revoked first and refresh refused. There is no interleaving whose terminal state is a live, rotated session for a logged-out account.

## 4. Surfaces touched (scoping the eventual PR)

- `src/api/auth/merchant/service.ts` - `refreshMerchantToken` (single-key atomic Lua rotate, 3.1), `logoutMerchant` (plain DEL revoke, unchanged shape).
- The shared refresh-token helpers (`storeRefreshToken` / `revokeRefreshToken` / `validateRefreshToken`, `src/api/shared/session.ts`) - CONFIRMED shared and admin/branch/customer each carry the IDENTICAL non-atomic GET+validate+DEL+store pattern (verified: admin `service.ts:185-201`, branch, customer `:323-350`). A new `rotateRefreshTokenAtomic` Lua helper is therefore cross-role by construction; the implementer either scopes a merchant-only code path or takes the cross-role regression pass (R2). This doc scopes the merchant behaviour + invariant; the helper change is flagged cross-role.
- `apps/merchant-web/app/api/merchant-auth/logout/route.ts` + `refresh/route.ts` - bounded-await revoke; keep the always-clear-cookie guarantee.
- OPTIONAL only if the observability marker (3.2) is kept: `src/api/shared/redis-keys.ts` new `sessionRevoked` key. NOT required for correctness.
- NO Prisma schema change (Redis-only session state); NO provider change.

## 5. Test strategy

- **Concurrency/interleaving (the core):** a harness that drives `/refresh` and `logout` on the same sessionId with controlled ordering across BOTH interleavings of section 3.5 (logout-DEL-before-Lua and logout-DEL-after-Lua), asserting the terminal Redis state is always unauthenticated and no post-logout rotated token survives. Include the specific step-1/2/3 race from section 1 (which the atomic rotate must now defeat).
- **Cross-instance simulation:** two "instances" (no shared memory) - logout on one, in-flight refresh on the other - asserting the SHARED Redis atomic rotate closes it (both hit the same key; proves B's serverless gap is closed by the atomic rotate, not by any instance-local marker).
- **Bounded failure (the 90-day residual):** backend revoke times out -> BFF still clears the cookie + returns success (local device clean) AND the mandatory failed-revoke path (3.4) eventually revokes / refuses the next refresh; assert a straddling refresh cannot rehydrate after the failed-revoke path fires.
- **No regression:** normal single-threaded login/refresh/logout unchanged; the SUSPENDED-merchant refuse path (`service.ts:305-309`) intact; audit-log events unchanged.
- **Cross-role pin:** the same interleaving test for customer/branch/admin refresh+logout, since the atomic-rotate helper is shared (section 4 / R2).

## 6. Rollback + risk

- Rollback: `git revert` of the backend PR restores the prior non-atomic rotate; Redis session keys self-expire; no schema/migration, no persisted state beyond the existing refresh-token keys.
- R1 - refresh-token lifetime magnitude (adversarial review F6): `REFRESH_TOKEN_TTL_SECONDS = 90 days` (`src/api/shared/session.ts:6`). This is the residual window if the mandatory failed-revoke path (3.4) itself fails; it is also worth asking whether 90 days is the right merchant refresh lifetime at all (a shorter merchant TTL would shrink every residual here). Flagged for the owner; not changed by this doc.
- R2 - cross-role helper blast radius: the atomic-rotate helper is shared, so the change touches all four roles; either scope a merchant-only code path or take the cross-role regression pass. Flagged.
- R3 - added Redis cost on the hot refresh path: one `EVAL` replacing a `GET`+`DEL`+`SET` sequence - fewer round trips, not more; negligible.

## 7. Out of scope

Client-side cache isolation (the companion client design owns that); multi-tab propagation; non-merchant roles EXCEPT the shared-helper audit (section 4 / R2); any provider or infra change. This is a design only - no backend, Redis, or deployment action is authorised by this document.
