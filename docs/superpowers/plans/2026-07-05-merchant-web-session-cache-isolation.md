# Implementation plan: merchant-web session cache isolation

Status: PLANNING ONLY - docs-only PR. Implementation is OWNER-GATED behind approval of this plan + the companion spec.
Companion design spec: `docs/superpowers/specs/2026-07-05-merchant-web-session-cache-isolation-design.md` (owns the durable semantics: threat model, epoch guard, teardown pipeline ordering, coverage cross-check, risks). This plan owns execution sequencing.
Provenance: main `3a097161`. Tier 3 (auth/session architecture) under the repository workflow calibration.

## 0. Scope guard

Client-only, `apps/merchant-web/**`. No React Query key changes. The #381 `useBranchCapability` machinery is untouched. Estimated production-code footprint: ~5 files touched + 1 new module + tests. NOTE on the BFF-cookie boundary (adversarial review F1/F2): the client cache-isolation change itself is client-only, BUT the confirmed-cookie-clearance logout contract (spec 4.5) requires two coupled changes that this plan flags as its dependency on the companion backend/BFF design: (1) `lib/api/auth.ts` `authApi.logout` MUST be reworked (F2) - accept an `AbortSignal`, STOP swallowing errors (`.catch(()=>{})` today), and RETURN the `Response`/status (and read the `{ ok, remoteRevoke }` body) so `signOut` can label confirmed-vs-UNCONFIRMED clearance; (2) the logout revoke must be PROOF-BEARING via the SIGNED access-token JWT (Codex Wave 12 round-3; owned by backend design 3.3): `signOut` captures `getAccessToken()` BEFORE reset and forwards it; the backend verifies the JWT signature (expiry-ignored), derives `sessionId`/`entityId` from the SIGNED claims, and DELs unconditionally (winning the concurrent-refresh race). Refresh-token possession is a fallback for the no-token case. NEVER trust the unsigned cookie ids as authority. If the owner wants the client PR strictly client-only, the logout-contract change ships WITH the backend/BFF design PR, not this one.

## 1. Task sequence

### T1 - Session epoch module
`lib/auth/tokenStore.ts` (or sibling `sessionEpoch.ts`): `getSessionEpoch(): number` + `bumpSessionEpoch(): void` (module-scope counter). Unit pins: monotonicity; independence from token value.

