# Merchant Portal M4 - Notification Bell Foundation - Design Spec

**Status:** Draft (for owner review before the implementation plan)
**Tier:** 2 (multi-file backend + frontend), plan-first, owner-gated per slice and per PR
**Date:** 2026-06-21
**Milestone goal:** Give a merchant a working notification bell built as a future-proof generic inbox: a no-schema read surface over the existing `Notification` rows, a topbar bell with an unread badge + popover, a "see all" `/notifications` view, and a deep-link destination resolver that routes a clicked notification to the item needing action (with a safe fallback when that section is not built yet). Makes the 6 MERCHANT_ADMIN notification types that already fire (but are invisible today) visible, and gives every future merchant workflow a single inbox to plug into.

**Predecessor:** M0 scaffold, M1 auth, M2 onboarding, M3 Redemptions + Validate-a-code are complete on main (`9c24bf81`). M4 was chosen via the 2026-06-21 post-M3 audit + grill-me (OD-A, OD-B).

---

## 0. Locked decisions (grill-me, 2026-06-21)

| # | Decision | Outcome |
|---|---|---|
| OD-A | Next milestone | **Notification-bell foundation.** Built as a future-proof generic inbox, NOT an onboarding-only list. Full Insights stays Tier-3 (schema + DPIA), deferred. |
| OD-B | M4 scope | **Bell foundation ALONE = M4.** Home v1 = M5. Future notification producers and merchant notification emails are deferred to their own slices (recorded, not dropped). |
| Owner shape | M4 read foundation | list · unread-count · mark-one-read · mark-all-read; topbar bell badge + popover; a "see all" `/notifications` view; a deep-link resolver based on `type`/`referenceType`/`referenceId` with a safe fallback when the destination is not built. Existing rows work now. |
| No schema | confirmed | Uses the existing `Notification` fields + indexes + the `MERCHANT_ADMIN` recipient type. No migration. |

---

## 1. Verified current state (main `9c24bf81`)

### 1.1 The data model already supports a generic inbox (no schema needed)
`Notification` (`prisma/schema.prisma`) carries every inbox primitive:
- `recipientType` (`NotificationRecipientType`, includes `MERCHANT_ADMIN`) + `recipientId` (the canonical recipient pointer; for a merchant row this is the `MerchantAdmin` id).
- `type` (`NotificationType` enum), `title`, `body`.
- `referenceType` (string, nullable) + `referenceId` (string, nullable) - the deep-link primitives.
- `isRead`, `readAt`, `sentAt`.
- Bell-feed indexes already exist: `@@index([recipientType, recipientId, isRead])` (unread count + unread list) and `@@index([recipientType, recipientId, sentAt])` (ordered feed).

### 1.2 The write path already populates references for the existing merchant rows
`notify()` (`src/api/shared/notify.ts`) accepts an `inApp` block with `notificationType`, `title`, `body`, `referenceId`, `referenceType` and writes a `Notification` row (channel `IN_APP`). The 6 MERCHANT_ADMIN producers that fire today ALL set the reference fields, verified:
- `src/api/merchant/onboarding/service.ts` (submit-on-behalf): `type MERCHANT_VERIFICATION_UPDATE`, `referenceType:'merchant'`, `referenceId:merchantId`.
- `src/api/admin/approvals/service.ts` (changes-requested L320, rejected L398, approved verification-update): `MERCHANT_VERIFICATION_UPDATE`, `referenceType:'merchant'`, `referenceId:merchantId`.
- `src/api/admin/approvals/editApplier.ts` (edit applied L209/L321): MERCHANT_ADMIN in-app rows.
So **every existing merchant notification row is already deep-linkable** (`referenceType:'merchant'` + `referenceId`).

