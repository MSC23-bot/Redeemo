# admin-web auth: localStorage → httpOnly-cookie / BFF migration (security audit H5, part 1 of 2)

> **For agentic workers:** Tier-2, plan-first. This plan covers **admin-web only**. customer-web is a
> separate follow-up PR/workstream (§Follow-up). Do NOT implement until the owner approves this plan.

**Goal:** Stop admin-web storing the long-lived **refresh token in `localStorage`** (XSS → durable session
theft, audit finding H5). Move to the proven merchant-web pattern: refresh token in an httpOnly+Secure+
SameSite cookie, access token in memory only, refresh via a same-origin BFF route with same-origin/CSRF
protection.

**Architecture:** Copy the merchant-web BFF-lite pattern verbatim, renamed for admin. The browser never
sees the refresh token: BFF route handlers hold it in an httpOnly cookie server-side and forward it to the
existing backend refresh endpoint. **No backend change** — the admin backend refresh contract
(`{refreshToken, sessionId, entityId}` → `{accessToken, refreshToken}`) is byte-identical to merchant's,
which already works this way.

**Tech Stack:** Next.js 15 App Router (admin-web), Next route handlers (BFF), `cookies()` from `next/headers`,
Vitest + Testing Library. Reference: `apps/merchant-web/lib/auth/**` + `apps/merchant-web/app/api/merchant-auth/**` + `apps/merchant-web/middleware.ts`.

**Rollout:** Force re-login on deploy (no migration code). Existing admin sessions have a localStorage
refresh token but no httpOnly cookie; the new client stops reading localStorage, so their next 401 refreshes
through the BFF, finds no cookie → clean 401 → `/login` redirect, within ≤15 min (access-token TTL). This is
the same dead-session path the client already handles.

**Backend changes: NONE.** Verified: `src/api/auth/admin/routes.ts:30-36` already accepts
`{refreshToken, sessionId, entityId}` and returns `{accessToken, refreshToken}` — identical to
`src/api/auth/merchant/routes.ts:51-53`. The BFF forwards the cookie-borne token in the body exactly as
admin-web's current `client.ts doRefresh()` already forwards the localStorage token.

---

## 1. Current admin-web auth (what changes)

| Concern | Today (localStorage) | File:line |
|---|---|---|
| Token storage | access + refresh + `{entityId,sessionId}` all in `localStorage`; a non-httpOnly flag cookie `redeemo_admin_auth` written but **never read** (vestigial) | `apps/admin-web/lib/auth/session.ts:110-188` |
| Login | OTP flow → `setSession({accessToken, refreshToken, meta})` writes all localStorage keys | `apps/admin-web/app/(auth)/login/page.tsx:116-146` |
| API client | Bearer from `getAccessToken()`; 401 → `doRefresh()` **POSTs the refresh token straight to the backend** `/api/v1/admin/auth/refresh` | `apps/admin-web/lib/api/client.ts:94-168` |
| Logout | `authApi.logout()` (bearer) then `clearSession()` | `apps/admin-web/components/admin-shell.tsx:57-66` |
| Route gate | **No middleware.** Client-side render-guard: `useEffect` redirect + spinner-until-ready | `apps/admin-web/components/admin-shell.tsx:51-55, 72-81` |

**In scope of `session.ts`:** only the token/session-storage block (lines 110-188). The
`hasCapability`/`AdminCapability`/`AdminRole` (18-108) and `getOrCreateDeviceId()`/`decodeAdminJwt()`
(191-266) blocks are NOT token storage and stay unchanged.

**Explicitly OUT of scope (declared, per source inspection):** merchant-web's cross-account-switch
"session epoch" guard (`sessionEpoch.ts`, `assertEpoch`, `guardStaleReject`). admin-web has no
switch-accounts-in-one-tab flow, so we do NOT port it here. (Cross-user cache isolation is a separate
audit item, not H5.) The vestigial `redeemo_admin_auth` flag cookie is **removed** — the new httpOnly
session cookie's presence is what middleware will gate on.

