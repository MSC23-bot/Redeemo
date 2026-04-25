# Reconciliation — Phases 1 to 4

**Status:** Complete (2026-04-24)
**Scope:** Device-review / reconciliation against Phase 3C (customer app) and Phase 3D (customer web) specs.
**Ground truth:** approved specs in `docs/superpowers/specs/` + existing plans in `docs/superpowers/plans/` + the "Customer app post-completion fixes (2026-04-23)" section of `CLAUDE.md`.
**Operating rule:** no ad-hoc fixes. Every change below was classified (spec mismatch / impl bug / spec gap / intentional asymmetry), confirmed with the owner, then implemented in controlled batches.

> **🔒 Superseded as the forward-facing reference (2026-04-25):** the locked v1.0 baseline of the customer onboarding + auth + subscription flow now lives in [`docs/customer-flow-current.md`](../../customer-flow-current.md), with dated changes in [`docs/customer-flow-changelog.md`](../../customer-flow-changelog.md). This document remains the **historical record** of how Phases 1–4 reconciled the build against the original specs. Use the current spec for "what is true today" and this plan for "why we changed it back then".

This document exists so any future regression or design question can be traced back to the intent, the decision, and the exact files that changed.

---

## Locked intentional asymmetry (do not change without new design review)

These are *deliberate* web ↔ app differences. They were reviewed against the gap list on 2026-04-24 and kept:

| Concern | Web | App | Reason |
|---|---|---|---|
| DOB / gender / postcode | Optional | Mandatory (PC1 + PC2) | Web = low-friction acquisition; app = strict onboarding for location-based matching and voucher personalisation |
| Phone number | Required at register | Required + verified via OTP | Web captures the number; app verifies it (only in-app OTP flow today) |
| Email verification | Soft banner after login | Hard block | Web browsing works without verify; redemption (app-only) requires verified email |
| Redemption | Not supported | Required | Fraud prevention — mobile presence required at merchant branch |
| `onboardingCompletedAt` / `subscriptionPromptSeenAt` | Not stamped | Stamped by app flow | One-shot screens belong to the app; web users hit banners/nudges instead |

Any future work that tries to "make web and app consistent" must revisit this table first.

---

## Phase 1 — App critical wiring

**Problem.** Routing relied on local Zustand onboarding state, which drifted from `/profile`. A user whose server profile already had all required fields could still land on PC1/PC2.

**Fix.** Server profile became the source of truth for all routing decisions.

| File | Change | Rationale |
|---|---|---|
| `apps/customer-app/src/stores/auth.ts` | `MinimalUser` includes `dateOfBirth`, `gender`, `postcode`, `onboardingCompletedAt`, `subscriptionPromptSeenAt`. `setTokens()` always fetches `/profile`; `refreshUser()` refreshes it. | Routing predicates need server-authoritative fields, not local guesses. |
| `apps/customer-app/src/lib/routing.ts` | `resolveRedirect` evaluates email → phone → `firstIncompleteRequiredStep(user)` → `onboardingCompletedAt` → `subscriptionPromptSeenAt` → home. No local-state reads. | Deterministic chain; every step has a server field as gate. |
| `apps/customer-app/app/(auth)/_layout.tsx` | Re-evaluates `resolveRedirect` on every render and issues `<Redirect>` when target differs. | Guarantees direct-nav and mid-flow mutations are always corrected. |
| `apps/customer-app/src/features/subscribe/screens/SubscribePromptScreen.tsx` | Both CTAs call `profileApi.markSubscriptionPromptSeen()` then navigate. | One-shot stamp is server-driven; the prompt never re-shows. |

**Verification.** 350/350 app tests pass. Device flow: fresh register walks the full chain; pre-filled register skips straight to onboarding-success.

---

## Phase 2 — Web persistence + auth correctness

**Problem.** Register POSTed a monolithic payload; profile fields beyond basics were dropped. Login was over-defensive — it surfaced `EMAIL_NOT_VERIFIED` / `PHONE_NOT_VERIFIED` as blockers, contradicting soft-verify on web. `/verify` flow was missing.

**Fix.** Split register into auth + profile + interests calls. Removed verify blocks from login. Added `/verify` token flow.

