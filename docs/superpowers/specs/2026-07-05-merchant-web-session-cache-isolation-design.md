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

`apiFetch`/`apiFetchResponse` and `doRefresh` capture `getSessionEpoch()` at entry. After ANY resolution (including the post-refresh retry), if the current epoch differs from the captured epoch, the result is DISCARDED: apiFetch throws a typed `ApiError` with a reserved synthetic code (`SESSION_SWITCHED`), and `doRefresh` returns `false` WITHOUT calling `setAccessToken`. Consequences:

- An old-bearer data response can never be delivered to any consumer (query, mutation, or ad-hoc caller) after a session switch - this is what "prevent old-bearer responses repopulating the cache" means enforced at the choke point every request already flows through.
- The section 3 mint-after-logout defect closes: the stale refresh resolution is dropped before `setAccessToken`.
- The single-flight `refreshInFlight` promise needs no teardown reset: any awaiter that outlives the switch receives a result that the epoch guard already neutralised; and `tryRefresh` callers from the new epoch start a NEW refresh because the stale promise self-nulled on settle. (If a stale refresh is STILL in flight when the new session's first 401 occurs, single-flight would hand the new caller the old-epoch promise; the guard makes it resolve `false`, the caller's retry path treats it as a failed refresh. Defensive acceptability analysed in section 8, risk R3.)

### 4.3 Teardown pipeline (ordering is normative)

One exported async function, e.g. `resetSessionState(queryClient)` in `lib/auth/sessionReset.ts`, is the ONLY implementation of the boundary and is called from all three boundary sites. The order is normative:

1. `bumpSessionEpoch()` - instantly invalidates every in-flight request and any pending refresh at the transport layer (nothing that was issued before this line can deliver data or a token after it).
2. `setAccessToken(null)` + reset `refreshInFlight` to null (a new exported `resetRefreshInFlight()` from `client.ts`). Nulling the token BEFORE the cache is cleared is LOAD-BEARING (adversarial review F5): `clear()` on a still-mounted observer (the logout-from-portal path, before navigation unmounts it) can render-trigger a refetch; with the token already null that refetch carries no old bearer, and since it is issued post-bump the epoch guard would NOT discard it (its captured epoch equals the current epoch) - so token-nulling, not the guard, is what protects these post-clear refetches. Resetting `refreshInFlight` (F4) stops the new session from adopting the previous session's epoch-poisoned refresh promise (which would otherwise resolve `false` and trigger a spurious HARD logout of the NEW session via `client.ts:113`).
3. `await queryClient.cancelQueries()` - cancels every query retryer so nothing settles into the cache between steps 3 and 4. (Per verified v5 semantics a cancelled retryer discards late network resolutions; the epoch guard backstops even pathological escapes.)
4. `queryClient.clear()` - removes every query AND mutation cache entry: cached data, cached errors, paused mutations, in-flight mutation records. The next account starts from an empty cache - loading skeletons, never prior-account paint.
5. Caller-specific state clearing proceeds as today (merchant React state via `setMerchant(null)`/replacement - already present in all three sites; navigation).

Call sites and their deltas:
- **Normal logout** (`signOut`): backend revoke + cookie clear stay as-is; insert `await resetSessionState(qc)` before `router.replace('/sign-in')`.
- **Hard logout** (`onSessionLost` handler in `SessionProvider`): same insertion. `triggerSessionLost`'s at-most-once latch semantics are unchanged.
- **Login** (`setSession`): run the SAME pipeline BEFORE applying the new token/merchant. This is what makes same-tab account replacement without a full page reload safe even when no explicit logout preceded it, and it globally retires the #381 empty-cache in-flight-adoption class (any pre-login hung request is epoch-dead and its retryer cancelled before the first new-session query mounts).

`SessionProvider` obtains the client via `useQueryClient()` - it already renders inside `QueryClientProvider` (`app/providers.tsx:21-23`).

### 4.4 Mutations and optimistic state

Today: zero optimistic patterns; the one `setQueryData` write-back (`useBranches.ts:249`) runs in a hook-level `onSuccess`. Correcting the reasoning (adversarial review F2/F3): that `onSuccess` DOES fire after the screen unmounts, and in the in-flight-at-logout path the pipeline (with its `clear()`) runs FIRST, so a late `onSuccess`->`setQueryData` lands AFTER `clear()` and is NOT wiped by it. The actual protection is therefore (a) the transport epoch guard rejecting the mutationFn's response the moment it resolves post-bump (SESSION_SWITCHED -> mutation errors -> `onSuccess` never runs), and (b) the next `setSession` re-running the pipeline `clear()`. The only residue window is a mutation whose `apiFetch` returned data pre-bump but whose `onSuccess` runs post-clear; that entry is never rendered (portal unmounting to /sign-in) and is cleared at next login. Future optimistic patterns inherit the transport guard automatically because rollback/commit both consume apiFetch results. The spec imposes NO new per-mutation obligations.

### 4.5 What is deliberately kept

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
| Mutations + optimistic state | 4.4 (none optimistic today; triple defence; future-proof via transport guard) |
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
Mutation evidence (minimum): (a) remove the epoch bump from setSession -> account-switch test fails; (b) remove the doRefresh epoch check -> mint-after-logout pin fails; (c) reorder clear() before cancelQueries() -> ordering pin fails.
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

Backend/session/token semantics; multi-tab propagation; customer-web and admin-web (each needs its own audit - admin-web uses localStorage sessions and is a DIFFERENT posture); AbortController plumbing (7); #381 machinery simplification (4.5).

## 10. OPEN OWNER DECISION - cookie-arm logout durability (F1)

This client-only design closes the in-memory mint-after-logout arm but CANNOT make logout durable against the cookie arm (section 3): a `/refresh` in flight at logout re-writes a valid httpOnly cookie server-side that the client cannot un-set. Closing it needs a backend/BFF change, which this design deliberately scopes out. Options for the owner:

- **(A) Backend revoke-before-clear with a reliable revoke.** Make `logout` await a NON-best-effort backend revoke that invalidates the session id, so a straddling `/refresh` (single-use rotation on a revoked session) fails and clears rather than rotates. Strongest; a backend change.
- **(B) BFF re-clear guard.** Track a logout-in-progress marker in the BFF; if `/refresh` completes during that window, immediately `clearSessionCookie` again. Cheaper; BFF-only; a small race remains between the two writes.
- **(C) Accept + document.** The window is narrow (a refresh must be mid-flight at the logout click) and the residue is "the previous account can re-hydrate on this browser until the refresh token naturally expires or is used elsewhere." For a single-operator device this may be acceptable at current risk.

Recommendation: (A) if logout durability is treated as a security requirement; otherwise (C) with an explicit accepted-risk note. This decision does NOT block the client-side cache-isolation work (sections 4-8), which is independently valuable and ships regardless; it is called out so the docs PR does not imply the mint defect is fully closed.
