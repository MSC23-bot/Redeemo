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

### 3.1 Single-key atomic compare-and-rotate (Lua)

The resurrection race exists because refresh's read-validate-delete-store is not atomic against logout's delete on the SAME key. The fix makes the rotation ONE atomic server-side compare-and-swap on the single refresh-token key, and makes logout a plain delete of that key. Crucially, the atomic unit is a COMPARE-AND-ROTATE (not just del+store) so it preserves the existing membership/suspension ordering: the suspension check is a Prisma DB read that cannot live inside Lua, so it stays BEFORE the atomic rotate, and the Lua re-verifies the token still matches at rotation time.

**Application-side (before the EVAL), unchanged ordering:**
1. `GET` the current value (one read) and `validateRefreshToken` it against the presented token; on nil/mismatch throw `REFRESH_TOKEN_INVALID` (fast authenticate before the DB read).
2. Membership + SUSPENDED check via `getActiveMembership` (the existing DB read, `service.ts:305-309`); throw `MERCHANT_SUSPENDED` / `MULTI_MEMBERSHIP_UNSUPPORTED` as today. This stays BEFORE any mutation.
3. Compute the three values the Lua needs:
   - `expectedHash` = `hashRefreshToken(presented)` (SHA-256; the hash the stored value must still carry for the rotate to proceed).
   - `newHash` = `hashRefreshToken(newRefresh)` for the freshly generated token.
   - `replacementValue` = the COMPLETE serialized value `JSON.stringify({ tokenHash: newHash, deviceId, deviceType, deviceName, createdAt })`, where the device fields are carried over from the value decoded in step 1 (metadata preserved across rotation) and `createdAt` is the new rotation time. The app builds the whole replacement string so the Lua never constructs JSON. NOTE (adversarial review F1): merchant sessions today store only `deviceId` + `deviceType` (both `completeMerchantLogin` `service.ts:241-244` and the current rotate `:322-325` omit `deviceName`), so `deviceName` is `undefined` and `JSON.stringify` drops the key. Carrying `deviceName` is forward-compatible plumbing, NOT a currently-populated field - the "preserve metadata" guarantee is exact for `deviceId`/`deviceType` and vacuously true for `deviceName` until it is populated.