### T2 - Transport epoch guard
`lib/api/client.ts`:
- `apiFetchResponse`: capture epoch at entry; after the terminal resolution path (success, and after the one refresh-retry), if epoch changed throw `ApiError` with synthetic code `SESSION_SWITCHED` (status 0; never delivered as data). **F2 retry-capture threading:** the 401-retry re-enters `apiFetchResponse` recursively (`client.ts:111`), which would capture a FRESH epoch; thread the ORIGINAL captured epoch through as a private `options._epoch` so the retry compares against the original, not a fresh capture. Pin: a boundary between refresh-success and the retry entry -> the retry result is discarded (not delivered into the cleared cache).
- `doRefresh`: capture epoch before the fetch; on resolution with a changed epoch, return `false` WITHOUT `setAccessToken` (closes the spec section 3 in-memory mint-after-logout arm).
- **Session-side-effect epoch gate (Codex #3):** in the 401 branch, BEFORE `setAccessToken(null)` / `triggerSessionLost()` (or any token/session mutation), re-check the epoch against the captured value; if it moved, throw `SESSION_SWITCHED` and invoke NO logout callback (the request belongs to a dead session). Pin: an old-epoch request whose refresh returns false must NOT call `setAccessToken(null)` or the `onSessionLost` callback (spy asserts zero calls); a current-epoch request still hard-logs-out normally.
Unit pins per spec section 6, incl. the same-epoch byte-equivalence cases (no behaviour change absent a boundary).

### T3 - Teardown pipeline
New `lib/auth/sessionReset.ts`: `resetSessionState(queryClient)` implementing the normative order (spec 4.3): `bumpSessionEpoch()` -> `setAccessToken(null)` + `resetRefreshInFlight()` -> `await queryClient.cancelQueries()` -> `queryClient.clear()`. Add `resetRefreshInFlight()` export to `client.ts` (nulls the module single-flight). ALSO add the F1 self-ownership guard to `tryRefresh`: `const p = doRefresh(); refreshInFlight = p; p.finally(() => { if (refreshInFlight === p) refreshInFlight = null })` so a stale promise's `.finally` cannot clobber a newer session's slot. Ordering pins: (a) deferred-promise test that a fetch resolving between cancel and clear cannot survive; (b) F5 pin - a `clear()`-triggered refetch on a STILL-MOUNTED observer issues NO old-bearer request (token already null at that step); (c) F4-adopt pin - after reset, a new-session 401 does NOT adopt the prior single-flight promise; (d) F1-clobber pin - an OLD promise settling AFTER a new one is created must NOT null the new slot (assert the new single-flight survives the old promise's `.finally`).

### T4 - Boundary wiring (async contracts - Codex #2 + #4)
`lib/auth/session.tsx`: `useQueryClient()` in `SessionProvider`.
- **signOut** (already async) - confirmed-cookie-clearance contract (spec 4.5, Codex Wave 12): `await resetSessionState(qc)` FIRST (client epoch/token/cache cleared); THEN `await authApi.logout()` wrapped in a STRICT bounded timeout (AbortController + timer); THEN `router.replace('/sign-in')`. The BFF always clears the cookie on its response; awaiting the bounded 2xx response is the evidence the httpOnly cookie is cleared (JS cannot clear it). Do NOT navigate before awaiting (no fire-and-forget; navigation would abort a non-keepalive request before the clearing response lands). On BFF timeout/unreachable: still navigate, but surface cookie clearance as UNCONFIRMED (do not claim clean). No `keepalive` (the await-before-navigate ordering means the request is never aborted). Pins per spec section 6 (state-cleared-before-await; navigation-waits-for-bounded-BFF; confirmed-on-2xx; honest-unconfirmed-on-timeout; no navigation-abort assumption).
- **setSession -> `Promise<void>` (Codex #2):** becomes async; `await resetSessionState(qc)` FIRST, then `applyToken(newToken)` + `setMerchant(m)`. The `SessionValue.setSession` type changes to `(t, m) => Promise<void>`. All three callers (`sign-in/page.tsx:48`, `otp/page.tsx:47`, `register/verify/page.tsx:57`) MUST `await setSession(...)` before navigation/subsequent action. Pin (Codex #2): a test proving the new token is NOT installed in tokenStore until the reset promise resolves (deferred `cancelQueries`; assert `getAccessToken()` is still null while the reset is pending, becomes the new token only after it resolves).
- **onSessionLost -> async ownership (Codex #4):** the handler starts ONE `resetSessionState(qc)` promise, stores it in a `teardownInFlightRef` (single-flight: re-entry reuses the same promise; a fresh `setAccessToken` clears the ref), navigates ONLY in its `.then()`, and `.catch()`es any rejection to a logged no-op that STILL navigates. No floating promise, no unhandled rejection. `triggerSessionLost`'s at-most-once latch is unchanged; refresh-on-mount stays byte-identical. Pins: duplicate-invocation reuses one teardown (spy: `cancelQueries` called once); a rejected teardown still navigates and surfaces no unhandled rejection; navigation happens only after the reset resolves (ordering pin).

### T5 - Integration + mutation evidence
The spec section 6 account-switch simulation (user A cached + hung in-flight; logout; login B; resolve A's request; assert no A data anywhere, tokenStore holds only B). Mutation evidence minimum: (a) drop the setSession epoch bump; (b) drop the doRefresh epoch check; (c) reorder clear() before cancelQueries(); (d) drop the session-side-effect epoch gate -> the old-epoch-no-hard-logout pin fails; (e) apply the new token before awaiting reset in setSession -> the token-not-installed-before-reset pin fails; (f) drop the onSessionLost single-flight ref -> the duplicate-teardown pin fails; (g) navigate before awaiting the bounded BFF logout response in signOut -> the "navigation waits for bounded BFF completion" pin fails. Each must fail a named test; revert and re-verify after each.

### T6 - E2E (additive, existing Playwright lane)
Sign-out -> sign-in journey pinning no stale-data paint (new-session first render shows skeleton/empty, never prior-account values). Additive spec + additive-only mocks per the established lane conventions.

### T7 - Full gates
merchant-web full jest; `tsc --noEmit`; eslint on touched files; full Playwright lane twice; `git diff --check`. The #381 capability suite (20 cases) must pass UNCHANGED - any needed edit there is a design smell requiring a pause.

## 2. Review protocol

Implementation in an isolated worktree; Sonnet may execute mechanical tasks; a FRESH Opus adversarial review of the implemented boundary (attack surfaces: epoch capture points, single-flight straddle, mutation unmount races, ordering) before any push; Fable adjudicates all findings with evidence; single PR; SHA-bound owner/Codex approval before merge (standing rule).

## 3. Rollback

Single `git revert`. No flag, no migration, no stored state. Spec section 8.

## 4. Cookie-arm logout durability - separate backend/BFF track (Codex Wave 11)

Spec section 10. Codex direction: Option A (reliable server-side revocation) is accepted in principle; B is insufficient on serverless (cross-instance gap), C is unsafe (shared merchant devices). This is a SEPARATE backend/BFF design at `docs/superpowers/specs/2026-07-06-merchant-logout-durability-backend-design.md` and is NOT implemented in the client PR. Do NOT fold a backend change into the client-only implementation. The client cache-isolation work (T1-T7) ships independently of it.

## 5. Explicitly deferred

AbortController network-level cancellation (spec section 7); multi-tab logout propagation; admin-web/customer-web equivalents (separate audits - admin-web's localStorage session is a different posture); #381 fresh-observer simplification after the Railway #364 deployment lands.