### 1.3 The read side is admin-only; merchant has none
`src/api/admin/notifications/{routes,service}.ts` exposes exactly 4 endpoints, scoped `recipientType ADMIN + recipientId = req.user.sub`, with NO capability gate:
- `GET /api/v1/admin/notifications` (page/pageSize/unreadOnly, `orderBy sentAt desc`, returns `{ notifications, page, pageSize, total }`).
- `GET .../unread-count` (`{ count }`).
- `POST .../:id/read` (scoped `updateMany` with `isRead:false` guard, stamps `readAt`, returns `{ updated }`).
- `POST .../read-all` (`{ updated }`).
There is **no `src/api/merchant/notifications`**; the merchant plugin registers only profile/onboarding/branch/voucher/upload/redemptions.

### 1.4 The frontend bell is inert
`apps/merchant-web/components/shell/Topbar.tsx` renders the Notifications bell (and Quick-actions) as plain buttons with `aria-label` only - no `onClick`, popover, poll, or badge. No notification API client exists in `apps/merchant-web/lib/api/**`. The sidebar has no Notifications item (the bell is the topbar entry point); the prototype's "See all notifications" maps to a new `/notifications` route.

### 1.5 Email is dark
`sendEmail()` is gated by `EMAIL_ENABLED` (default off). The EMAIL-channel `CommunicationLog` rows for the current merchant types already queue darkly (the producers pass an `email:` block alongside `inApp`), but nothing sends. Merchant notification emails + preferences are out of M4 (section 9).

---

## 2. Scope

### 2.1 In scope (M4)
1. **Backend:** a merchant notification read module mirroring the admin's 4 endpoints, scoped `recipientType MERCHANT_ADMIN + recipientId = req.user.sub`. No schema.
2. **Frontend:** a `lib/api/notifications.ts` client; the topbar bell wired with an unread badge + a popover (recent items + mark-all-read + "see all"); a `/notifications` "see all" view (paginated, unread filter, mark-all-read); a **deep-link destination resolver** that maps `(referenceType, referenceId, type)` to a route with a safe fallback; clicking a notification marks it read and navigates.
3. **Extensibility seams (built, but only the current entries populated):** a notification `type` -> icon/label map and a `referenceType` -> destination map, both written so a future module adds one entry without touching the bell.

### 2.2 Out of scope (deferred, recorded)
- **New notification producers** (custom-voucher / branch-approval / branch-change / reviews / staff-access / documents / other approval flows) - each ships in its OWN module slice (adds a `NotificationType` enum value + a `referenceType` + a resolver-map entry). M4 builds NO new producers.
- **Merchant notification emails + preferences** - a follow-up notification-email slice, blocked on email go-live (EMAIL rows already queue darkly for current types).
- **Home v1** - M5.
- Quick-actions topbar button (stays inert), and the Tier-3 items (Insights, Reverse, Staff, day-2 surfaces).

---

## 3. Cross-check table

| Anchor | Prototype / blueprint intent | Live reality (verified) | M4 decision |
|---|---|---|---|
| Bell read endpoints | unread badge + feed; mirrors admin bell | admin has 4 endpoints; merchant has none; 6 MERCHANT_ADMIN rows fire | mirror the admin's 4, scoped `MERCHANT_ADMIN + recipientId=req.user.sub`; no schema |
| Generic inbox shape | type/title/body/timestamp/read/deep-link | model has `type`/`referenceType`/`referenceId`/`title`/`body`/`isRead`/`readAt`/`sentAt` | use existing fields; curated select |
| Deep-links | click routes to the item needing action | existing rows set `referenceType:'merchant'`+`referenceId` | resolver `(referenceType,referenceId,type)->route` + safe fallback; no schema |
| Topbar bell | unread badge + popover | inert button | wire onClick + badge + popover; mirror admin poll/9+ cap |
| "See all" view | full notifications list | none | new `/notifications` route |
| Read-state | mark-one / mark-all | admin pattern (scoped `updateMany`) | mirror exactly; `isRead:false` guard, stamp `readAt` |
| Recipient scoping | per-person bell | admin scopes by `recipientId=req.user.sub` | per-person `MERCHANT_ADMIN + recipientId`; NO merchant-org suspend gate (a suspended/rejected merchant must still see their notices) |
| Future producers | voucher/branch/review/staff/docs types | only `MERCHANT_VERIFICATION_UPDATE` + `VOUCHER_APPROVAL_UPDATE` exist | deferred to each module's slice; the type/icon + resolver maps have a generic fallback so unknown types render safely |
| Email-on-notification | important events also email | email dark; EMAIL rows queue darkly | deferred to a notification-email/preferences slice |
| Home v1 | live merchant landing | "coming soon" card | M5 |

