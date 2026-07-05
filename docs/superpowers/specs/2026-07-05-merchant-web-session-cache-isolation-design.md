# Design spec: merchant-web session cache isolation (auth/session hardening)

Status: DRAFT design spec for owner approval. DOCS-ONLY - implementation is OWNER-GATED and must not begin until this spec + the companion plan pass review and receive explicit owner approval.
Companion implementation plan: `docs/superpowers/plans/2026-07-05-merchant-web-session-cache-isolation.md`.
Provenance: source inspection ran against main `3a097161` (post PR #381 + #382). Every file:line below cites that commit. The exhaustive inventory (37 query observers / 28 mutations / 27 direct queryClient sites / module state / storage / BFF routes / zero AbortController) was produced by a dedicated read-only sweep and cross-checked by the lead.

## 1. Problem

The merchant-web `QueryClient` is created once per browser tab (`app/providers.tsx:12-19`) and is never cleared, cancelled, or partitioned on any session boundary. `signOut` (`lib/auth/session.tsx:48-57`), the hard-logout teardown (`session.tsx:68-75`), and all three `setSession` login sites (`app/(auth)/sign-in/page.tsx:48`, `app/(auth)/otp/page.tsx:47`, `app/(auth)/register/verify/page.tsx:57`) touch only the in-memory token and React state. Consequences when one merchant signs out and another signs in on the same tab:

- Every cached payload of the previous account remains readable and renders instantly for the next account until each query's own refetch lands: merchant profile + `viewerCapabilities.role`, staff names/emails, app-users, branch lists with PIN-related flags and redemption-alert state, voucher economics (custom, flagship, insights), redemption records, notification titles. That is a cross-account PII/data display defect, not merely staleness.
- The shell chrome (Sidebar / Topbar / QuickActionsMenu / MobileTabBar) derives `role`, `canManageVouchers`, `canViewInsights` from the plain cached profile (`components/shell/MerchantPortalShell.tsx:43-51`) - a stale OWNER paints owner navigation and the widened OWNER-or-BM PIN quick-action for up to a staleTime window with no race required.
- No request cancellation exists anywhere (zero `AbortController` in client code), so requests issued under the previous bearer can resolve after the switch and repopulate the cache.

PR #381 hardened exactly ONE consumer (`useBranchCapability`) against this with bespoke fresh observers + an own-fetch gate. This spec is the central fix the #381 carve-out promised: isolation enforced at the session boundary, not per hook.

## 2. Verified current-state facts the design builds on

1. Access token: module-scope memory only (`lib/auth/tokenStore.ts:6`); refresh material: httpOnly SameSite=Lax cookie `redeemo_merchant_session`, written/rotated/cleared exclusively by the six same-origin BFF handlers; `logout/route.ts:22` clears the cookie in steady state (backend revoke best-effort first, `logout/route.ts:16-21`). CAVEAT (adversarial review F1): logout is NOT durable against a refresh that is in flight when logout fires. The `/refresh` BFF route rotates and re-writes a fresh valid cookie server-side on success (`app/api/merchant-auth/refresh/route.ts:48-52`); a refresh dispatched before logout, resolving after `clearSessionCookie`, therefore re-arms the httpOnly cookie for the logged-out account, and refresh-on-mount can re-mint that account's access token on the next reload. The client-side epoch guard (4.2) closes the IN-MEMORY arm of this defect but has zero authority over the server `Set-Cookie`; the cookie arm requires a backend/BFF change and is escalated as an owner decision (section 10).
2. `apiFetch` reads the bearer at issue time, retries once after a single-flight refresh on 401, and hard-logs-out on refresh failure (`lib/api/client.ts`). `refreshInFlight` (`client.ts:73`) is module state never reset on teardown.
3. React Query v5.100.6 semantics (verified from installed source during #381): `cancelQueries` cancels retryers (late network resolutions are discarded by the cancelled retryer); `isFetchedAfterMount` compares update counts captured at observer mount; query-level dedup ADOPTS an in-flight fetch when `state.data === undefined`.
4. Mutations: 28 total, zero optimistic (`onMutate`/rollback absent); exactly one `setQueryData` write-back site (`lib/branches/useBranches.ts:249`). NOTE (adversarial review F2, verified against query-core 5.100.6 `mutation.ts:246`): hook-level `onSuccess` DOES fire after the component unmounts (the mutation holds its own options snapshot; only `.mutate(vars, {onSuccess})` mutate-time callbacks are mount-gated). So an in-flight mutation at logout runs its `onSuccess` post-unmount - the design's protection is the transport epoch guard rejecting the mutationFn response (SESSION_SWITCHED -> mutation error branch -> `onSuccess` skipped), NOT any mount-gating.
5. Storage: only `redeemo_merchant_device_id` in localStorage (random UUID keying the known-device OTP flow - intentionally outlives logout; carries no account data) and short-lived OTP/register challenge tokens in sessionStorage that the auth screens remove on use.
6. Each browser tab has its own in-memory QueryClient; there is no cross-tab cache. Multi-tab logout propagation (tab B discovers the dead session on its next 401->refresh-fail) is EXISTING behaviour and is explicitly out of scope here (documented, unchanged).

## 3. New defect found during this discovery (design must close it)

**Mint-after-logout token re-arm - TWO arms.** A refresh request in flight at the moment of logout was issued with the OLD cookie. Logout clears the cookie and the in-memory token, but when that in-flight refresh resolves:

- **In-memory arm (CLOSED by 4.2):** `doRefresh` (`lib/api/client.ts:60-71`) unconditionally `setAccessToken(newToken)` - re-arming the token store with a freshly minted, fully valid access token for the LOGGED-OUT account while the tab sits on /sign-in (and `setAccessToken` also re-arms the hard-logout latch). The transport epoch guard makes `doRefresh` return `false` without `setAccessToken` across an epoch boundary, closing this arm entirely.
- **Cookie arm (NOT closable client-side - owner decision, section 10):** the `/refresh` BFF route already rotated and re-wrote a fresh valid httpOnly cookie server-side (`refresh/route.ts:48-52`) before its response reached the client. The epoch guard drops the returned accessToken but cannot un-set a `Set-Cookie` header. If that response is applied after logout's `clearSessionCookie`, the refresh cookie is live again and refresh-on-mount re-mints account A on the next reload/new-tab. Logout durability against this race is a backend/BFF concern (candidate mitigations: revoke-before-clear with a reliable - non-best-effort - backend revoke; or a BFF re-clear if a refresh settles during a logout-in-progress window). Escalated in section 10; explicitly NOT claimed closed by this client-only design.

## 4. The design

### 4.1 Session epoch

A module-scope monotonically increasing integer, colocated with the token store (`lib/auth/tokenStore.ts` or a sibling `sessionEpoch.ts`): `getSessionEpoch()` / `bumpSessionEpoch()`. The epoch increments at EVERY session boundary, before any other teardown step:

- `signOut` (user-initiated logout),
- the hard-logout teardown (`onSessionLost`),
- `setSession` (every login/verify path - defensive double-bump around a logout->login pair is harmless).

The epoch is the single "which session issued this work?" discriminator. It is NOT part of any React Query key (owner constraint: no token/credential key material; and key-partitioning would leak old-session entries until GC - rejected in section 7).

### 4.2 Transport-layer epoch guard (the backstop)

`apiFetch`/`apiFetchResponse` captures `getSessionEpoch()` at entry and THREADS it through the one refresh-retry (see the retry note below); `doRefresh` captures at entry. The epoch is checked at TWO points, not one:

- **On resolution:** after ANY resolution, if the current epoch differs from the captured epoch, the result is DISCARDED - apiFetch throws a typed `ApiError` with a reserved synthetic code (`SESSION_SWITCHED`), and `doRefresh` returns `false` WITHOUT calling `setAccessToken`.
- **Retry-capture threading (adversarial review F2):** the 401 branch retries by RE-ENTERING `apiFetchResponse` recursively (`client.ts:111`), which would otherwise capture a FRESH epoch at the retry's own entry - so a boundary landing between a successful refresh and the retry's entry would make the retry's captured epoch equal the new current epoch, and its resolution would NOT be discarded (violating the section 6 "post-refresh retry straddling a bump is discarded" pin, and repopulating the cleared cache). The captured epoch MUST be threaded into the retry (e.g. a private `options._epoch`) and the retry compares its resolution against THAT original value, not a fresh capture. The original request and its retry share ONE captured epoch.
- **Before any session side effect (Codex #3):** the 401 branch's own teardown steps - `setAccessToken(null)`, `triggerSessionLost()`, and any other token/session mutation - are ALSO epoch-gated. A request that 401s, fails its refresh, and finds the epoch has moved must NOT run those side effects (it belongs to a dead session; a NEW session is already live). The stale path throws `SESSION_SWITCHED` and invokes NO logout callback. Only a current-epoch request may drive a hard logout. This closes the F4 spurious-hard-logout-of-the-new-session class at the source, independent of the single-flight reset.

Consequences:

- An old-bearer data response can never be delivered to any consumer (query, mutation, or ad-hoc caller) after a session switch - this is what "prevent old-bearer responses repopulating the cache" means enforced at the choke point every request already flows through.
- The section 3 mint-after-logout (in-memory arm) defect closes: the stale refresh resolution is dropped before `setAccessToken`.
- No stale request can hard-logout a fresh session: the pre-side-effect epoch gate above suppresses `triggerSessionLost` / `setAccessToken(null)` on any old-epoch path.
- The single-flight `refreshInFlight` promise MUST be reset at teardown (4.3 step 2) - this is MANDATORY, not optional (corrected per CodeRabbit + Codex #1/#5). The epoch guard only makes a stale RESULT and its side effects safe; it does NOT stop a new-session caller from ADOPTING the still-pending old promise via single-flight. Without the teardown reset, the new session's first 401 would await the old-epoch promise and receive `false` - at best a needless failed-refresh round-trip, and it couples the new session's refresh liveness to a dead session's request (see R3). Resetting `refreshInFlight` to null in the teardown forces the new session to start its own refresh. Guard and reset are COMPLEMENTARY: the guard makes a stale result safe; the reset stops the new session inheriting stale in-flight work.
- SELF-OWNERSHIP GUARD on the single-flight `.finally` (adversarial review F1 - the reset alone is necessary but NOT sufficient). Today `tryRefresh` schedules `refreshInFlight = doRefresh().finally(() => { refreshInFlight = null })` (`client.ts:76-78`): the `.finally` unconditionally nulls the MODULE SLOT when the promise settles. So after a teardown reset creates a NEW promise for the new session, the OLD promise's still-pending `.finally` will later fire and clobber the new slot to null - re-opening the single-flight and letting TWO concurrent new-session refreshes race the single-use rotation (one presents a rotated-away token -> `REFRESH_TOKEN_INVALID` -> a spurious hard logout of the just-logged-in user). The `.finally` MUST only clear the slot it still owns: `const p = doRefresh(); refreshInFlight = p; p.finally(() => { if (refreshInFlight === p) refreshInFlight = null })`. Pinned (4.3 T3): an old promise settling AFTER a new one is created must not null the new slot.

### 4.3 Teardown pipeline (ordering is normative)

One exported async function, e.g. `resetSessionState(queryClient)` in `lib/auth/sessionReset.ts`, is the ONLY implementation of the boundary and is called from all three boundary sites. The order is normative:

1. `bumpSessionEpoch()` - instantly invalidates every in-flight request and any pending refresh at the transport layer (nothing that was issued before this line can deliver data or a token after it).
2. `setAccessToken(null)` + reset `refreshInFlight` to null (a new exported `resetRefreshInFlight()` from `client.ts`). Nulling the token BEFORE the cache is cleared is LOAD-BEARING (adversarial review F5): `clear()` on a still-mounted observer (the logout-from-portal path, before navigation unmounts it) can render-trigger a refetch; with the token already null that refetch carries no old bearer, and since it is issued post-bump the epoch guard would NOT discard it (its captured epoch equals the current epoch) - so token-nulling, not the guard, is what protects these post-clear refetches. Resetting `refreshInFlight` (F4) stops the new session from adopting the previous session's epoch-poisoned refresh promise (which would otherwise resolve `false` and trigger a spurious HARD logout of the NEW session via `client.ts:113`).
3. `await queryClient.cancelQueries()` - cancels every query retryer so nothing settles into the cache between steps 3 and 4. (Per verified v5 semantics a cancelled retryer discards late network resolutions; the epoch guard backstops even pathological escapes.)
4. `queryClient.clear()` - removes every query AND mutation cache entry: cached data, cached errors, paused mutations, in-flight mutation records. The next account starts from an empty cache - loading skeletons, never prior-account paint.
5. Caller-specific state clearing proceeds as today (merchant React state via `setMerchant(null)`/replacement - already present in all three sites; navigation).

`resetSessionState` is `async` (it awaits `cancelQueries`). Every caller MUST await it before the step that depends on a clean slate. Call sites and their deltas:

- **Normal logout** (`signOut`, already `async`): see 4.5 - the ordered confirmed-cookie-clearance contract (client state cleared first, then an awaited bounded BFF logout so cookie clearance is confirmed, then navigation).
- **Hard logout** (`onSessionLost`): see 4.4 - the callback becomes an awaited async teardown with single-flight + navigation-after-reset ownership. It does not re-invoke the BFF logout. Cookie/session state depends on WHY the refresh failed (adversarial review F3): (a) BACKEND-non-ok - the `/refresh` route returned non-ok and ran `clearSessionCookie` on its `!res.ok` branch (`refresh/route.ts:29,:38`), so the cookie is cleared and the session is server-side dead; (b) CLIENT-network-failure - `doRefresh` returned `false` from its `catch` on a thrown fetch (offline / network blip / nav abort, `client.ts:70`), in which case the `/refresh` route may not have executed at all: cookie clearance AND server-side termination are UNCONFIRMED (the same residual as 4.5 point 5), and durable termination there depends on the backend logout-durability design, not on the failed refresh. The hard path does not itself confirm clearance in sub-case (b); this is surfaced honestly, not treated as a clean logout.
- **Login** (`setSession`, contract change - Codex #2): `setSession` becomes `async` returning `Promise<void>`. It runs the SAME pipeline and AWAITS it BEFORE applying the new token/merchant (`applyToken(newToken)` / `setMerchant(m)` run only after `await resetSessionState(qc)` resolves). The new token can NEVER be installed before cache+session reset completes - this is a hard ordering guarantee, pinned by a test (section 6). All three login/verify callers (`sign-in/page.tsx:48`, `otp/page.tsx:47`, `register/verify/page.tsx:57`) MUST `await setSession(...)` before any navigation or subsequent action. Awaiting the reset before the token apply is what makes same-tab account replacement without a full page reload safe even when no explicit logout preceded it, and it globally retires the #381 empty-cache in-flight-adoption class (any pre-login hung request is epoch-dead and its retryer cancelled before the first new-session query mounts).

`SessionProvider` obtains the client via `useQueryClient()` - it already renders inside `QueryClientProvider` (`app/providers.tsx:21-23`).

### 4.4 Async hard-logout ownership (Codex #4)

The hard-logout path (`setOnSessionLost` registered in `SessionProvider`, invoked by `triggerSessionLost` in `client.ts`) is synchronous today. It becomes an owner of ONE async teardown promise with these normative properties:

- **Single async teardown, single-flight.** The registered callback starts `resetSessionState(qc)` and stores the returned promise in a provider-scoped ref (`teardownInFlightRef`). `triggerSessionLost`'s existing at-most-once `sessionLostFired` latch (`tokenStore.ts`) ALREADY guarantees the callback body runs once per dead session, so the ref is defence-in-depth only (it does not add a distinct guarantee; kept so a double-entry reuses the SAME promise rather than starting a second pipeline). The ref is cleared PROVIDER-SIDE - inside `applyToken` when a truthy token is applied (a new session is live), or in the teardown promise's `.then()` - NOT by `setAccessToken` in the tokenStore module (that module function cannot reach the SessionProvider's React ref; it only clears the separate `sessionLostFired` latch). Do not conflate the two mechanisms.
- **Navigation only after reset.** `router.replace('/sign-in')` runs in the teardown promise's `.then()` (or after `await`), never before it. The user never lands on /sign-in with a half-cleared cache.
- **Failures caught, never floating.** The teardown promise is `.catch()`-handled: a `cancelQueries`/`clear` rejection (not expected, but defensively) is swallowed to a logged no-op and navigation STILL proceeds (a dead session must always reach /sign-in). There is no unhandled rejection and no floating promise - the callback either `await`s inside an async IIFE with try/catch or attaches `.then(nav).catch(navAnyway)`.
- **Idempotent teardown.** `resetSessionState` is safe to run twice (bump is monotonic, clear on an empty cache is a no-op), so a race between the hard-logout teardown and a subsequent explicit `signOut` cannot corrupt state.

### 4.5 Normal-logout confirmed-cookie-clearance contract (Codex Wave 12)

The httpOnly session cookie (`redeemo_merchant_session`) is NOT reachable from JavaScript - only the BFF `logout` route's `clearSessionCookie` (a `Set-Cookie` on its RESPONSE) can clear it. Therefore the client cannot itself clear the cookie and must not claim it cleared without response evidence. A prior draft said the client should navigate WITHOUT awaiting the BFF logout ("fire-and-forget"); that was wrong - navigation can abort a non-keepalive request before the BFF's clearing response is received, leaving cookie clearance unconfirmed. The corrected ordered contract for `signOut`:

1. **Invalidate + clear client state FIRST, synchronously observable.** `await resetSessionState(qc)` - epoch bump (4.3 step 1), token null + `refreshInFlight` reset (step 2), `cancelQueries` (step 3), `clear` (step 4). In-memory and cached state are gone immediately, independent of any network call. A stale in-flight request cannot repopulate anything (epoch guard).
2. **Invoke the BFF logout with a STRICT bounded timeout.** `POST /api/merchant-auth/logout` (via `authApi.logout`), wrapped in a bounded timeout (a few seconds, e.g. an `AbortController` + timer). The BFF ALWAYS attempts `clearSessionCookie` regardless of the backend revoke result (cookie clearance is unconditional on the BFF response path). CRITICAL: clearing the client token in step 1 (`setAccessToken(null)`) must NOT disable the backend revoke, AND the revoke must be PROOF-BEARING - it must not trust unsigned data (Codex Wave 12 security correction). Today `authApi.logout(getAccessToken())` forwards the access token as a Bearer and the BFF revokes only `if (authorization)` (`logout/route.ts:15`), so calling `authApi.logout()` after the token is null would silently skip the revoke. The RESOLUTION (backend design 3.3): the revoke is by REFRESH-TOKEN POSSESSION - the BFF reads `readSessionCookie()` -> `{ refreshToken, sessionId, entityId }` and the backend VALIDATES `hashRefreshToken(refreshToken) === stored.tokenHash` (the same proof `/refresh` uses) before revoking, using `sessionId`/`entityId` ONLY to locate the key, never as trusted authority. This (a) removes the token-null ordering dependency (the cookie is present until the response clears it), (b) is proof-bearing so a tampered/forged cookie cannot revoke another merchant or enable an unauthenticated body-only logout, and (c) has no expired-access-token gap (the refresh token is valid for the full TTL). `authApi.logout` does not forward the access-token Bearer for revoke; the refresh-token secret in the httpOnly cookie is the proof.
3. **AWAIT the bounded BFF response BEFORE normal navigation.** Because the client awaits the response before navigating, the request is NOT aborted by navigation - so no `keepalive` is required (keepalive is not used; if a future revision proposes it, it must prove browser `Set-Cookie`-on-unload behaviour, not assume it). A resolved 2xx response is the EVIDENCE that the clearing `Set-Cookie` was received and the cookie is cleared.
4. **Then navigate** to `/sign-in`.
5. **Honest degraded behaviour if the BFF is unreachable or the bounded timeout fires.** Navigation still proceeds to `/sign-in` (the user is not trapped), BUT cookie clearance is UNCONFIRMED: the httpOnly cookie may persist, so a subsequent refresh-on-mount could re-hydrate the session on this browser. The design does NOT claim the cookie is cleared in this case. The in-memory/cache state is still gone (step 1), which limits same-tab exposure, but durable server-side session termination in this path depends on the backend revoke (backend design section 3) having succeeded, not on the client. This unconfirmed-clearance state is surfaced honestly (not silently treated as a clean logout).

The single-flight, catch-never-floating, and navigation-after-teardown properties from 4.4 apply here too. The F1 cookie-arm race (an in-flight `/refresh` re-writing the cookie AFTER this logout cleared it) is a SEPARATE concern owned by the backend design's atomic revoke - even a confirmed clearance here can be undone by a straddling refresh, which is exactly why the backend logout-durability design (section 10 / the backend companion) is required alongside this client contract.

The bump-first ordering (4.3 step 1) means the instant the dead session is detected, every other in-flight request is already epoch-dead and cannot re-drive `triggerSessionLost` (4.2 pre-side-effect gate) - so concurrent 401s collapse to this one teardown.

### 4.6 Mutations and optimistic state

Today: zero optimistic patterns; the one `setQueryData` write-back (`useBranches.ts:249`) runs in a hook-level `onSuccess`. Correcting the reasoning (adversarial review F2/F3): that `onSuccess` DOES fire after the screen unmounts, and in the in-flight-at-logout path the pipeline (with its `clear()`) runs FIRST, so a late `onSuccess`->`setQueryData` lands AFTER `clear()` and is NOT wiped by it. The actual protection is therefore (a) the transport epoch guard rejecting the mutationFn's response the moment it resolves post-bump (SESSION_SWITCHED -> mutation errors -> `onSuccess` never runs), and (b) the next `setSession` re-running the pipeline `clear()`. The only residue window is a mutation whose `apiFetch` returned data pre-bump but whose `onSuccess` runs post-clear; that entry is never rendered (portal unmounting to /sign-in) and is cleared at next login. Future optimistic patterns inherit the transport guard automatically because rollback/commit both consume apiFetch results. The spec imposes NO new per-mutation obligations.

### 4.7 What is deliberately kept

- The #381 fresh-observer + own-fetch-gate machinery in `useBranchCapability` REMAINS (defence in depth for the highest-privilege UI decision; its removal trigger stays tied to the Railway #364 deployment, and any simplification is a separate later cleanup, not this change).
- `redeemo_merchant_device_id` in localStorage intentionally survives logout (known-device OTP UX; random UUID, no account data). Documented as accepted.
- Multi-tab behaviour unchanged (section 2 fact 6).
- No React Query key changes, no persistence layer, no schema/backend/provider change of any kind.

## 5. Coverage cross-check (owner-required areas -> design section)

| Required area | Covered by |
|---|---|
| Normal logout | 4.3 signOut call site |
| Hard logout / session revocation | 4.3 onSessionLost call site; latch semantics unchanged |
| Login as another merchant, same tab | 4.3 setSession call site (pipeline before token apply) |
| Account replacement without full reload | 4.3 setSession; empty cache => skeletons |
| Cached successful data | 4.3 step 3 clear() |
| Cached errors | 4.3 step 3 (clear removes error states) |
| Active/in-flight requests | 4.2 epoch guard + 4.3 step 2 cancelQueries |
| Mutations + optimistic state | 4.6 (none optimistic today; triple defence; future-proof via transport guard) |
| Cancellation ordering | 4.3 normative order: epoch -> cancel -> clear -> state/nav, with rationale per step |
| Query removal/clearing timing | 4.3 steps 2-3 (cancel BEFORE clear so nothing settles in between) |
| Old-bearer responses repopulating cache | 4.2 transport guard + 4.3 step-2 token-null (post-clear refetch protection, F5); in-memory mint arm closed, cookie arm = open owner decision (section 10) |
| Flashes of prior-account data | 4.3 step 3 (empty cache) + shell residual closes centrally (section 1) |
| Test strategy | section 6 |
| Rollback strategy | section 8 |

## 6. Test strategy (implementation-time obligations)

Unit - epoch + transport guard: old-epoch apiFetch resolution discarded (typed error, no data delivery); old-epoch doRefresh resolution returns false and does NOT setAccessToken (regression pin for section 3); post-refresh retry straddling a bump is discarded; same-epoch paths byte-equivalent to today (no behaviour change without a boundary).
Unit - teardown pipeline: seed cache -> signOut -> cache empty + all queries cancelled; same for hard-logout and setSession; ordering pin (a fetch resolving between cancel and clear cannot survive - deferred-promise test); mutation-cache cleared.
Integration (jest, real QueryClient, mocked network): full account-switch simulation - user A data cached + one hung in-flight request; logout; login as B; resolve A's hung request; assert: no A data in cache, no A data rendered, tokenStore holds only B's token; the #381 capability suite (20 cases) stays green unchanged.
Unit - normal-logout cookie-clearance contract (section 4.5, Codex Wave 12): (a) client state (epoch/token/cache) is cleared BEFORE the BFF logout is awaited - assert `resetSessionState` completed (token null, cache empty) while the BFF logout mock is still pending; (b) normal navigation WAITS for the bounded BFF response - with a deferred logout mock, assert `router.replace('/sign-in')` has NOT been called until the response resolves (or the bounded timeout fires); (c) a resolved 2xx logout response is treated as confirmed cookie clearance (requires the reworked `authApi.logout` that RETURNS the status rather than swallowing it - F2); (d) the BFF timeout / unreachable path still navigates BUT surfaces cookie clearance as UNCONFIRMED (not silently clean) - assert the honest-degraded state is reported; (e) navigation-abort behaviour is NOT assumed - there is no test or code path that relies on a request completing after navigation (no keepalive dependency); the await-before-navigate ordering is what guarantees the request is not aborted; (f) the revoke fires despite the in-memory token being null before the BFF call - assert the BFF logout still triggers a backend revoke (cookie-derived, F1), i.e. clearing the token first does not skip the revoke.
Mutation evidence (minimum): (a) remove the epoch bump from setSession -> account-switch test fails; (b) remove the doRefresh epoch check -> mint-after-logout pin fails; (c) reorder clear() before cancelQueries() -> ordering pin fails; (d) navigate before awaiting the BFF logout response -> the "navigation waits for bounded BFF completion" pin fails.
E2E (existing Playwright lane, additive spec): sign-out -> sign-in journey asserting no stale-data paint (skeletons/empty on first render of the new session).

## 7. Alternatives considered and rejected

- **Epoch-prefixed query keys** (partitioning): touches every hook, leaks old-session entries until GC (memory + privacy), complicates invalidation; rejected.
- **Per-hook fresh observers everywhere** (generalising #381): O(consumers) bespoke machinery, proven brittle by the adoption vector; rejected as primary (kept only as defence in depth where it exists).
- **AbortController plumbing through apiFetch**: true network-level cancellation is attractive but touches every call signature and buys little beyond the epoch guard (the response is discarded either way; the socket close is an optimisation); deferred as an optional future enhancement, not part of this design.
- **Full page reload on logout** (`window.location`): would incidentally reset all module state but is a UX regression, does not cover the setSession-without-logout path, and hides rather than fixes the architecture; rejected.

## 8. Risks and rollback

- R1 - cold-cache cost per login: taxonomy/static caches refetch after every switch. Accepted (correctness over warmth; the taxonomy is 2 requests).
- R2 - clear() breadth: any future code holding a queryKey reference across the boundary sees fresh state, which is the intended semantic. No persisted cache exists, so clear() is complete.
- R3 - single-flight refresh straddling a boundary (corrected per F4): WITHOUT the 4.3 step-2 `refreshInFlight` reset, a new-session request that 401s would adopt the stale epoch-poisoned promise, receive `false`, and fall into `setAccessToken(null); triggerSessionLost()` (`client.ts:109-116`) - a spurious HARD LOGOUT of the NEW user, not merely an extra round-trip. The step-2 reset removes this by forcing the new session to start its own refresh. Residual (both promises somehow coexisting) is a tiny race in the fail-safe direction; accepted.
- R4 - SESSION_SWITCHED error surfacing: consumers may momentarily show a query error state during teardown, and the default `retry: 1` (`providers.tsx:16`) means an un-cancelled in-flight query hit by the guard attempts one retry (another SESSION_SWITCHED) before erroring - a brief extra request burst, not a single clean error. The tab is navigating to /sign-in at that instant and the cache is cleared, no `throwOnError`/suspense is in use, so no user-visible artefact is expected. Tests pin that the error never renders.
- Rollback: single `git revert` of the implementation PR. Client-only, no schema/provider/storage/backend change, no data migration, no flag needed.

## 9. Out of scope

Backend/session/token semantics; multi-tab propagation; customer-web and admin-web (each needs its own audit - admin-web uses localStorage sessions and is a DIFFERENT posture); AbortController plumbing (7); #381 machinery simplification (4.7).

## 10. OPEN OWNER DECISION - cookie-arm logout durability (F1)

This client-only design closes the in-memory mint-after-logout arm but CANNOT make logout durable against the cookie arm (section 3): a `/refresh` in flight at logout re-writes a valid httpOnly cookie server-side that the client cannot un-set. Closing it needs a backend/BFF change, which this design deliberately scopes out of the client PR.

**Codex Wave 11 direction (recorded as the accepted position in principle): Option A.** Merchant devices may be shared (a branch tablet, a back-office machine used by successive staff), so accepting previous-account rehydration after logout is UNSAFE - option C (accept + document) is rejected. Option B (BFF re-clear guard) is INSUFFICIENT unless it works across serverless instances: the BFF runs on stateless serverless functions, so a "logout-in-progress" marker held in one instance's memory does not see a `/refresh` served by another instance; B only holds with a shared cross-instance store, at which point A is the cleaner design. The durable fix is therefore reliable SERVER-SIDE session revocation (A), specified in a SEPARATE backend/BFF design (see below) and NOT implemented in this client PR.

- **(A) Backend revoke-before-clear with a reliable revoke - ACCEPTED IN PRINCIPLE.** `logout` awaits a NON-best-effort backend revoke that invalidates the session id server-side, so a straddling `/refresh` (single-use rotation on a now-revoked session) FAILS and the BFF clears rather than rotates the cookie. Strongest; requires a backend change; owned by the separate design.
- **(B) BFF re-clear guard - REJECTED as primary** (serverless cross-instance gap above).
- **(C) Accept + document - REJECTED** (shared-device rehydration is unsafe).

Companion backend/BFF design: `docs/superpowers/specs/2026-07-06-merchant-logout-durability-backend-design.md` (separate PR/track). It must cover: reliable server-side session revocation; refresh-versus-logout ordering; local cookie/cache clearing even when the remote revoke FAILS (logout must always reach a locally-clean state); bounded failure behaviour (a revoke timeout must not hang or silently no-op logout); and tests proving an in-flight refresh cannot restore a logged-out account across serverless instances.

This decision does NOT block the client-side cache-isolation work (sections 4-8), which is independently valuable and ships regardless; the cookie arm is called out so this docs PR does not imply the mint defect is fully closed by the client change alone.
