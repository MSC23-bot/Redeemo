# Profile Tab Rebaseline (Phase 3C.1h) — Sub-PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal Profile shell on `main` (PR #27) with the full Profile customer-app surface ported from `feature/customer-app` reference branch. Two features stubbed (Support tickets / GetHelpModal + Merchant requests / RequestMerchantSheet) pending Sub-PR 2 (Tier 3, backend + Prisma).

**Architecture:** Customer-app-only port. No backend changes. No Prisma changes. No new wire contracts. New `apps/customer-app/src/features/profile/` directory mirrors the reference branch shape. Existing `app/(app)/profile.tsx` shell replaced with a thin re-export of `ProfileScreen` from the feature dir.

**Tech stack:** React Native / Expo SDK 54 / Expo Router / React Query / Zod / jest-expo. No new dependencies.

**Tier:** 2 — multi-file customer-app surface rebaseline. No spec doc; no audit. One owner device-QA round on completion.

**Reference branch:** `origin/feature/customer-app` (REFERENCE-ONLY per the locked branch policy). 29 files at `apps/customer-app/src/features/profile/`.

**Sub-PR 2 (Tier 3, follow-up workstream — NOT this PR):** Port `src/api/customer/support/` + `src/api/customer/merchant-requests/` backend + new Prisma models `SupportTicket` + `MerchantRequest` + migration + un-stub the two sheets on customer-app.

---

## File structure

### Subagent owns exclusively (creates / rewrites)

```
apps/customer-app/src/features/profile/                  (NEW dir)
├── screens/
│   └── ProfileScreen.tsx                                 (NEW)
├── components/
│   ├── ProfileHeader.tsx                                 (NEW)
│   ├── ProfileSectionCard.tsx                            (NEW)
│   ├── ProfileRow.tsx                                    (NEW)
│   ├── PersonalInfoSheet.tsx                             (NEW)
│   ├── AddressSheet.tsx                                  (NEW)
│   ├── InterestsSheet.tsx                                (NEW)
│   ├── ChangePasswordSheet.tsx                           (NEW)
│   ├── SubscriptionManagementSheet.tsx                   (NEW)
│   ├── NotificationsSection.tsx                         (NEW)
│   ├── AppSettingsSection.tsx                            (NEW)
│   ├── RedeemoSection.tsx                                (NEW)
│   ├── RequestMerchantSheet.tsx                          (NEW — STUBBED)
│   ├── GetHelpModal.tsx                                  (NEW — STUBBED)
│   ├── SupportLegalSection.tsx                           (NEW)
│   └── DeleteAccountFlow.tsx                             (NEW)
├── hooks/
│   ├── useCancelSubscription.ts                          (NEW)
│   ├── useCreateTicket.ts                                (NEW — STUB calls Sub-PR 2 backend; stub returns "coming-soon" error)
│   ├── useDeleteAccount.ts                               (NEW)
│   ├── useMerchantRequest.ts                             (NEW — STUB)
│   ├── useReduceMotion.ts                                (NEW)
│   └── useSupportTickets.ts                              (NEW — STUB returns empty list)
└── __tests__/                                            (NEW — match reference branch test location)
    └── (7 component test files mirroring reference branch)

apps/customer-app/src/lib/constants/supportTopics.ts     (NEW — feature constant under shared dir; subagent creates only)

apps/customer-app/app/(app)/profile.tsx                   (REWRITE — 134-line shell → 5-line re-export of ProfileScreen)

apps/customer-app/tests/app/profile.test.tsx              (UPDATE — existing 4 pins on the shell; verify against new screen + update assertions if needed)
```

### Subagent must NOT touch

- Other surface feature dirs: `apps/customer-app/src/features/{home,search,map,voucher,merchant,savings,saved-area,redemption,subscribe,auth,onboarding}/`.
- `apps/customer-app/src/design-system/**`.
- `apps/customer-app/src/lib/location/**`.
- `apps/customer-app/src/lib/api/profile.ts` — existing contract. Use as-is.
- `apps/customer-app/src/lib/api/shared/location.ts`.
- `apps/customer-app/src/hooks/{useMe,useSubscription,useUpdateAvatar}.ts` — already exist on main; import unchanged.
- `apps/customer-app/src/stores/auth.ts` — sign-out uses existing store.
- `apps/customer-app/app/(app)/_layout.tsx` — Profile tab already registered by PR #27.
- Any backend file (`src/api/**`).
- Any Prisma file.
- Any existing file in `apps/customer-app/src/lib/constants/` (subagent creates new `supportTopics.ts` only).

### Escalate to lead integrator (me) before implementing