---

## 4. Backend design (additive, no schema)

New module `src/api/merchant/notifications/{routes,service}.ts`, registered in `src/api/merchant/plugin.ts` (inside the `authenticateMerchant` scope). The 4 functions mirror the admin service exactly, swapping `ADMIN` for `MERCHANT_ADMIN`.

### 4.1 Scoping (the isolation boundary)
Every query/mutation is bound to `recipientType: 'MERCHANT_ADMIN'` + `recipientId: req.user.sub` (the authenticated `MerchantAdmin` id). A merchant-admin can never read or mutate another person's rows. **`resolveAdminMerchant` is deliberately NOT used here** (notifications are per-person, not per-merchant-org), so:
- there is no `MERCHANT_SUSPENDED` gate - a suspended or rejected merchant must still be able to read the notification that tells them they were suspended/rejected;
- isolation is purely `recipientId = req.user.sub`.
This matches the admin bell (which uses `req.user.sub` directly with no extra gate).

### 4.2 Endpoints (mirror admin)
- `GET /api/v1/merchant/notifications` - query `{ page?, pageSize? (max 50), unreadOnly? }` (parse `unreadOnly` as `z.enum(['true','false']).transform(v => v === 'true')`, NOT `z.coerce.boolean`); `orderBy sentAt desc`; curated `select { id, type, title, body, referenceId, referenceType, isRead, readAt, sentAt }`; returns `{ notifications, page, pageSize, total }`.
- `GET /api/v1/merchant/notifications/unread-count` - `{ count }`.
- `POST /api/v1/merchant/notifications/:id/read` - scoped `updateMany({ where: { id, recipientType:'MERCHANT_ADMIN', recipientId, isRead:false }, data:{ isRead:true, readAt:new Date() } })`; returns `{ updated }` (a not-mine / not-found / already-read id is a no-op `updated:0`, never a cross-person mutation).
- `POST /api/v1/merchant/notifications/read-all` - scoped `updateMany` over unread; `{ updated }`.

### 4.3 Service
Four pure functions `listMerchantNotifications` / `getMerchantUnreadCount` / `markMerchantNotificationRead` / `markAllMerchantNotificationsRead`, byte-for-byte the admin service shape with `MERCHANT_ADMIN`. No new dependency.

### 4.4 Invariants (test-pinned)
- **Per-person isolation:** a second merchant-admin cannot list, count, or mark another's notifications (cross-person denial test on every endpoint).
- **No suspend gate:** a suspended/rejected merchant still reads their own notifications (test).
- **No PII concern:** notification `title`/`body` are merchant-owned notices authored by the producers (not customer data); the curated select carries no foreign PII. (The producers are responsible for safe copy; M4 only reads what exists.)
- **Read-state guard:** `isRead:false` in the mark-read `where` so `readAt` is stamped only on the unread->read transition.

---

## 5. Frontend design (`apps/merchant-web`)

### 5.1 API client
New `lib/api/notifications.ts` (mirrors the `lib/api/redemptions.ts` pattern): zod `notificationSchema` (`{ id, type, title, body, referenceId, referenceType, isRead, readAt, sentAt }`, `.passthrough()`); `listNotifications({page,pageSize,unreadOnly})`, `getUnreadCount()`, `markNotificationRead(id)`, `markAllNotificationsRead()` via `apiFetch(..., { auth: true })`.

