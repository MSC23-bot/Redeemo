# Implementation plan: merchant-web session cache isolation

Status: PLANNING ONLY - docs-only PR. Implementation is OWNER-GATED behind approval of this plan + the companion spec.
Companion design spec: `docs/superpowers/specs/2026-07-05-merchant-web-session-cache-isolation-design.md` (owns the durable semantics: threat model, epoch guard, teardown pipeline ordering, coverage cross-check, risks). This plan owns execution sequencing.
Provenance: main `3a097161`. Tier 3 (auth/session architecture) under the repository workflow calibration.

## 0. Scope guard

Client-only, `apps/merchant-web/**`. NO backend, BFF-cookie, schema, provider, or customer-web/admin-web change. No React Query key changes. The #381 `useBranchCapability` machinery is untouched. Estimated production-code footprint: ~4 files touched + 1 new module + tests.

## 1. Task sequence

### T1 - Session epoch module
`lib/auth/tokenStore.ts` (or sibling `sessionEpoch.ts`): `getSessionEpoch(): number` + `bumpSessionEpoch(): void` (module-scope counter). Unit pins: monotonicity; independence from token value.

### T2 - Transport epoch guard
`lib/api/client.ts`:
- `apiFetchResponse`: capture epoch at entry; after the terminal resolution path (success, and after the one refresh-retry), if epoch changed throw `ApiError` with synthetic code `SESSION_SWITCHED` (status 0; never delivered as data).
- `doRefresh`: capture epoch before the fetch; on resolution with a changed epoch, return `false` WITHOUT `setAccessToken` (closes the spec section 3 in-memory mint-after-logout arm).
- **Session-side-effect epoch gate (Codex #3):** in the 401 branch, BEFORE `setAccessToken(null)` / `triggerSessionLost()` (or any token/session mutation), re-check the epoch against the captured value; if it moved, throw `SESSION_SWITCHED` and invoke NO logout callback (the request belongs to a dead session). Pin: an old-epoch request whose refresh returns false must NOT call `setAccessToken(null)` or the `onSessionLost` callback (spy asserts zero calls); a current-epoch request still hard-logs-out normally.
Unit pins per spec section 6, incl. the same-epoch byte-equivalence cases (no behaviour change absent a boundary).

### T3 - Teardown pipeline
New `lib/auth/sessionReset.ts`: `resetSessionState(queryClient)` implementing the normative order (spec 4.3): `bumpSessionEpoch()` -> `setAccessToken(null)` + `resetRefreshInFlight()` -> `await queryClient.cancelQueries()` -> `queryClient.clear()`. Add `resetRefreshInFlight()` export to `client.ts` (nulls the module single-flight). Ordering pins: (a) deferred-promise test that a fetch resolving between cancel and clear cannot survive; (b) F5 pin - a `clear()`-triggered refetch on a STILL-MOUNTED observer issues NO old-bearer request (token already null at that step); (c) F4 pin - after reset, a new-session 401 does NOT adopt the prior single-flight promise (no spurious hard logout).

### T4 - Boundary wiring (async contracts - Codex #2 + #4)
`lib/auth/session.tsx`: `useQueryClient()` in `SessionProvider`.
- **signOut** (already async): `await resetSessionState(qc)` before `router.replace('/sign-in')`.
- **setSession -> `Promise<void>` (Codex #2):** becomes async; `await resetSessionState(qc)` FIRST, then `applyToken(newToken)` + `setMerchant(m)`. The `SessionValue.setSession` type changes to `(t, m) => Promise<void>`. All three callers (`sign-in/page.tsx:48`, `otp/page.tsx:47`, `register/verify/page.tsx:57`) MUST `await setSession(...)` before navigation/subsequent action. Pin (Codex #2): a test proving the new token is NOT installed in tokenStore until the reset promise resolves (deferred `cancelQueries`; assert `getAccessToken()` is still null while the reset is pending, becomes the new token only after it resolves).
- **onSessionLost -> async ownership (Codex #4):** the handler starts ONE `resetSessionState(qc)` promise, stores it in a `teardownInFlightRef` (single-flight: re-entry reuses the same promise; a fresh `setAccessToken` clears the ref), navigates ONLY in its `.then()`, and `.catch()`es any rejection to a logged no-op that STILL navigates. No floating promise, no unhandled rejection. `triggerSessionLost`'s at-most-once latch is unchanged; refresh-on-mount stays byte-identical. Pins: duplicate-invocation reuses one teardown (spy: `cancelQueries` called once); a rejected teardown still navigates and surfaces no unhandled rejection; navigation happens only after the reset resolves (ordering pin).

### T5 - Integration + mutation evidence
The spec section 6 account-switch simulation (user A cached + hung in-flight; logout; login B; resolve A's request; assert no A data anywhere, tokenStore holds only B). Mutation evidence minimum: (a) drop the setSession epoch bump; (b) drop the doRefresh epoch check; (c) reorder clear() before cancelQueries(); (d) drop the session-side-effect epoch gate -> the old-epoch-no-hard-logout pin fails; (e) apply the new token before awaiting reset in setSession -> the token-not-installed-before-reset pin fails; (f) drop the onSessionLost single-flight ref -> the duplicate-teardown pin fails. Each must fail a named test; revert and re-verify after each.

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