## 2. merchant-web reference to copy (verbatim, renamed)

| Purpose | Reference file | Copy to |
|---|---|---|
| In-memory access token + hard-logout latch | `apps/merchant-web/lib/auth/tokenStore.ts` | `apps/admin-web/lib/auth/tokenStore.ts` |
| httpOnly session cookie set/read/clear | `apps/merchant-web/lib/auth/cookies.ts` (`redeemo_merchant_session`, httpOnly/secure-in-prod/SameSite=lax/path=/) | `apps/admin-web/lib/auth/cookies.ts` (`redeemo_admin_session`) |
| `assertSameOrigin` + `completeBffLogin` | `apps/merchant-web/lib/auth/bff.ts` | `apps/admin-web/lib/auth/bff.ts` |
| BFF login/otp-verify/refresh/logout | `apps/merchant-web/app/api/merchant-auth/*/route.ts` | `apps/admin-web/app/api/admin-auth/*/route.ts` |
| Cookie-presence middleware + redirect-before-paint | `apps/merchant-web/middleware.ts` | `apps/admin-web/middleware.ts` |
| Open-redirect guard | `apps/merchant-web/lib/auth/redirect.ts` (`safeNext`) | admin-web already has `safeNextPath()` in the login page — reuse it |
| Client refresh via BFF (no body/bearer) | `apps/merchant-web/lib/api/client.ts doRefresh()` | edit `apps/admin-web/lib/api/client.ts doRefresh()` |
| Test style | `apps/merchant-web/lib/auth/__tests__/{session,cookies}.test.*` | new admin-web tests |

## 3. Exact BFF routes needed (admin-web, all under `app/api/admin-auth/`)

All call `assertSameOrigin(req)` first (403 `CROSS_ORIGIN_BLOCKED` on cross-origin).

1. **`login/route.ts`** — `POST`. Body → `POST {BACKEND}/api/v1/admin/auth/login`. Admin login is OTP-first, so the response is typically `OTP_REQUIRED` (pass through unchanged, no cookie). If it ever returns tokens directly, `completeBffLogin` sets the cookie + returns `{accessToken, adminRole?, ...}`.
2. **`otp-verify/route.ts`** — `POST`. Body → `POST .../admin/auth/otp/verify`. On success: `completeBffLogin` decodes the JWT for `{sub, sessionId}`, `setSessionCookie({refreshToken, sessionId, entityId})`, returns **only** `{accessToken, meta}` (adminRole/email needed by the UI — return those, but NOT the refresh token).
3. **`refresh/route.ts`** — `POST`, no body. `readSessionCookie()` → if none, 401. Else `POST .../admin/auth/refresh` with `{refreshToken, sessionId, entityId}` from the cookie; on success rotate the cookie with the new refresh token and return **only** `{accessToken}`.
4. **`logout/route.ts`** — `POST`. Forward the captured access token (Authorization) and/or the cookie's `{refreshToken, sessionId, entityId}` to `POST .../admin/auth/logout` (bounded ~3s timeout, best-effort); **unconditionally** `clearSessionCookie()`; return `{ok:true}`.

**Backend URL base:** use admin-web's existing backend-base env (same `NEXT_PUBLIC_API_URL`/server env the current `client.ts` uses — reuse, do not introduce a new var).

