# PR-G1b - Deterministic local Playwright browser-smoke lane (merchant-web)

**Date:** 2026-07-04 · **Base:** `origin/main` @ `8c4258ba` (post shell-wave merge) · **Branch:** `feature/merchant-g1b-playwright-smoke`
**Authority:** roadmap `docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md` §8 (PR-G1b: deterministic LOCAL Playwright smoke against a locally-built merchant-web with a controlled API/session mock boundary; the smallest journeys that would have caught #324 and #327; NOT external Vercel/Railway) + owner authorization for `@playwright/test` (2026-07-04).

## 1. Dependency decision

`@playwright/test` **1.61.1** (exact-pinned devDependency, `apps/merchant-web` workspace only - the smallest scope; no root dependency, no other browser engines). Chromium is the single project. Verified genuinely required: the repo has zero e2e/browser tooling (`0 e2e tests repo-wide`, roadmap §8), and the #324/#327 class is invisible to jsdom + typed mocks by construction.

## 2. Safety boundary (layered)

1. The app under test is BUILT with `NEXT_PUBLIC_API_URL=http://127.0.0.1:9411` - a dead loopback port nothing listens on. Adversarial review claimed a developer's `.env.local` overrides the webServer's process env at build; adjudication REFUTED that for this lane's exact invocation (empirically: with both present, the sentinel wins - the reviewer's repro most likely matched a STALE chunk, since hashed chunks accumulate in `.next/static/chunks` across builds). Layer 1 is nonetheless ENFORCED rather than assumed - inversion-proof across Next versions AND closing the stale-chunk hazard: the webServer command cleans `.next`, builds, then runs `assert-dead-port.mjs`, which scans ONLY the CURRENT build's manifest-referenced chunks for the sentinel and refuses to start otherwise; `e2e/00-safety.spec.ts` re-asserts the served build from the runner as defence-in-depth. The former foreign-server-on-3103 edge is CLOSED (Codex round): `reuseExistingServer: false` means the lane NEVER attaches to an unknown process - an occupied port fails the run loudly, so the served build is always this worktree's fresh `.next`. Ergonomics note: every local run therefore does a full clean build (~30-45s) and you cannot attach to a pre-started 3103 - deliberate, safety over speed.
2. Every spec installs Playwright `context.route` mocks for `**/api/v1/**` and `**/api/merchant-auth/**` BEFORE navigation - interception happens pre-network, so the browser's BFF calls never reach the Next server's server-side `backendPost` either. All data-fetching `(app)` pages are client components (verified); the `(app)` layout and middleware make no outbound calls.
3. Unmatched `/api/v1/*` requests are fulfilled with a 404 JSON body AND recorded on a tracker; every authenticated journey asserts its surface hit only modelled routes.
Net effect: no request from the lane reaches Railway, Neon, provider Redis, shared staging or production; the worst case for a defeated Layer 1 with a stale local build is a developer's OWN localhost backend, and Layers 2+3 intercept before network regardless.

## 3. Determinism

- `retries: 0` (roadmap §8 retry rule: assertion/app failures are NEVER auto-retried).
- Full `next build && next start` production server (dev-server webpack flakiness excluded by design); `workers: 1` (single server, console-cleanliness assertions must not interleave).
- No wall-clock dependence except the Today's-redemptions journey, which computes the expected date from the same browser clock the app uses (documented residual: a sub-second local-midnight race, at most once per day, accepted).

## 4. Journey cross-check (source/regression -> spec)

| Journey | Regression class / source anchor | Spec |
|---|---|---|
| Unauthenticated redirect-before-paint | middleware cookie-presence gate (M1) | `shell-smoke` |
| Authenticated shell mount (real `(app)` layout chain: ToastProvider + MerchantPortalShell + Sidebar/Topbar) | **#324** blank-page ToastProvider crash - unit tests passed because each wrapped its own provider | `shell-smoke` |
| Toast-using route (branch detail cards) inside the real layout | #324 | `shell-smoke` |
| Sidebar navigation to Vouchers/Redemptions/Branches | shell wave active-route + routing | `shell-smoke` |
| Branch detail with Decimal-as-STRING latitude/longitude | **#327** - zod `z.coerce` against the real wire shape | `wire-contracts` |
| Redemptions log with Decimal-as-STRING estimatedSaving | #327 (same class, second site) | `wire-contracts` |
| Role fail-closed matrix (STAFF / unknown AUDITOR / absent capabilities -> baseline; OWNER full; BM minus Grow) + account-menu Business-profile gating | shell wave Codex correction 3 | `roles` |
| Same-page Quick Action `?create=1` open + cancel-strips-param + no reopen on reload | shell wave Codex correction 1 | `quick-actions` |
| Same-page Quick Action `range=today` -> From input shows today | shell wave Codex correction 2 (+ the M1 timezone fix) | `quick-actions` |
| Favicon + brand mark served WITHOUT a session; sidebar logo decodes through next/image | shell wave middleware asset exemption (fidelity finding: optimizer's cookie-less fetch) | `assets-responsive` |
| Wide collapse rail + narrow drawer/tab bar | shell wave responsive contract | `assets-responsive` |
| No uncaught page errors + no console errors on EVERY journey | the generic #324-class detector | all specs (`attachErrorGuards`) |

## 5. Wire-accuracy findings during bring-up (the lane already paying rent)

1. `Branch.pendingHours` is an ARRAY on the wire - a null fixture failed the real zod parse and surfaced as the branch-detail error state (exactly how a wrong backend emit would present).
2. The live lifecycle home reads `/onboarding/checklist` + `/onboarding/status` on mount; branch detail reads `/staff/app-users` - all three had to be modelled wire-accurately before the console-clean assertion passed. The unmatched-tracker made each visible immediately.

## 6. CI

New `merchant-web-smoke` job: **PILOT/ADVISORY** per roadmap CI tiers (T2 starts advisory; promotion to a required check is a separate owner-approved step). `continue-on-error` on the test step only; Playwright HTML report uploaded as an artifact (7-day retention). Chromium installed with `--with-deps` on the runner.

## 7. Out of scope

Staging acceptance (G1c); promotion of this lane to required (owner decision); non-chromium browsers; visual-diff snapshots; auth flows beyond the mocked-session boundary (real refresh/OTP journeys need G1c staging accounts); Vouchers module journeys beyond the same-page quick action (the Vouchers completion pass is the next slice and will extend this lane).