- Need for a NEW hook in `apps/customer-app/src/hooks/` (i.e. shared, not Profile-feature-local).
- Need to modify `apps/customer-app/src/lib/api/profile.ts`.
- Need to modify `_layout.tsx` (tab bar).
- Reference-branch component imports a path that doesn't exist on main (apart from the 2 known stubs).
- Test failure that isn't immediately fixable inside `features/profile/`.
- `useSubscription` return shape mismatch between reference branch and main.

---

## Tasks

Each task = one commit. Subagent runs sequentially; TDD per task (write test → run red → implement → run green → commit).

- [ ] **Task 1: Port skeleton + small primitives**
  - Files: `ProfileSectionCard.tsx`, `ProfileRow.tsx`.
  - Tests: 1 component pin each (renders with default props).
  - Commit.

- [ ] **Task 2: Port `ProfileHeader`**
  - Avatar (initials) + name + completeness bar + subscription badge.
  - Test: renders with mocked `useMe` data; completeness bar reflects `profileCompleteness` value.
  - Commit.

- [ ] **Task 3: Port `PersonalInfoSheet`**
  - Read-only email/phone; editable name / DOB / gender.
  - Uses existing `profileApi.updateProfile`.
  - Test: opens with prefilled values; submit fires `updateProfile`.
  - Commit.

- [ ] **Task 4: Port `AddressSheet`**
  - Postcode + line1 + line2 + city. Uses existing `useLocationAssist` (already on main).
  - Test: renders prefilled; submit fires `updateProfile`.
  - Commit.

- [ ] **Task 5: Port `InterestsSheet`**
  - Uses existing `profileApi.getAvailableInterests` + `updateInterests`.
  - Test: renders interest options; submit fires `updateInterests`.
  - Commit.

- [ ] **Task 6: Port `ChangePasswordSheet`**
  - Backend `/auth/change-password` exists on main.
  - Test: submit fires the API call with current + new password.
  - Commit.

- [ ] **Task 7: Port `SubscriptionManagementSheet` + `useCancelSubscription`**
  - Verify `useSubscription` return shape matches reference branch. Escalate if mismatch.
  - Cancel flow uses existing `subscriptionApi.cancel`.
  - Test: cancel CTA fires the mutation.
  - Commit.

- [ ] **Task 8: Port `NotificationsSection`**
  - Live email toggle via `updateProfile.newsletterConsent`. Push stub (no backend).
  - Test: email toggle persists via API.
  - Commit.

- [ ] **Task 9: Port `AppSettingsSection`**
  - Haptics toggle (via `prefsStorage`); reduce-motion (via `useReduceMotion` — NEW hook in `features/profile/hooks/`); location-access link → `/saved-area` (existing route).
  - Test: toggles persist; location row taps router.push('/saved-area').
  - Commit.

- [ ] **Task 10: Port `RedeemoSection` + STUB `RequestMerchantSheet` + `useMerchantRequest`**
  - RedeemoSection: become merchant (→ stub), request merchant (→ stub), rate app (existing `Linking` to store), share (existing `Share.share`).
  - Both "merchant" CTAs open `RequestMerchantSheet` which displays a `Alert.alert("Coming soon", "Merchant requests ship in Sub-PR 2 (backend follow-up).")`.
  - `useMerchantRequest` hook: stub — returns no-op mutation. Pin the stub: test asserts the Alert is invoked.
  - Commit.

- [ ] **Task 11: Port `SupportLegalSection` + STUB `GetHelpModal` + `useSupportTickets` + `useCreateTicket`**
  - SupportLegalSection: Get Help (→ stub), Terms (existing `Linking`), Privacy (existing `Linking`).
  - `GetHelpModal` open displays an `Alert.alert("Coming soon", "Support tickets ship in Sub-PR 2 (backend follow-up).")` and dismisses.
  - `useSupportTickets` stub returns `{ data: [], isLoading: false }`.
  - `useCreateTicket` stub returns no-op mutation.
  - Pin both stubs: tests assert the Alert is invoked + stubs return empty.
  - Create `apps/customer-app/src/lib/constants/supportTopics.ts` with the topic list (copied from reference branch).
  - Commit.

- [ ] **Task 12: Port `DeleteAccountFlow`**
  - 2-stage OTP-gated. Backend `/auth/delete-account` exists on main.
  - Stage 1: confirm intent → request OTP. Stage 2: enter OTP → backend confirms → sign out.
  - Test: stage 1 → stage 2 transition; OTP submit fires API.
  - Commit.

- [ ] **Task 13: Wire top-level `ProfileScreen`**
  - Port full screen orchestrator from reference branch.
  - Verify it composes ALL the sections + sheets ported above.
  - Test: full screen renders with mocked `useMe` + `useSubscription`; each section mounts; each sheet opens/closes.
  - Commit.