| File | Change | Rationale |
|---|---|---|
| `apps/customer-web/lib/api.ts` | `profileApi.update()` accepts richer `ProfileUpdatePayload`. `authApi.verifyEmail()` + `resendVerification()` exposed. `subscriptionApi.getMySubscription()` handles 404 → `null`. | Web now uses the same PATCH endpoints as the app. |
| `apps/customer-web/contexts/AuthContext.tsx` | `hydrateFromProfile()` calls `/profile` and stores `{ id, name, email, profileImageUrl, phone, emailVerified, phoneVerified }`. Called on login + bootstrap. | Banner logic needs server-truth verification flags. |
| `apps/customer-web/components/auth/RegisterForm.tsx` | Post-register: PATCH `/profile` + PUT `/interests` (label→id lookup). Failures were non-fatal but silent. | Keeps the acquisition funnel short but persists the extra data. |
| `apps/customer-web/components/auth/LoginForm.tsx` | Removed EMAIL_NOT_VERIFIED / PHONE_NOT_VERIFIED branches. Only blocks on `ACCOUNT_INACTIVE` / `ACCOUNT_SUSPENDED`. | Web is soft-verify; banners handle the unverified case post-login. |
| `apps/customer-web/app/verify/page.tsx` | Token-based verification with `useRef` double-fire guard (Strict Mode). | Email verification link must work from any device/browser. |
| `apps/customer-web/app/reset-password/page.tsx` | Aligned with the same token flow. | Consistency with verify. |

**Verification.** Web typecheck clean. Register → verify email link → login paths all tested.

**Known bridge (temporary).** Interests label → id mapping is label-based. Owner flagged it as acceptable now but susceptible to drift. Replace with an id-based select if the interest taxonomy grows.

---

## Phase 3 — Web verification banners

**Problem.** Post-login unverified users had no visible nudge. A user could register, not verify, and never know they were missing redemption eligibility (for when they install the app).

**Fix.** Two soft banners mounted in the root layout.

| File | Change | Rationale |
|---|---|---|
| `apps/customer-web/components/layout/VerificationBanners.tsx` (new) | Amber email banner with "Resend email" action + blue phone banner ("verify in app"). Dismissal keys in `sessionStorage`. Hidden on auth/verify/onboarding routes. Waits for `user.emailVerified` / `phoneVerified` to be defined before rendering (avoids flash). | Soft-verify contract requires visibility, not blocking. Session dismissal matches how the app treats one-shot nudges. |
| `apps/customer-web/app/layout.tsx` | `<VerificationBanners />` mounted below `<Navbar />`, inside `<AuthProvider>`. | Single mount point; pathname-scoped filtering lives in the component. |

**Verification.** Tested with `set-auth-state.ts` for email-unverified / phone-unverified / verified modes.

---

## Phase 4 — Final gap fixes (2026-04-24)

After Phases 1–3 the owner audited against product direction. Four gaps were classified as must-fix; remaining items were confirmed intentional (see top of doc).

### 4.1 Step auto-skipping (impl bug, P1)

**Problem.** `useProfileCompletion.markStepComplete` used a hard-coded `ROUTE_AFTER_STEP` dictionary: pc1 → address unconditionally. So a user whose server profile already had postcode still had to tap through PC2 and press Continue.

**Fix.** Compute next destination from fresh server state after `refreshUser()`.

| File | Change |
|---|---|
| `apps/customer-app/src/lib/routing.ts` | `firstIncompleteRequiredStep()` now exported. Returns `'about'` if PC1 fields missing, `'address'` if postcode missing, `null` if both complete. |
| `apps/customer-app/src/features/profile-completion/hooks/useProfileCompletion.ts` | `markStepComplete()` calls `refreshUser()`, then `nextRouteAfter(step)` computes the destination using `firstIncompleteRequiredStep` against the refreshed `user`. When the result is onboarding-success, completion is also stamped. Hard-coded `ROUTE_AFTER_STEP` removed. |

**Verification.** `tests/features/profile-completion/useProfileCompletion.test.ts` updated and passing. Tested manually: web register with DOB + gender + postcode → app login → lands directly on onboarding-success, bypassing PC1 and PC2.

### 4.2 Gender normalisation (critical)

**Problem.** Web emitted `"Male"` / `"Female"` / `"Non-binary"`. App enum is `'female' | 'male' | 'non_binary' | 'prefer_not_to_say'`. Web users got blank PC1 gender on the app even though they'd answered it. "Prefer not to say" was encoded as the empty string, indistinguishable from not-chosen.

**Fix.** Canonicalise values. Use the same slugs across web, app, and backend.

