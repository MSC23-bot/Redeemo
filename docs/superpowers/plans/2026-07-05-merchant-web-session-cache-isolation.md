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
- `doRefresh`: capture epoch before the fetch; on resolution with a changed epoch, return `false` WITHOUT `setAccessToken` (closes the spec section 3 mint-after-logout defect).
Unit pins per spec section 6, incl. the same-epoch byte-equivalence cases (no behaviour change absent a boundary).

### T3 - Teardown pipeline
New `lib/auth/sessionReset.ts`: `resetSessionState(queryClient)` implementing the normative order (spec 4.3): `bumpSessionEpoch()` -> `setAccessToken(null)` + `resetRefreshInFlight()` -> `await queryClient.cancelQueries()` -> `queryClient.clear()`. Add `resetRefreshInFlight()` export to `client.ts` (nulls the module single-flight). Ordering pins: (a) deferred-promise test that a fetch resolving between cancel and clear cannot survive; (b) F5 pin - a `clear()`-triggered refetch on a STILL-MOUNTED observer issues NO old-bearer request (token already null at that step); (c) F4 pin - after reset, a new-session 401 does NOT adopt the prior single-flight promise (no spurious hard logout).

### T4 - Boundary wiring
`lib/auth/session.tsx`: `useQueryClient()` in `SessionProvider`; insert `await resetSessionState(qc)` in (a) `signOut` before navigation, (b) the `onSessionLost` handler before navigation, (c) `setSession` BEFORE applying the new token/merchant. No other behaviour change; the hard-logout latch and refresh-on-mount stay byte-identical.

### T5 - Integration + mutation evidence
The spec section 6 account-switch simulation (user A cached + hung in-flight; logout; login B; resolve A's request; assert no A data anywhere, tokenStore holds only B). Mutation evidence minimum: (a) drop the setSession epoch bump; (b) drop the doRefresh epoch check; (c) reorder clear() before cancelQueries(). Each must fail a named test; revert and re-verify after each.

### T6 - E2E (additive, existing Playwright lane)
Sign-out -> sign-in journey pinning no stale-data paint (new-session first render shows skeleton/empty, never prior-account values). Additive spec + additive-only mocks per the established lane conventions.

### T7 - Full gates
merchant-web full jest; `tsc --noEmit`; eslint on touched files; full Playwright lane twice; `git diff --check`. The #381 capability suite (20 cases) must pass UNCHANGED - any needed edit there is a design smell requiring a pause.

## 2. Review protocol

Implementation in an isolated worktree; Sonnet may execute mechanical tasks; a FRESH Opus adversarial review of the implemented boundary (attack surfaces: epoch capture points, single-flight straddle, mutation unmount races, ordering) before any push; Fable adjudicates all findings with evidence; single PR; SHA-bound owner/Codex approval before merge (standing rule).

## 3. Rollback

Single `git revert`. No flag, no migration, no stored state. Spec section 8.

## 4. Open owner decision (blocks nothing in T1-T7)

Spec section 10 - cookie-arm logout durability (F1). The client-side cache-isolation work ships independently; the cookie re-arm needs a backend/BFF change (options A/B/C in the spec). Surface for owner direction alongside this docs PR; do NOT fold a backend change into the client-only implementation without a separate approval.

## 5. Explicitly deferred

AbortController network-level cancellation (spec section 7); multi-tab logout propagation; admin-web/customer-web equivalents (separate audits - admin-web's localStorage session is a different posture); #381 fresh-observer simplification after the Railway #364 deployment lands.