**The Lua script (single `EVAL`, `KEYS[1]` = the refresh-token key, `ARGV` = `expectedHash`, `replacementValue`, `ttlSeconds`):**
1. `local cur = redis.call('GET', KEYS[1])` - if `cur == false` (missing key), return a typed refuse (`{'refused','missing'}`) WITHOUT mutation.
2. `local ok, parsed = pcall(cjson.decode, cur)` - on decode failure return `{'refused','corrupt'}` without mutation.
3. Compare `parsed.tokenHash` with `ARGV[1]` (`expectedHash`); on mismatch return `{'refused','mismatch'}` WITHOUT mutation (a concurrent logout DEL + a different session's write, or any rotation that moved the hash, is refused).
4. Only on match: `redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))` - atomically replace with the complete pre-serialized value at the correct 90-day TTL (`REFRESH_TOKEN_TTL_SECONDS`).
5. Return `{'ok'}`.

The app maps the typed result: `ok` -> return the new access + refresh tokens; any `refused` -> throw `REFRESH_TOKEN_INVALID` (the BFF then clears the cookie via its `!res.ok` branch). Because GET-compare-SET run inside one script, no logout DEL can interleave between the compare and the SET.

The Lua replaces ONLY today's `redis.del(key)` + `storeRefreshToken` pair. The two trailing app-side steps that follow the store today stay app-side, AFTER a successful (`ok`) EVAL, unchanged (adversarial review F2): the `prisma.userSession.updateMany({ lastActiveAt })` touch (`service.ts:327-330`) and the `app.jwt.merchant.sign` access-token mint. They must not be folded into the Lua or dropped.

`logoutMerchant` revokes by a plain `DEL` of that same key (its existing `revokeRefreshToken`) plus `redis.del(authMerchant)`.

Every interleaving of one refresh and one logout then terminates UNAUTHENTICATED (Redis is single-threaded, so the logout DEL is atomically fully before or fully after the Lua - never "during"):

- Logout DEL BEFORE the Lua: the Lua's GET returns nil -> `{'refused','missing'}` -> `REFRESH_TOKEN_INVALID` -> BFF clears the cookie. Terminal: dead.
- Logout DEL AFTER the Lua: the Lua rotated, then logout DELs the rotated token. Terminal: dead (the next refresh with the rotated cookie's token GETs nil -> refused).

This satisfies the section 3.5 invariant for the same-instance AND cross-instance cases (the single Redis store is shared across all serverless instances; both flows hit the same key). It removes the F4 hole (a separate marker key only atomised the read+delete and left a check-vs-store window open).

### 3.2 Failed-revoke tombstone check, folded into the same Lua (serves 3.4, not the happy path)

The happy-path invariant above needs NO tombstone. A tombstone IS needed for the FAILED-revoke durability path (3.4): when logout's DEL could not be confirmed, a `RedisKey.sessionRevoked('merchant', entityId, sessionId)` tombstone records the pending revocation, and the refresh Lua refuses any session carrying one. To keep this on one atomic script, the Lua gains a step 0: `if redis.call('GET', KEYS[2]) then redis.call('DEL', KEYS[1]); redis.call('DEL', KEYS[2]); return {'refused','revoked'} end` (KEYS[2] = the tombstone key). It deletes BOTH the token key AND the tombstone on the revoked branch (adversarial review F3): the tombstone has fired and enforced the revocation, so self-cleaning it bounds tombstone growth rather than leaving one 90-day key per failed logout. So the tombstone is CHECKED on every refresh (one extra GET, negligible), WRITTEN only on the failed-revoke path (3.4), and self-deleted once it enforces. This is a distinct role from the earlier-rejected marker: it does not carry the happy-path atomicity (3.1 does), it carries failed-path durability.

### 3.3 Reliable (non-best-effort) revoke on the logout path

Today the BFF logout forwards a best-effort backend revoke and swallows failures (`logout/route.ts:16-21`); the backend `logoutMerchant` is fire-and-mostly-forget. Under A:

- The BFF logout MUST await the backend revoke and treat a NON-timeout failure as a logout that has not yet durably revoked - see 3.4 for bounded behaviour.
- The backend `logoutMerchant` DELs the refresh-token key (3.1) as its FIRST durable step, so once it runs, the session is atomically unusable regardless of any straddling refresh.

### 3.4 Bounded failure - logout always reaches a locally-clean state

A remote revoke can be slow or fail; logout must never hang or silently no-op. THE CHOSEN design (single, complete, bounded - not "pick one at implementation"):

**Chosen: bounded-synchronous revoke with in-request retry, a durable pending-revocation tombstone, and revoke-on-next-refresh as the pull-based durable owner. No new worker or infrastructure.** Point by point against the required contract:

1. **Local browser logout always completes.** The BFF always `clearSessionCookie` + returns 200, and the client teardown (epoch bump + `cancelQueries` + `clear`) runs regardless of the remote outcome. The user always reaches a locally-clean /sign-in. CROSS-DOC CONTRACT (adversarial review F5): this "always completes, never blocks the bounce" guarantee holds ONLY if the client teardown does NOT synchronously await this BFF logout POST before navigating - since this design adds a bounded-await revoke (up to a few seconds) inside the BFF route, the client `signOut` must run `resetSessionState` + navigate independently of the logout POST's resolution (fire-and-forget the POST, or await it only after navigation). Verify against the companion client design (`2026-07-05-merchant-web-session-cache-isolation-design.md` section 4.3 signOut wiring) at implementation time.
2. **BFF response on remote timeout/failure.** The BFF awaits the backend revoke with a BOUNDED timeout (a few seconds). It returns 200 with a body discriminator `{ ok: true, remoteRevoke: 'confirmed' | 'pending' | 'unavailable' }` so the outcome is observable, but NEVER blocks the sign-in bounce on it. `confirmed` = DEL succeeded; `pending` = DEL unconfirmed but the tombstone was written; `unavailable` = neither could be written (Redis unreachable - see point 7).
3. **Durable recording of failed revocation.** The backend `logoutMerchant` first attempts the atomic DEL with a small bounded in-request retry (2-3 attempts over a few hundred ms) to ride out transient blips. If the DEL still cannot be confirmed, it writes the `RedisKey.sessionRevoked(role, entityId, sessionId)` tombstone with TTL = `REFRESH_TOKEN_TTL_SECONDS` (so it always outlives any straddling refresh token) and audit-logs `AUTH_LOGOUT_REVOKE_PENDING`.
4. **Retry ownership while there is no online worker.** There is NO new background worker or queue (owner boundary: no new infra). The durable retry owner is the REFRESH PATH itself: the refresh Lua's step-0 tombstone check (3.2) refuses AND deletes any session that carries a pending-revocation tombstone. Revocation is thus pull-based - enforced lazily the next time that session tries to re-arm, which is the only moment it matters. Nothing needs to be "online" between logout and that next refresh.
5. **Next-refresh refusal where achievable.** The Lua tombstone check IS this refusal, achievable whenever the tombstone was successfully written (Redis reachable at logout, i.e. the `pending` case). When even the tombstone write failed (`unavailable`), refusal is not achievable until Redis returns - see point 7.
6. **Operator visibility + incident handling.** `AUTH_LOGOUT_REVOKE_PENDING` (tombstone written) and `AUTH_REFRESH_REFUSED_REVOKED` (a refresh later refused by a tombstone) audit-log events give ops a durable trail of every unconfirmed logout and its eventual enforcement; an `unavailable` outcome audit-logs `AUTH_LOGOUT_REVOKE_UNAVAILABLE`. These ride the EXISTING audit-log stream (no new dashboard mandated); an alert can hook that stream if ops wants proactive notice. Incident handling: a spike of `…_UNAVAILABLE` indicates a Redis outage (the shared store), handled as an infra incident, not per-session.
7. **Honest behaviour when the shared store is unavailable (the degraded contract, stated plainly).** If Redis is unreachable at logout, NEITHER the DEL NOR the tombstone can be written. The server CANNOT durably revoke during shared-store unavailability - this design does NOT claim otherwise. The contract degrades honestly: local logout still completes; server-side revocation resumes automatically once Redis is reachable again (the token key still exists, but so does the user's ability to re-establish a tombstone on a subsequent successful logout, and the atomic rotate resumes normal behaviour); until the store returns, the residual is bounded only by the token's own 90-day `REFRESH_TOKEN_TTL_SECONDS` lifetime. This residual is called out as an accepted, honestly-degraded state, not hidden.
8. **No hidden new provider/infrastructure dependency.** Everything uses the EXISTING Redis, the existing audit log, and the existing refresh endpoint. No queue service, no cron/worker, no new datastore, no new provider.

The 90-day residual (F5) is therefore closed for the common case (transient failure -> in-request retry or tombstone -> next-refresh refusal) and honestly bounded-and-disclosed for the rare hard case (Redis fully down at logout). Separately, whether 90 days is the right merchant refresh lifetime at all is an owner decision (section 6 / R1), tracked independently of this design.

### 3.5 Refresh-versus-logout ordering (summary invariant)

The normative invariant the implementation must guarantee and test: **for any interleaving of a single `/refresh` and a single `logout` on the same sessionId, the terminal Redis state is UNAUTHENTICATED** - either the refresh completed then logout revoked it, or logout revoked first and refresh refused. There is no interleaving whose terminal state is a live, rotated session for a logged-out account.

## 4. Surfaces touched (scoping the eventual PR)

- `src/api/auth/merchant/service.ts` - `refreshMerchantToken` (single-key atomic Lua rotate, 3.1), `logoutMerchant` (plain DEL revoke, unchanged shape).
- The shared refresh-token helpers (`storeRefreshToken` / `revokeRefreshToken` / `validateRefreshToken`, `src/api/shared/session.ts`) - CONFIRMED shared and admin/branch/customer each carry the IDENTICAL non-atomic GET+validate+DEL+store pattern (verified: admin `service.ts:185-201`, branch, customer `:323-350`). A new `rotateRefreshTokenAtomic` Lua helper is therefore cross-role by construction; the implementer either scopes a merchant-only code path or takes the cross-role regression pass (R2). This doc scopes the merchant behaviour + invariant; the helper change is flagged cross-role.
- `apps/merchant-web/app/api/merchant-auth/logout/route.ts` + `refresh/route.ts` - bounded-await revoke; keep the always-clear-cookie guarantee.
- `src/api/shared/redis-keys.ts` - new `sessionRevoked(role, entityId, sessionId)` key (REQUIRED: it carries the 3.4 failed-revoke tombstone that the Lua step-0 checks; not merely observability).
- `apps/merchant-web/app/api/merchant-auth/logout/route.ts` - return the `{ ok, remoteRevoke: 'confirmed' | 'pending' | 'unavailable' }` discriminator (3.4 point 2).
- NO Prisma schema change (Redis-only session state); NO provider change.

## 5. Test strategy

Explicit Lua-level unit tests (3.1) - each asserts mutation-or-not and the typed result:
- **Missing key:** GET returns nil -> `{'refused','missing'}`, no SET.
- **Hash mismatch:** stored `tokenHash` != `expectedHash` -> `{'refused','mismatch'}`, no SET (the stored value is byte-unchanged after the call).
- **Corrupt value:** non-JSON stored value -> `{'refused','corrupt'}`, no SET.
- **Successful rotation:** match -> `{'ok'}` + the key now holds the exact `replacementValue`.
- **TTL:** after a successful rotate, `PTTL`/`TTL` on the key is within tolerance of `REFRESH_TOKEN_TTL_SECONDS` (90 days), not persisted-without-expiry and not a shortened TTL.
- **Metadata preserved:** the rotated value's `deviceId`/`deviceType`/`deviceName` equal the pre-rotation values; only `tokenHash` + `createdAt` change.
- **Tombstone refusal (3.2 step 0):** with a `sessionRevoked` tombstone present, the Lua returns `{'refused','revoked'}` AND deletes the token key.
- **Membership/suspension ordering:** a SUSPENDED merchant is refused by the app-side check BEFORE the EVAL (the token key is byte-unchanged; the Lua never runs), pinning that the suspension gate stays before mutation.

Interleaving + integration:
- **logout-before-refresh:** logout DEL then the Lua -> Lua GET nil -> refused; terminal unauthenticated.
- **refresh-before-logout:** the Lua rotates then logout DELs the rotated token -> terminal unauthenticated.
- **The section-1 step-1/2/3 race** specifically (app GET succeeds, logout DEL lands, Lua re-GET/compare must refuse) -> no rotated token survives.
- **Cross-instance simulation:** two "instances" (no shared memory) - logout on one, in-flight refresh on the other - the SHARED Redis atomic rotate closes it (both hit the same key; proves B's serverless gap is closed without an instance-local marker).
- **Bounded-failure path (3.4):** DEL unconfirmed -> in-request retry then tombstone written + `remoteRevoke:'pending'` + `AUTH_LOGOUT_REVOKE_PENDING`; a subsequent refresh is refused by the tombstone (`{'refused','revoked'}` + `AUTH_REFRESH_REFUSED_REVOKED`); assert a straddling refresh cannot rehydrate after the tombstone is written.
- **Redis-unavailable path (3.4 point 7):** neither DEL nor tombstone writable -> BFF still clears cookie + returns `remoteRevoke:'unavailable'` + `AUTH_LOGOUT_REVOKE_UNAVAILABLE`; the honest degraded residual is asserted (no false durability claim).
- **No regression:** normal single-threaded login/refresh/logout unchanged; the SUSPENDED-merchant refuse path intact; existing audit-log events unchanged.
- **Cross-role pin:** the same interleaving test for customer/branch/admin refresh+logout, since the atomic-rotate helper is shared (section 4 / R2).

## 6. Rollback + risk

- Rollback: `git revert` of the backend PR restores the prior non-atomic rotate; Redis session keys self-expire; no schema/migration, no persisted state beyond the existing refresh-token keys.
- R1 - refresh-token lifetime magnitude (adversarial review F6): `REFRESH_TOKEN_TTL_SECONDS = 90 days` (`src/api/shared/session.ts:6`). This is the residual window if the mandatory failed-revoke path (3.4) itself fails; it is also worth asking whether 90 days is the right merchant refresh lifetime at all (a shorter merchant TTL would shrink every residual here). Flagged for the owner; not changed by this doc.
- R2 - cross-role helper blast radius: the atomic-rotate helper is shared, so the change touches all four roles; either scope a merchant-only code path or take the cross-role regression pass. Flagged.
- R3 - added Redis cost on the hot refresh path: one `EVAL` replacing a `GET`+`DEL`+`SET` sequence - fewer round trips, not more; negligible.
- R4 (adversarial review F4, forward-looking only) - the refresh EVAL passes TWO keys with different prefixes (`refresh:merchant:…` = KEYS[1], `session-revoked:merchant:…` = KEYS[2]); under Redis Cluster these hash to different slots and `EVAL` would `CROSSSLOT`-error. This is NOT a current defect: the codebase already assumes a single non-clustered Redis instance (`src/api/shared/atomicLimiter.ts` passes cross-prefix multi-key EVALs today), so this design is consistent with the existing deployment. IF Redis Cluster is ever adopted, this design AND `atomicLimiter` both need hash-tagged keys - flagged so the decision is not silently lost.

## 7. Out of scope

Client-side cache isolation (the companion client design owns that); multi-tab propagation; non-merchant roles EXCEPT the shared-helper audit (section 4 / R2); any provider or infra change. This is a design only - no backend, Redis, or deployment action is authorised by this document.