### 5.2 Topbar bell (wire the inert button)
- `useQuery(['notifications','unread-count'], getUnreadCount, { refetchInterval: 45_000, refetchOnWindowFocus: true })` - mirrors the admin bell's 45s poll. Badge shows the count, capped at "9+".
- Clicking the bell opens a **popover** (anchored dropdown panel built with merchant-web primitives; the `Dialog` primitive or a lightweight custom popover - the implementer picks per conventions) showing the most-recent N (e.g. 8) notifications (a `listNotifications({pageSize:8})` query), each row: type icon, title, body (truncated), relative timestamp, unread dot. Footer: "Mark all as read" + "See all" -> `/notifications`.
- Selecting a row: `markNotificationRead(id)` (optimistic), invalidate `['notifications']`, then navigate to the resolved destination (section 6).

### 5.3 "See all" view
New `app/(app)/notifications/page.tsx` (client component, shell-wrapped): a paginated full list (`listNotifications`), an unread-only toggle, a "Mark all as read" action, loading/empty/error states. Each row clickable (mark-read + deep-link). The sidebar is unchanged (the bell is the entry point); `/notifications` is reachable from the bell popover "See all".

### 5.4 Deep-link resolver (the future-proof core) - see section 6.

### 5.5 Design-system + style
Reuse `components/ui/{badge,button,card}` + brand tokens; icons via `@/lib/icons`. House style: no em dashes; no emojis. Relative-time formatting via a small helper (or an existing one if present).

---

## 6. Deep-link destination resolver (extensible)

A pure function in `lib/notifications/resolveDestination.ts`:

```
resolveNotificationDestination(referenceType, referenceId, type) -> { href: string, built: boolean }
```

- A `REFERENCE_DESTINATIONS` map from `referenceType` to a builder, e.g. `merchant -> () => '/'`. **Current entries (only what exists today):** `'merchant' -> '/'` (the home/lifecycle hub, where application status + changes-requested actions live). That single entry covers all 6 current rows (`referenceType:'merchant'`).
- **Fallback (safe, never a dead end):** when `referenceType` is null/unknown OR the destination route is not built yet, return the **nearest existing parent** (today `'/'`) with `built:false`. The clicked notification still shows its full `title`/`body`/`timestamp` (in the popover/see-all), so the user always sees the message even if the destination page does not exist.
- **Extensibility:** a future module (custom vouchers, branches, reviews, staff, documents) adds ONE entry (e.g. `'voucher' -> id => /vouchers/${id}`) when that section ships - no change to the bell. Until then those referenceTypes hit the safe fallback. `type` is available to the resolver for finer routing if a referenceType needs it later, but is not required for the current entry.

A parallel `NOTIFICATION_TYPE_META` map (`type -> { icon, label }`) gives each `NotificationType` an icon + label, with a generic fallback for unknown/future types so the bell renders any type safely.

---

## 7. Privacy + security invariants (consolidated, test-pinned)

1. **Per-person isolation:** `recipientType MERCHANT_ADMIN + recipientId = req.user.sub` on every read and mutation; cross-person denial test per endpoint.
2. **No suspend gate** on notifications (deliberate divergence from the other merchant routes) so a suspended/rejected merchant can read their own status notices; pinned by a test.
3. **Read-state mutations are scoped `updateMany`** with the `isRead:false` guard (no cross-person write, no double-stamp).
4. **Curated select** (no blind spread); no foreign PII in the payload.

---

## 8. Notification copy + producers (boundary)

M4 does NOT author notifications; it reads what the existing producers write. The current rows' titles/bodies are already merchant-safe. When future modules add producers, THEY own the copy + the `referenceType`/`referenceId` + the resolver-map entry, in their own slice. M4's job is the read foundation + the extensibility seams.