## 4. Token-store changes
- New `apps/admin-web/lib/auth/tokenStore.ts` (copy of merchant's): module-scope `let accessToken`; `getAccessToken`/`setAccessToken`/`clearAccessToken`; `onSessionLost`/`triggerSessionLost` hard-logout latch.
- `session.ts` lines 110-188 rewritten: `getAccessToken` delegates to the in-memory store; **remove** `getRefreshToken`, `getSessionMeta` from localStorage, `setSession`/`updateTokens`/`clearSession` localStorage writes, and the `redeemo_admin_auth` flag-cookie writes. `setSession(accessToken, meta)` now just sets the in-memory access token (the refresh cookie is set server-side by the BFF). `clearSession()` clears the in-memory token + triggers the hard-logout latch (the cookie is cleared by the BFF logout route). Keep `decodeAdminJwt`/`getOrCreateDeviceId`/capabilities untouched.

## 5. Middleware changes (ADD — admin-web has none today)
- New `apps/admin-web/middleware.ts` mirroring merchant-web: gate all `(app)` routes on `req.cookies.has('redeemo_admin_session')` (presence only — httpOnly means middleware can't validate contents); redirect to `/login?next=<path>` before paint when absent. Matcher excludes `(auth)` pages, `/api/**`, and static assets. This also closes audit **L7** (admin-web had no route-gate middleware). Keep the existing `admin-shell` client render-guard as defence-in-depth (belt + suspenders), or simplify it to trust the middleware — decide in Task 6 (default: keep it, it's harmless).

## 5b. APPROVED GUARDRAILS (Codex, plan review @ 0a83592b) — MUST implement

**G1 — refresh-on-mount / bootstrap (the load-critical one).** Access tokens are memory-only, so a
page reload starts with NO access token even when the httpOnly session cookie is valid. The app MUST
attempt exactly one BFF refresh from the cookie on mount BEFORE deciding the admin is signed out.
Implementation: port merchant-web's `lib/auth/session.tsx` SessionProvider — on mount, call the BFF
`refresh` route once; while that is in flight the shell renders a "booting" state (NOT signed-out);
only when the bootstrap refresh FAILS (no cookie / backend refuses) does it treat the admin as
signed-out and redirect. `admin-shell`'s `ready` gate must mean "bootstrap refresh settled", not merely
"mounted", so middleware allowing the page (cookie present) never races the client into a wrong `/login`
bounce. Pin with a test: cookie-valid + no in-memory token + reload → one BFF refresh → shell renders
(no bounce); bootstrap refresh fails → redirect to `/login`.

**G2 — logout matches the real backend contract.** `POST /api/v1/admin/auth/logout` is
`authenticateAdmin` (bearer-authed) — NOT cookie/body-only. The BFF `logout` route MUST forward the
captured in-memory access token as `Authorization: Bearer <token>` when present, run the backend revoke
as bounded best-effort (short timeout, swallow failure), and ALWAYS `clearSessionCookie()` regardless of
the backend result. Do not assume a cookie/body-only logout. Pin with a test: logout forwards the bearer
when present; backend failure/timeout still clears the cookie and returns ok.

## 6. Logout / refresh / 401 handling
- **Login/OTP:** `login/page.tsx` calls the BFF `login`/`otp-verify` routes instead of the direct backend `authApi`; on success it sets only the in-memory access token from the BFF response (no localStorage). `safeNextPath()` guard unchanged.
- **Refresh (401):** `client.ts doRefresh()` becomes `fetch('/api/admin-auth/refresh', { method: 'POST' })` — no body, no bearer; on `{accessToken}` → `setAccessToken`; on failure → `clearSession()` + `redirectToLogin()` (unchanged). The single-flight `tryRefresh()` wrapper stays.
- **Logout:** `admin-shell onLogout()` calls the BFF `logout` route (clears the cookie server-side) then `clearSession()` + redirect. 

## 7. Rollout for existing sessions
Force re-login (no migration). No code reads the old localStorage refresh token after this change; existing sessions 401 within ≤15 min → BFF refresh finds no cookie → `/login`. Clean, one-time, same code path as any dead session. (Optional courtesy: a one-line `localStorage.removeItem` sweep of the three old keys on first load to avoid stale confusion — nice-to-have, not required.)

## 8. Backend changes
**NONE.** (See header + §current. Verified against `src/api/auth/admin/routes.ts` vs `src/api/auth/merchant/routes.ts`.)

## 9. Test plan
- **New** `apps/admin-web/lib/auth/__tests__/cookies.test.ts` — cookie set/read/clear + flags (httpOnly/secure/sameSite), cribbed from merchant-web.
- **New** `apps/admin-web/lib/auth/__tests__/tokenStore.test.ts` — in-memory get/set/clear + hard-logout latch.
- **New** `apps/admin-web/app/api/admin-auth/__tests__/*.test.ts` — per BFF route: `assertSameOrigin` 403 on cross-origin; refresh with-cookie → rotates cookie + returns only `{accessToken}` (never the refresh token); refresh no-cookie → 401; logout always clears cookie; login OTP_REQUIRED pass-through.
- **Rewrite** the 4 existing localStorage-assuming suites to the BFF/in-memory style:
  `lib/auth/__tests__/session.test.ts`, `lib/api/__tests__/client.test.ts`,
  `app/(auth)/login/__tests__/login-page.test.tsx`, `app/(auth)/login/__tests__/next-redirect.test.tsx`.
- **New** `apps/admin-web/__tests__/middleware.test.ts` (or route-level) — cookie present → pass; absent → redirect to `/login?next=`; `(auth)`/`/api`/static excluded.
- **Assertion invariant to pin:** the refresh token NEVER appears in any client-readable surface (no localStorage write; BFF responses contain only `{accessToken}` + non-secret meta). Add an explicit test that the OTP-verify/refresh BFF responses do not include a refresh token field.
- Gates: `apps/admin-web` typecheck + lint + `next build` + `jest`/vitest; then the full backend `npm run test:unit` is unaffected (no backend change) but run it once as a guard.

## 10. Risks & rollback
- **Risk:** highest-surface change (auth context, token store, client, middleware). Mitigated by copying a production-proven pattern verbatim + full test rewrite + the no-refresh-token-leak invariant test.
- **Risk:** forced re-login inconveniences admins signed in at deploy (one-time, ≤15 min). Acceptable + expected; communicate at deploy.
- **Risk:** middleware matcher misconfig could over/under-gate. Mitigated by copying merchant-web's matcher + a middleware test.
- **Rollback:** revert the single squash commit — restores localStorage behaviour exactly (no backend/schema/data change, so rollback is clean and instant; only cost is another forced re-login).
- **CSP note:** `script-src 'unsafe-inline'` remains (separate hardening); moving the refresh token out of JS reach is the point of H5 and stands regardless.

## 11. Task breakdown (TDD, bite-sized; each ends in a commit)
1. Add `tokenStore.ts` (+ test): in-memory access token + latch. Copy merchant-web; adjust names.
2. Add `cookies.ts` (+ test): `redeemo_admin_session` httpOnly cookie set/read/clear.
3. Add `bff.ts` (+ test): `assertSameOrigin` + `completeBffLogin` (returns access token + meta, never refresh).
4. Add the 4 BFF routes under `app/api/admin-auth/` (+ per-route tests), including the no-refresh-token-leak assertion.
5. Rewrite `session.ts:110-188` to delegate to the in-memory store + drop localStorage/flag-cookie; keep the rest of the file. Update `useSession.ts` consumer.
6. Repoint `client.ts doRefresh()` at the BFF refresh route (no body/bearer); keep single-flight + 401 clear/redirect.
7. Repoint `login/page.tsx` + `admin-shell onLogout` at the BFF login/otp-verify/logout routes.
8. Add `middleware.ts` (+ test) gating on cookie presence (closes L7); decide on keeping the client render-guard.
9. Rewrite the 4 localStorage-assuming test suites.
10. Full admin-web gates (typecheck/lint/build/test) + backend `test:unit` guard; Opus adversarial review (cookie flags, CSRF/same-origin, no-refresh-token-leak, 401/refresh/logout correctness, middleware bypass); PR.

## Follow-up (separate workstream, NOT this PR)
- **customer-web** H5 (same migration; customer-web currently mirrors the same localStorage pattern) — its own plan + PR after admin-web lands.
- **Deferred (from H4):** per-request session-liveness check for admin (instant revocation vs ≤15 min) — optional, can piggyback on this admin-web/auth work or stay separate.