| File | Change |
|---|---|
| `apps/customer-web/components/auth/RegisterForm.tsx` | Gender `<select>` now emits `female`, `male`, `non_binary`, `prefer_not_to_say`. A disabled placeholder `<option value="">Select (optional)</option>` represents "not answered". Blank values are not sent. |

**App side.** PC1 (`PC1AboutScreen.tsx`) already used the canonical enum; no app changes needed. `normaliseGender()` recognises the new web values.

**Backend side.** `User.gender` is a free-form string column. No migration required. Values are still accepted opaquely.

### 4.3 Web profile persistence safety (impl bug, P2)

**Problem.** Post-register PATCH `/profile` / PUT `/interests` failures were swallowed silently. User saw success; data was lost.

**Fix.** Retry once per call. If both tries fail, show a non-blocking banner on the success screen. Registration itself is never blocked.

| File | Change |
|---|---|
| `apps/customer-web/components/auth/RegisterForm.tsx` | `retryOnce()` helper wraps each persistence call. `partialSave` state surfaces an amber notice: *"Some details couldn't be saved. You can complete them later from your profile."* |

**Why retry-once (not exponential backoff):** the user is on the success screen waiting to move on. A second attempt catches transient failures; anything persistent gets logged (user-visible) and deferred to their next profile edit.

### 4.4 Web subscription nudge (acquisition, P2)

**Problem.** Web had no equivalent of the app's subscription prompt. Free web users never saw the pitch unless they hunted for `/subscribe`.

**Fix.** Soft, dismissible banner in the root layout, shown only for authed users whose subscription is not ACTIVE/TRIALLING.

| File | Change |
|---|---|
| `apps/customer-web/components/layout/SubscriptionNudge.tsx` (new) | Calls `subscriptionApi.getMySubscription()` on user-id change. Renders amber banner with "See plans" CTA linking to `/subscribe`. Dismissible via `sessionStorage` key `redeemo_subscribe_nudge_dismissed`. Fail-closed on API error (no nag). Hidden on auth/onboarding/verify/delete/subscribe routes. |
| `apps/customer-web/app/layout.tsx` | `<SubscriptionNudge />` mounted directly below `<VerificationBanners />`. |

**Why soft, not a modal:** web is the acquisition surface. A blocking modal would hurt conversion on the content pages the user actually wants to browse.

---

## What you can verify on device / web after Phase 4

### App (device)
- Fresh register → verify-email → verify-phone → PC1 → PC2 → onboarding-success → subscription-prompt → home
- Web register (with DOB + gender + postcode) → app login → skips PC1 and PC2 entirely
- Web register (blank optional fields) → app login → stops at PC1, then PC2
- Web register with gender "Female" (now `female`) → app PC1 prefills correctly
- Subscribe prompt "Maybe later" persists — does not re-show
- Free user tap Redeem → subscribe gate

### Web
- Register → success screen, verify link works, `/verify` confirms
- Network blip on profile PATCH → amber "Some details couldn't be saved…" banner
- Login as unverified-email user → amber banner + "Resend email"
- Login as unverified-phone user → blue banner
- Login as free user → amber subscription nudge → "See plans" → `/subscribe`
- Subscribed user → no subscription nudge
- Dismissed nudge stays dismissed for session; reappears next session
- Gender dropdown shows "Select (optional)" + 4 real options; blank not sent
- Auth routes show none of the banners

---

## Test baselines (post-Phase 4)

- Backend (vitest): **282 / 282**
- Customer-app (jest-expo): **350 / 350**
- Customer-web typecheck: clean
- Customer-app typecheck: pre-existing 41 errors on worktree branch; none in files changed by Phases 1–4

---

## Related documents

- Specs: `docs/superpowers/specs/2026-04-10-customer-ux-foundations-design.md` — the overarching UX spec that defines web vs mobile asymmetry.
- Baseline fixes (finalised 2026-04-23): "Customer app post-completion fixes" section of `CLAUDE.md`.
- Foundations plan: `docs/superpowers/plans/2026-04-15-customer-app-foundations-auth.md` — original profile-completion wizard design.
- Website plan: `docs/superpowers/plans/2026-04-12-customer-website.md` — original web scope.

---

## If you need to revert a specific change

Every change above is scoped to one or two files. To revert a single phase item without undoing the rest, use `git log -p --follow <file>` on the file listed in the table. Nothing in Phases 1–4 introduced cross-cutting refactors.
