# Merchant Portal M4 - Notification Bell Foundation - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan slice-by-slice (fresh implementer + fresh adversarial reviewer per slice). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the merchant notification-bell foundation (no-schema, future-proof generic inbox) per the approved spec `docs/superpowers/specs/2026-06-21-merchant-web-m4-notifications-bell-design.md`.

**Architecture:** A new `src/api/merchant/notifications/` read module mirroring the admin notification service/routes, scoped `recipientType MERCHANT_ADMIN + recipientId = req.user.sub` (per-person, no `resolveAdminMerchant` suspend gate). A merchant-web `lib/api/notifications.ts` client + a `lib/notifications/` resolver/type-meta/relative-time, a `NotificationBell` component wired into the topbar (badge + custom popover + 45s poll), and a `/notifications` "see all" view. No schema.

**Tech stack:** Backend Fastify + Prisma 7 + vitest. Frontend Next 15 App Router + React Query + zod + jest/RTL (merchant-web port 3003).

**Locked spec defaults:** custom lightweight popover; most-recent 8 in the popover; 45s poll (matches the admin bell); `/notifications` NOT in the sidebar (the bell is the entry point).

**PR structure (mirror M3):** two stacked, owner-gated PRs.
- **PR-A (backend):** B1. Branch `feat/merchant-web-m4-notifications-backend` off `main`.
- **PR-B (frontend):** F1 + F2 + F3. Branch `feat/merchant-web-m4-notifications-frontend` stacked on PR-A; rebased onto `main` when PR-A merges.

**Hard stop-and-report:** any schema/migration need; any change to customer-app / customer-web / admin-web; any new notification PRODUCER (M4 is read-only); any email/notification-delivery implementation; anything exposing customer PII; any uncertainty about per-person isolation. (New producers + emails + Home v1 are explicitly out of M4.)

**Merge rule:** implement + test + review + open PRs in the background; never merge without explicit SHA-bound owner approval; pause at each merge gate with PR URL, head SHA, exact files, CI status, review verdict, scope confirmation.

---

## File structure

**Backend (PR-A):**
- Create `src/api/merchant/notifications/service.ts` - `listMerchantNotifications`, `getMerchantUnreadCount`, `markMerchantNotificationRead`, `markAllMerchantNotificationsRead`.
- Create `src/api/merchant/notifications/routes.ts` - `merchantNotificationRoutes(app)` (4 endpoints).
- Modify `src/api/merchant/plugin.ts` - register `merchantNotificationRoutes`.
- Tests: `tests/api/merchant/notifications/{service,routes}.test.ts`.

**Frontend (PR-B):**
- Create `apps/merchant-web/lib/api/notifications.ts` - zod client.
- Create `apps/merchant-web/lib/notifications/resolveDestination.ts` - deep-link resolver + `REFERENCE_DESTINATIONS`.
- Create `apps/merchant-web/lib/notifications/typeMeta.ts` - `NOTIFICATION_TYPE_META` + `notificationTypeMeta(type)`.
- Create `apps/merchant-web/lib/notifications/relativeTime.ts` - `formatRelativeTime(iso)`.
- Create `apps/merchant-web/components/notifications/NotificationBell.tsx` - badge + popover + poll.
- Modify `apps/merchant-web/components/shell/Topbar.tsx` - replace the inert Notifications `IconButton` with `<NotificationBell/>`.
- Create `apps/merchant-web/app/(app)/notifications/page.tsx` - the "see all" view + `components/notifications/NotificationsList.tsx`.
- Tests: `apps/merchant-web/lib/api/__tests__/notifications.test.ts`, `apps/merchant-web/lib/notifications/__tests__/{resolveDestination,typeMeta,relativeTime}.test.ts`, `apps/merchant-web/components/notifications/__tests__/NotificationBell.test.tsx`, `apps/merchant-web/app/(app)/notifications/__tests__/page.test.tsx`.

---

## PR-A - Backend (B1), no schema

### Task B1: merchant notification read endpoints

**Files:** Create `src/api/merchant/notifications/{service,routes}.ts`; Modify `src/api/merchant/plugin.ts`; Test `tests/api/merchant/notifications/{service,routes}.test.ts`.

- [ ] **Step 1: branch.** `git checkout main && git pull --ff-only origin main && git checkout -b feat/merchant-web-m4-notifications-backend`.