---

## 9. Deferred / recorded (not dropped)

| Item | Why deferred | When |
|---|---|---|
| New notification producers (voucher/branch/review/staff/docs) | each belongs to its own module | added per-module (enum value + referenceType + resolver entry) |
| Merchant notification emails + preferences | email dark (provider go-live gated); needs templates + delivery rules + a preferences model (likely schema) | follow-up notification-email slice |
| Home v1 | OD-B | M5 |
| `NotificationType` enum additions for future types | schema (additive enum value) | in the producing module's slice (STOP-AND-REPORT per the schema rule) |

Note: the EMAIL-channel `CommunicationLog` rows for the current merchant types already queue darkly; when email goes live they would send without code change for those types, but the broader merchant-email policy (which events email, preferences, recipients) is the deferred slice.

---

## 10. Testing strategy

- **Backend (vitest):** list (pagination, `unreadOnly` token parsing, `orderBy sentAt desc`, curated select); unread-count; mark-one (scoped, no-op for not-mine/not-found/already-read, stamps `readAt`); mark-all; **cross-person denial per endpoint** (a second MERCHANT_ADMIN cannot see/mutate); **suspended-merchant can still read** their notifications; the existing MERCHANT_ADMIN rows surface through the merchant endpoint.
- **Frontend (jest + RTL):** bell badge (count + 9+ cap), popover renders recent items + unread dots, mark-all-read, "see all" navigation; the `/notifications` page (list, unread filter, pagination, empty/error); clicking a row marks read + navigates; the resolver routes `referenceType:'merchant'` -> `/` and falls back safely for an unknown/unbuilt referenceType (still shows title/body); the type-meta map renders a generic icon for an unknown type.
- **Gates:** backend `vitest` + merchant-web `jest` green; `tsc --noEmit` clean both; dash-clean; scope-clean.

---

## 11. Slice sequence (high-level; the plan details the tasks)

Backend first, then frontend; each owner-gated, behind the green merchant-web jest + backend vitest gates.
1. **B1** - `src/api/merchant/notifications/{service,routes}.ts` (mirror admin, MERCHANT_ADMIN scope) + register in `plugin.ts` + cross-person/suspend/existing-rows tests.
2. **F1** - `lib/api/notifications.ts` + `lib/notifications/resolveDestination.ts` (+ type-meta map) + tests.
3. **F2** - topbar bell wired (badge + popover + poll) + tests.
4. **F3** - `/notifications` "see all" page + tests.

(B1 + the frontend may be two PRs - backend, then frontend - or one; the plan decides the cut points.)

**Execution model:** fresh implementer + fresh adversarial reviewer per slice; `/code-review` + Codex SHA-bound per PR; never merge without SHA-bound owner approval; Playwright permitted on the prototype + dev server for QA.

---

## 12. Open questions / self-review

- **Popover primitive:** merchant-web has no Radix Popover (admin-web does); the bell popover is a custom anchored panel or the `Dialog` primitive. A plan-level choice; either is fine. (Not a fork.)
- **Recent-N count in the popover** (proposed 8) and **poll interval** (45s, mirroring admin) - confirm in the plan.
- **`/notifications` in the sidebar?** Proposed NO (bell is the entry point; the prototype reaches the full view via "See all"). Confirm.
- **Self-review:** every section maps to OD-A/OD-B + the owner's shape; no schema (model + indexes + `MERCHANT_ADMIN` exist; existing rows carry the reference fields); future producers + email are explicitly deferred with their re-entry path; the resolver is the single extensibility seam; per-person isolation + no-suspend-gate are the load-bearing security invariants.

---

**Next step:** owner review of this spec. On approval, the Tier-2 implementation plan (`docs/superpowers/plans/2026-06-21-merchant-web-m4-notifications-bell.md`) will break it into the B1/F1/F2/F3 slices. No implementation code, schema, or PRs until the plan is approved.