- [ ] **Task 14: Replace `app/(app)/profile.tsx` shell**
  - Replace the 134-line shell with:
    ```typescript
    export { ProfileScreen as default } from '@/features/profile/screens/ProfileScreen'
    ```
  - Update `tests/app/profile.test.tsx` — existing 4 pins on the shell. Either delete (now covered by feature tests) or migrate to assert ProfileScreen renders + sign-out + Your Location link.
  - Commit.

- [ ] **Task 15: Tests + tsc gate**
  - Run focused suite: `npx jest tests/features/profile tests/app/profile`.
  - Run customer-app full impacted-surface sweep: `npx jest tests/features/profile tests/app tests/lib/api tests/hooks`.
  - Run customer-app `tsc --noEmit`.
  - Fix any regression. Commit if changes needed.

---

## Stub contract (for Sub-PR 2 to un-stub cleanly)

The two stubbed flows must be pinned so Sub-PR 2 can flip them with minimal test churn.

**`GetHelpModal`** stub:
- Component renders a 2-line modal: title "Get Help" + body "Coming soon. Email us at hello@redeemo.co.uk for now." OR fires `Alert.alert("Coming soon", …)` on first open. Implementer's choice — pick whichever feels more polished. Pin the assertion.
- `useSupportTickets()` returns `{ data: [], isLoading: false, isError: false, refetch: () => {} }`.
- `useCreateTicket()` returns `{ mutate: () => Alert.alert(…), isPending: false }`.

**`RequestMerchantSheet`** stub:
- Same pattern: Alert OR modal with "Coming soon" copy.
- `useMerchantRequest()` returns `{ mutate: () => Alert.alert(…), isPending: false }`.

Sub-PR 2 will:
1. Add Prisma models + migration.
2. Add backend services + routes.
3. Replace each stub hook with a real implementation pointing at the new backend.
4. Replace each stub modal with the real form/list UI from the reference branch.
5. Update the stub pins to assert the real behaviour.

---

## Test plan

### Per-component pins (target ~7 new test files, mirroring reference branch's `__tests__/`)

| File | Pins |
|---|---|
| `ProfileHeader.test.tsx` | renders name/email/completeness; subscription badge present |
| `PersonalInfoSheet.test.tsx` | renders prefilled; submit fires updateProfile |
| `NotificationsSection.test.tsx` | toggle persists; push stub doesn't crash |
| `AppSettingsSection.test.tsx` | haptics persists; reduce-motion persists; location link routes |
| `SubscriptionManagementSheet.test.tsx` | cancel CTA fires mutation |
| `GetHelpModal.test.tsx` | STUB — open invokes Alert("Coming soon"); pin the copy |
| `DeleteAccountFlow.test.tsx` | stage 1 → 2 transition; OTP submit fires API |

### Screen integration test

- `ProfileScreen.test.tsx`: render full screen with mocked `useMe` + `useSubscription`; assert ALL sections mount; sign-out tap invokes `signOut`.

### Stub pins (specific assertions)

- `GetHelpModal` stub: test asserts `Alert.alert` invoked with `"Coming soon"` + Sub-PR 2 reference copy.
- `RequestMerchantSheet` stub: same pattern.

### Gate at completion

- Focused: `npx jest tests/features/profile tests/app/profile --forceExit` → all green.
- Full impacted-surface sweep: `npx jest tests/features/profile tests/app tests/lib/api tests/hooks --forceExit` → all green; no regression in adjacent test files.
- `npx tsc --noEmit` (from `apps/customer-app/`) → exit 0 clean.

---

## Operating-model notes

- **Tier:** 2. Tier 1 was insufficient (15 tasks, 29 new files, full screen rewrite). Tier 3 was overkill (no backend changes, no new contracts, no migrations).
- **Plan-doc length:** ~250 lines. Inside the 150-300 cap.
- **Owner device-QA cadence:** one round per the operating model. P0 blocks; P1 fix-in-PR if quick; P2 polish batch; P3 logged.
- **Subagent dispatch:** via `superpowers:subagent-driven-development` skill. Worker uses TDD per task. Returns when all tests + tsc green. Escalates on the listed boundary touches.
- **Lead integrator (me) role:** review subagent's worktree on completion, dispatch independent code-review subagent for an external read, open PR, run owner device-QA, SHA-bound merge, closure flip.

---

## Cross-references

- `CLAUDE.md` Phase 3C.1h section (states full surface awaits this rebaseline).
- `~/.claude/projects/.../memory/project_profile_shell_followup_pr.md` — "Pickup signal for the supersede".
- Reference branch at `origin/feature/customer-app`, `apps/customer-app/src/features/profile/`.

**End of plan.** Subagent dispatch follows.