- [ ] **Step 2: write failing tests** (`tests/api/merchant/notifications/routes.test.ts`) using the buildApp + prisma-mock + merchant-JWT harness from `tests/api/merchant/redemptions/list.test.ts` (the merchant token signs `{ sub: 'ma1', role: 'merchant', deviceId, sessionId }`, so `req.user.sub === 'ma1'` is the recipientId). Cases:
  - `GET /api/v1/merchant/notifications` -> 200; the `findMany`/`count` `where` is `{ recipientType: 'MERCHANT_ADMIN', recipientId: 'ma1' }`; `orderBy { sentAt: 'desc' }`; returns `{ notifications, page, pageSize, total }`; default page 1 / pageSize 20.
  - `?unreadOnly=true` adds `isRead:false` to the `where`; `?unreadOnly=false` does NOT (the `z.enum(['true','false'])` parse, not `z.coerce.boolean`); `?unreadOnly=banana` -> 400.
  - `?pageSize=51` -> 400 (max 50); `?page=2&pageSize=10` -> `skip:10, take:10`.
  - curated select: the `select` has `id,type,title,body,referenceId,referenceType,isRead,readAt,sentAt` and NO other field.
  - `GET .../unread-count` -> `{ count }` with `where { recipientType:'MERCHANT_ADMIN', recipientId:'ma1', isRead:false }`.
  - `POST .../:id/read` -> `updateMany` `where { id, recipientType:'MERCHANT_ADMIN', recipientId:'ma1', isRead:false }`, `data { isRead:true, readAt:<Date> }`, returns `{ updated }`; a not-mine id (recipientId mismatch) is a no-op `updated:0` (the scoped where guarantees it).
  - `POST .../read-all` -> `updateMany` over `{ recipientType:'MERCHANT_ADMIN', recipientId:'ma1', isRead:false }`, `{ updated }`.
  - **Per-person isolation:** a second merchant-admin token (`sub:'ma2'`) scopes every `where` to `recipientId:'ma2'` (cannot read/mutate ma1's rows).
  - **No suspend gate:** set `app.prisma.merchantMembership.findFirst` to return a SUSPENDED merchant; the notifications endpoints STILL return 200 (the routes never call `resolveAdminMerchant`, so suspension does not block reading one's own notices). Assert no `MERCHANT_SUSPENDED` error.

- [ ] **Step 3: run, expect fail.**

- [ ] **Step 4: implement** `src/api/merchant/notifications/service.ts`:

```ts
import type { PrismaClient } from '../../../../generated/prisma/client'

// M4 merchant personal bell. Pure functions scoped to one merchant-admin's bell:
// every query/update is bound to recipientType MERCHANT_ADMIN + recipientId (the
// MerchantAdmin id = req.user.sub), so one person can never read or mutate another's
// rows. Mirrors src/api/admin/notifications/service.ts with MERCHANT_ADMIN.
const MERCHANT_ADMIN = 'MERCHANT_ADMIN' as const

export async function listMerchantNotifications(
  prisma: PrismaClient,
  merchantAdminId: string,
  opts: { page: number; pageSize: number; unreadOnly: boolean },
) {
  const where = {
    recipientType: MERCHANT_ADMIN,
    recipientId: merchantAdminId,
    ...(opts.unreadOnly ? { isRead: false } : {}),
  }
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
      select: {
        id: true, type: true, title: true, body: true,
        referenceId: true, referenceType: true,
        isRead: true, readAt: true, sentAt: true,
      },
    }),
    prisma.notification.count({ where }),
  ])
  return { notifications, page: opts.page, pageSize: opts.pageSize, total }
}

export async function getMerchantUnreadCount(prisma: PrismaClient, merchantAdminId: string) {
  const count = await prisma.notification.count({
    where: { recipientType: MERCHANT_ADMIN, recipientId: merchantAdminId, isRead: false },
  })
  return { count }
}

export async function markMerchantNotificationRead(prisma: PrismaClient, merchantAdminId: string, id: string) {
  const res = await prisma.notification.updateMany({
    where: { id, recipientType: MERCHANT_ADMIN, recipientId: merchantAdminId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return { updated: res.count }
}

export async function markAllMerchantNotificationsRead(prisma: PrismaClient, merchantAdminId: string) {
  const res = await prisma.notification.updateMany({
    where: { recipientType: MERCHANT_ADMIN, recipientId: merchantAdminId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return { updated: res.count }
}
```

`src/api/merchant/notifications/routes.ts`:

```ts
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import {
  listMerchantNotifications, getMerchantUnreadCount,
  markMerchantNotificationRead, markAllMerchantNotificationsRead,
} from './service'

// Merchant personal bell. authenticateMerchant is applied by the merchant plugin
// scope; req.user.sub IS the MerchantAdmin id = recipientId. NO resolveAdminMerchant
// (notifications are per-person, not per-merchant-org) so a suspended/rejected
// merchant can still read the notice that tells them so. Isolation = recipientId.
export async function merchantNotificationRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/notifications'

  app.get(prefix, async (req: FastifyRequest) => {
    const q = z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(50).optional(),
      // string query: parse the literal token (Boolean('false') === true would break ?unreadOnly=false)
      unreadOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    }).parse(req.query)
    return listMerchantNotifications(app.prisma, req.user.sub, {
      page: q.page ?? 1, pageSize: q.pageSize ?? 20, unreadOnly: q.unreadOnly ?? false,
    })
  })

  app.get(`${prefix}/unread-count`, async (req: FastifyRequest) => {
    return getMerchantUnreadCount(app.prisma, req.user.sub)
  })

  app.post(`${prefix}/:id/read`, async (req: FastifyRequest) => {
    const id = z.object({ id: z.string().min(1) }).parse(req.params).id
    return markMerchantNotificationRead(app.prisma, req.user.sub, id)
  })

  app.post(`${prefix}/read-all`, async (req: FastifyRequest) => {
    return markAllMerchantNotificationsRead(app.prisma, req.user.sub)
  })
}
```

Register in `src/api/merchant/plugin.ts`: import `merchantNotificationRoutes` and add `await scoped.register(merchantNotificationRoutes)` alongside the other route registrations (inside the `authenticateMerchant` scope).

- [ ] **Step 5: run, expect pass. Step 6: commit** (`src/api/merchant/notifications/** + plugin.ts + tests`).

- [ ] **Step 7: full gate.** `npx vitest run tests/api/merchant` green; `npm run test:unit` green; `npx tsc --noEmit` clean; dash-clean staged. **Step 8:** open **PR-A** off `main` and PAUSE at the merge gate.

---

## PR-B - Frontend (F1 + F2 + F3), stacked on PR-A

> Branch `feat/merchant-web-m4-notifications-frontend` off the backend branch. Run jest from `apps/merchant-web`. Mirror the conventions: `lib/api/client.ts` `apiFetch(..., { auth:true })`; React Query flat keys + `invalidateQueries`; tests with a `QueryClientProvider` wrapper. House style: no em dashes; no emojis; icons via `@/lib/icons`; brand tokens from `app/globals.css`.

### Task F1: API client + resolver + type-meta + relative-time (pure, TDD first)

**Files:** Create `lib/api/notifications.ts`, `lib/notifications/{resolveDestination,typeMeta,relativeTime}.ts`; Tests `lib/api/__tests__/notifications.test.ts`, `lib/notifications/__tests__/{resolveDestination,typeMeta,relativeTime}.test.ts`.

- [ ] **Step 1: failing tests.**
  - `notifications.ts`: `listNotifications(opts)` builds the querystring + parses `{ notifications[], page, pageSize, total }`; `getUnreadCount()` -> `{ count }`; `markNotificationRead(id)` POSTs `/notifications/:id/read`; `markAllNotificationsRead()` POSTs `/notifications/read-all`. Mock `apiFetch`.
  - `resolveDestination.ts`: `'merchant'` -> `{ href:'/', built:true }`; unknown referenceType -> `{ href:'/', built:false }`; `null` -> `{ href:'/', built:false }` (safe fallback, never throws).
  - `typeMeta.ts`: `MERCHANT_VERIFICATION_UPDATE` + `VOUCHER_APPROVAL_UPDATE` -> a label + an Icon; an unknown type -> the generic `{ label:'Notification', Icon: Bell }`.
  - `relativeTime.ts`: `formatRelativeTime(iso)` -> "just now" / "Nm ago" / "Nh ago" / "Nd ago" / a date for older; pass a fixed `now` arg for determinism (do NOT call `new Date()` inside the test without injecting now).

- [ ] **Step 2: implement.** `lib/api/notifications.ts`:

```ts
import { z } from 'zod'
import { apiFetch } from './client'

export const notificationSchema = z.object({
  id: z.string(), type: z.string(), title: z.string(), body: z.string(),
  referenceId: z.string().nullable(), referenceType: z.string().nullable(),
  isRead: z.boolean(), readAt: z.string().nullable(), sentAt: z.string(),
}).passthrough()
export type Notification = z.infer<typeof notificationSchema>

export interface NotificationListOpts { page?: number; pageSize?: number; unreadOnly?: boolean }
function qs(o: Record<string, unknown>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString(); return s ? `?${s}` : ''
}
export async function listNotifications(opts: NotificationListOpts = {}) {
  const data = await apiFetch(`/api/v1/merchant/notifications${qs(opts)}`, { method: 'GET', auth: true })
  return z.object({ notifications: z.array(notificationSchema), page: z.number(), pageSize: z.number(), total: z.number() }).parse(data)
}
export async function getUnreadCount() {
  return z.object({ count: z.number() }).parse(await apiFetch('/api/v1/merchant/notifications/unread-count', { method: 'GET', auth: true }))
}
export async function markNotificationRead(id: string) {
  return apiFetch(`/api/v1/merchant/notifications/${id}/read`, { method: 'POST', auth: true })
}
export async function markAllNotificationsRead() {
  return apiFetch('/api/v1/merchant/notifications/read-all', { method: 'POST', auth: true })
}
```

`lib/notifications/resolveDestination.ts`:

```ts
export interface NotificationDestination { href: string; built: boolean }
const HOME = '/'

// referenceType -> destination builder. Only the CURRENTLY-BUILT sections appear
// here; a future module adds ONE entry (e.g. voucher: id => ({ href:`/vouchers/${id}`, built:true }))
// when its section ships. Everything else hits the safe fallback below.
const REFERENCE_DESTINATIONS: Record<string, (id: string | null) => NotificationDestination> = {
  merchant: () => ({ href: HOME, built: true }), // home/lifecycle hub: status + changes-requested live here
}

export function resolveNotificationDestination(
  referenceType: string | null, referenceId: string | null, _type?: string,
): NotificationDestination {
  if (referenceType && REFERENCE_DESTINATIONS[referenceType]) return REFERENCE_DESTINATIONS[referenceType](referenceId)
  return { href: HOME, built: false } // safe fallback: nearest existing parent; the row still shows title/body
}
```

`lib/notifications/typeMeta.ts`:

```ts
import { Bell, ScanLine, Ticket } from '@/lib/icons'
import type { ComponentType } from 'react'

export interface NotificationTypeMeta { label: string; Icon: ComponentType<{ size?: number }> }
const NOTIFICATION_TYPE_META: Record<string, NotificationTypeMeta> = {
  MERCHANT_VERIFICATION_UPDATE: { label: 'Application update', Icon: ScanLine },
  VOUCHER_APPROVAL_UPDATE: { label: 'Voucher update', Icon: Ticket },
}
export function notificationTypeMeta(type: string): NotificationTypeMeta {
  return NOTIFICATION_TYPE_META[type] ?? { label: 'Notification', Icon: Bell }
}
```
(If `Ticket` is not exported from `@/lib/icons`, add it there or use an existing icon - confirm against `lib/icons.ts`.)

`lib/notifications/relativeTime.ts`: a pure `formatRelativeTime(iso: string, now: Date = new Date()): string` returning "just now" (<60s), "Nm ago", "Nh ago", "Nd ago" (<7d), else a short date. Accept an injectable `now` for tests.

- [ ] **Step 3: run jest, expect pass. Step 4: commit.**

### Task F2: NotificationBell (badge + custom popover + poll) wired into the topbar

**Files:** Create `components/notifications/NotificationBell.tsx`; Modify `components/shell/Topbar.tsx`; Test `components/notifications/__tests__/NotificationBell.test.tsx`.

- [ ] **Step 1: failing tests** (`QueryClientProvider` wrapper; mock `@/lib/api/notifications` + `next/navigation` `useRouter`): the badge shows the unread count and caps at "9+" (count 12 -> "9+"); no badge when count is 0; clicking the bell opens the popover; the popover lists the recent items (mock `listNotifications` returning 8) with unread dots; "Mark all as read" calls `markAllNotificationsRead` + invalidates; clicking a row calls `markNotificationRead(id)` then `router.push(resolveNotificationDestination(...).href)`; "See all" pushes `/notifications`.

- [ ] **Step 2: implement** `components/notifications/NotificationBell.tsx` (client). Owns:
  - `useQuery(['notifications','unread-count'], getUnreadCount, { refetchInterval: 45_000, refetchOnWindowFocus: true })`; badge = `count > 9 ? '9+' : String(count)`, hidden when 0. The bell button reuses the topbar `IconButton` visual (38x38, the Bell icon) with a small absolute count bubble (brand red `#E20C04`, white text) - a custom bubble, not the `Badge` primitive.
  - Popover open state; mirror the account-menu pattern already in `Topbar.tsx` (a `position:fixed inset:0` scrim that closes on outside-click + an absolute panel `top:46 right:0`, Escape to close, focus the first item on open).
  - When open: `useQuery(['notifications','recent'], () => listNotifications({ pageSize: 8 }), { enabled: open, refetchInterval: 45_000 })`. Each row: `notificationTypeMeta(type).Icon` + title (600) + body (truncated, secondary) + `formatRelativeTime(sentAt)` + an unread dot when `!isRead`. Row `onClick`: `markNotificationRead(id)` (fire), `queryClient.invalidateQueries({ queryKey:['notifications'] })`, close, `router.push(resolveNotificationDestination(referenceType, referenceId, type).href)`.
  - Footer: "Mark all as read" (`markAllNotificationsRead` -> invalidate) + "See all" (`router.push('/notifications')`).
  - Empty state ("You are all caught up") + loading + error.
- Wire into `Topbar.tsx`: replace `<IconButton label="Notifications"><Bell size={18} /></IconButton>` with `<NotificationBell />`. Leave Quick-actions inert.

- [ ] **Step 3: run jest, expect pass. Step 4: commit.**

### Task F3: `/notifications` "see all" view

**Files:** Create `app/(app)/notifications/page.tsx` + `components/notifications/NotificationsList.tsx`; Test `app/(app)/notifications/__tests__/page.test.tsx`.

- [ ] **Step 1: failing tests:** the page lists notifications (mock `listNotifications`), shows loading/empty/error; an unread-only toggle re-queries with `unreadOnly:true` (query-key change); "Mark all as read" calls the API + invalidates; clicking a row marks read + `router.push` to the resolved destination; pagination (next/prev or page controls) drives `page` in the query key. NOT in the sidebar (no `navItems.ts` change - assert nothing added there; the route is reached only via the bell "See all").

- [ ] **Step 2: implement** `app/(app)/notifications/page.tsx` (client, shell-wrapped) + `NotificationsList.tsx`: `useQuery(['notifications','list', { page, unreadOnly }], () => listNotifications({ page, pageSize: 20, unreadOnly }))`; a header with the unread-only toggle + "Mark all as read"; rows (icon, title, body, relative time, unread dot) each clickable (mark-read + deep-link via `resolveNotificationDestination`); pagination from `{ total, page, pageSize }`; empty/loading/error states. Do NOT touch `navItems.ts`.

- [ ] **Step 3: run jest, expect pass. Step 4: commit.**

### Task F4: frontend gate
- [ ] `cd apps/merchant-web && npx tsc --noEmit` clean; `npx jest --forceExit` green; `npm run lint` clean; `npm run build` succeeds; dash-clean; scope = `apps/merchant-web/**` only. Open **PR-B** stacked on PR-A and PAUSE at the merge gate.

---

## Execution model

- Per slice: a fresh implementer subagent (TDD, explicit COMMIT step, scope-locked) -> a fresh adversarial reviewer subagent checking against the spec, this plan, live code, the privacy/security invariants (per-person `recipientId` isolation + cross-person denial; no-suspend-gate; curated select; no new producer / no email / no schema), and the closed-scope exclusions.
- Per PR: `/code-review` + a Codex-style fresh review on the delta before the merge gate, SHA-bound.
- Stop-and-report on any hard condition (schema, cross-app, new producer, email, PII).
- Never merge without SHA-bound owner approval; pause at each gate with the full report.

---

## Self-review

- **Spec coverage:** B1 (§4 backend), F1 (§5.1 client + §6 resolver/type-meta), F2 (§5.2 bell), F3 (§5.3 see-all) - all mapped. The deferred items (new producers, emails, Home v1, future enum additions) are NOT tasks (correctly out of scope).
- **No schema:** every task is additive endpoints/UI over the existing model + indexes; no `prisma/**`.
- **Type consistency:** `Notification` (frontend zod) mirrors the backend curated select (`id,type,title,body,referenceId,referenceType,isRead,readAt,sentAt`); the resolver + type-meta both have a safe fallback for unknown values; `req.user.sub` is the recipientId on every backend fn.
- **Locked defaults honoured:** custom popover; 8 in the popover; 45s poll; `/notifications` not in the sidebar.
- **Placeholder scan:** none - each step has real code or a concrete test list.

---

**Next step:** owner review of this plan. On approval, execute B1 -> F1 -> F2 -> F3 subagent-driven (fresh implementer + fresh adversarial review per slice), open PR-A then PR-B, pausing at each merge gate for SHA-bound approval. No implementation until approved.
