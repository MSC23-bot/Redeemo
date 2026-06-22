# Merchant Portal - Staff & Access (v1) - Design Spec

**Status:** Draft - rev 2 (Codex-review amendments applied; for owner review before the implementation plan)
**Tier:** 3 (new merchant-side authorization architecture + the first non-owner roles + one additive schema column), plan-first, owner-gated per PR.
**Date:** 2026-06-22
**Revision 2 (2026-06-22):** applied 6 Codex-review amendments backed by a 13-agent cited route/fact audit - (1) the §4.3 route-guard matrix (every merchant route classified, no owner-only assumptions) + the §4.1 two-resolver safe-default-deny pattern + §4.4 login/session non-owner extension; (2) §5.1.1 explicit voucher-write protection (`OWNER||canManageVouchers`) + four-case tests; (3) §6.1 suspended = BLOCKED (not read-only); (4) §5.1.2 invite email-delivery dependency (dark by default); (5) §5.3 app-user findFirst-ambiguity guard; (6) §5.2 "Specific branches" reworded as an in-v1 sequencing gate (not a permanent deferral). No finding rejected.
**Milestone goal:** Let a merchant owner build and manage their team from the portal: invite portal members (Branch managers / Staff) by email, assign role + branch scope, optionally delegate voucher management to a Branch manager, deactivate / reactivate / remove members, and resend invites; plus surface their in-store app validators (BranchUser) read-only with reset-password / deactivate / reactivate. This introduces the merchant portal's first real role + branch-scope authorization, enforced centrally and server-side, never displayed as a boundary the server does not enforce.

**Predecessor:** M0-M4 + Day-2 Vouchers + B1 polish are complete on main (`0b8f0522`). Staff & Access was chosen as the next milestone via the 2026-06-22 source-verified audit + a full grill-me decision tree (every decision in section 0 was approved decision-by-decision). Day-2 Branches and My Account are sequenced after this milestone because branch-scoped roles, validation attribution, and future permission boundaries all depend on the role/authz spine built here.

---

## 0. Resolved decisions (grill-me, owner-approved)

| # | Decision | Outcome |
|---|---|---|
| D1 | Sequencing | **Staff & Access is the next milestone** (brainstorm-first). It is the permission spine for Branches, voucher management, validation attribution, and future app access. Building Branches first would force an authz retrofit. |
| D2 | Identity model | **Option C - staged: prototype-shaped UI, split backend.** v1 manages portal users (`MerchantAdmin` + `MerchantMembership`) AND surfaces app users (`BranchUser`) in one prototype-shaped list, correlating portal<->app **by email at the service layer for DISPLAY only, never authorization**. No real identity unification, no mobile-auth migration, no `validatedByAdminId`. **Option B (true unified person) is recorded as the long-term direction**, deferred to a dedicated future schema/security milestone. |
| D3 | Role / capability | **Three fixed roles (Owner / Branch manager / Staff) + ONE additive boolean `MerchantMembership.canManageVouchers`.** Owner has voucher power implicitly; a Branch manager can be granted `canManageVouchers` (business-wide); Staff can never receive it. No full capability engine. Manage campaigns / Manage billing remain coming-soon. |
| D4 | Branch-scope enforcement | **Central enforcement.** Extend `resolveAdminMerchant` into one authz resolver returning role + allowed-branch set + `canManageVouchers`; every branch-specific route consults it. **Invariant: never display a branch boundary the server does not enforce.** Do not surface the "Specific branches" option until central enforcement covers every branch-specific route a non-owner can reach. |
| D5 | Invitation / account lifecycle | **Portal members: invite-by-email reusing the single-use 7-day claim-token flow** (member sets own password, proves email control, `emailVerified=true`; owner never knows the password). **App users: keep the existing temp-password + `mustChangePassword` flow** (do not rebuild). |
| D5b | Email collision | If an invited email already belongs to an existing `MerchantAdmin`, **reject with a clear "email already in use" error** (no second membership). **Multi-merchant identity is deferred.** An email existing as a `BranchUser` is allowed (separate table; display-correlation only). |
| D6 | Lifecycle / actions | **Deactivate = membership `status:INACTIVE` (reversible, stays in list); Remove = membership `status:DELETED` (drops from list, re-invitable, no orphan); never hard-delete the membership row or the person.** Reactivate = `status:ACTIVE`. **Resend invite (required)** for not-yet-claimed members (`passwordHash==null`): mint a fresh token, invalidate the old. Every mutation audited. |
| D6b | App access on remove | **Portal action affects the portal membership only.** Do not auto-deactivate the email-correlated `BranchUser`. App access has its own explicit app-side actions. |
| D7 | App-user scope | **Display app users + reset-password + deactivate/reactivate only** (reuse existing routes; one additive read query). **No full app-user CRUD, no multi-user-per-branch redesign, no by-id route extension** in v1 unless the implementation audit proves it is required for the selected actions; prefer display-only over an unsafe ambiguous action. |
| D8 | Owner-lockout / role-edit | **Multiple owners allowed; owners may invite/promote/demote/deactivate/remove other owners, except the last active owner** (existing `assertNotLastOwner` on every owner-affecting path). Only owners mint owners. Non-owners never self-edit role/scope/capability. Client-supplied role/scope/capability is never trusted. Everything audited. |
| D9 | Email preferences | **Hardcoded role-based defaults shown informationally; no schema, no editable toggles.** Owners/managers default to redemption alerts + monthly report once email is live; Staff get none; app-only users have no portal email prefs. Editable per-member prefs + the actual emails are deferred to Phase 6. |
| D10 | Slicing | **Foundation-first horizontal: spec -> plan -> PR-A (authz resolver + the one migration + guards, no UI) -> PR-B (membership CRUD + branch-scope enforcement + app-user display/actions, no UI) -> PR-C (merchant-web module).** Fresh implementer + fresh adversarial reviewer + SHA-bound merge gate per PR. PR-B may sub-split. |

---

## 1. Verified current state (live-code cross-check)

| Capability | Live reality (cited) | Bucket / decision |
|---|---|---|
| Membership model | `MerchantMembership` (`prisma/schema.prisma:225-243`): `role MerchantRole`, `allBranches Boolean @default(true)`, `status UserStatus`, `invitedById String?` (no FK), `@@unique([merchantId, merchantAdminId])`. | Foundation - already present, no schema for roles/scope |
| Roles enum | `MerchantRole` (`219-223`) = OWNER / BRANCH_MANAGER / STAFF. **Only OWNER is ever created today** (`auth/merchant/service.ts:583` register, `:352` claim, `admin/merchants/service.ts:352` create-draft). BRANCH_MANAGER / STAFF are defined but unused. | BUILD: the milestone activates the unused roles |
| Branch-scope join | `MerchantMembershipBranch` (`245-256`): `onDelete: Cascade`. **Never read or written in `src/`.** | BUILD: write rows for scoped members; enforce centrally |
| Person record | `MerchantAdmin` (`183-208`): `email @unique` (global within table), `passwordHash String?` (nullable - supports invited-not-yet-claimed), `firstName/lastName/jobTitle`, `status`, `mustChangePassword`, `emailVerified`, `memberships[]`. | Foundation for claim-link invite |
| App-user record | `BranchUser` (`262-283`): SEPARATE login, `email @unique` (within its own table), `passwordHash` required, FK to `Branch`, `validations VoucherRedemption[]`. No FK/link to `MerchantAdmin`. | D2 split backend; D7 display + reuse |
| `canManageVouchers` field | Does NOT exist on `MerchantMembership`; no spare boolean or JSON slot. | **The only schema change (D3): one additive `canManageVouchers Boolean @default(false)`** |
| Merchant JWT | `app.jwt.merchant.sign({ sub: admin.id, role: 'merchant', deviceId, sessionId })` (`auth/merchant/service.ts:249-251`). **No merchantId** (Redis cache), **no membership role, no branch scope, no capability.** | Resolver must surface role/scope/cap per-request (not from the token) |
| Central resolver | `resolveAdminMerchant(prisma, adminId)` (`merchant/shared.ts:72-90`) calls `getOwnerMembership` (OWNER only), returns `{ adminId, merchantId }`, throws on suspended. **Resolves OWNER only - a non-owner membership would not resolve at all today.** | **NEEDS-BACKEND (PR-A): extend to resolve any ACTIVE membership and return role + allowed branches + `canManageVouchers`.** Additive: existing owner-only callers keep working |
| Owner helpers | `getOwnerMembership(adminId)` + `getMerchantOwnerContact(merchantId)` use `findFirst` for OWNER (`shared/merchantMembership.ts:25-58`). | Multi-owner notification fan-out uses `findFirst` -> only one owner notified (D8 known deferred follow-up) |
| Last-owner guard | `assertNotLastOwner(prisma, merchantId, membershipId)` throws `LAST_OWNER_PROTECTED` (`shared/merchantMembership.ts:60-80`). Doc: "exists so the M2+ ownership mutations can call it from day one." **Already built + test-pinned.** | REUSE on every owner-affecting mutation (D8) |
| Claim-token flow | `issueMerchantClaim` stores a single-use token in Redis (`RedisKey.merchantClaim`, `CLAIM_TTL = 7*24*3600`), emails `claimAccountEmail(buildClaimLink(token))`; `claimMerchantAccount` lets the person set their own password + sets `emailVerified=true` (`auth/merchant/service.ts:392-470`). | REUSE for portal-member invite (D5) |
| Email collision | `createMerchantDraft` does `merchantAdmin.findUnique({where:{email}})` -> `EMAIL_ALREADY_EXISTS` (also P2002) (`admin/merchants/service.ts:318-389`). | Mirror for invite (D5b: reject) |
| App-user routes | `branchUserMgmtRoutes` (`auth/merchant/branch-user.routes.ts:12-59`): `POST /user` (create), `POST /user/reset-password`, `PATCH /user/deactivate`, `PATCH /user/reactivate`, `PATCH /pin`. Registered `app.ts:15`. **No list endpoint.** | D7: reuse reset/deactivate/reactivate; add a read query |
| App-user route shape | `createBranchUser` takes an owner-supplied `password` + sets `mustChangePassword:true`; `resetBranchUserPassword` / `deactivateBranchUser` / `reactivateBranchUser` use `findFirst({where:{branchId}})` - **one app user per branch, addressed by `branchId` not id** (`branch-user.service.ts:33-177`). Gated by `assertBranchOwnership` (owner-scoped). | D7: accept one-per-branch for v1; multi-user + by-id deferred |
| Session revocation | `revokeAllSessionsForEntity(redis,{role,entityId})` + `revokeAllUserSessionRecords(prisma,...)` exist; used by branch-user deactivate (`branch-user.service.ts:110-111,153`). | REUSE on portal deactivate/remove (role `'merchant'`) |
| Audit | `AuditLog` (`entityId/entityType/event/actorId/actorType/before/after/reason/metadata`); `writeAuditLog`/`writeAudit` used across branch + admin services. | REUSE for all staff mutations (D6/D8) |
| Validation attribution | `verifyRedemption` writes `validatedById = actor.role==='branch' ? actorId : null` (`redemption/service.ts:553`). **Merchant-admin validations write null; no `validatedByAdminId`.** | Unchanged in v1 (deferred) |
| Redemptions scope | M3 list ANDs a client `branchId` with `branch.merchantId` (cross-tenant safe) but does NOT restrict to the caller's assigned branches (`merchant/redemptions/service.ts:17-24`). | NEEDS-BACKEND (PR-B): intersect with the caller's allowed-branch set |
| Status enum | `UserStatus` = ACTIVE / INACTIVE / SUSPENDED / DELETED (all four values exist). | D6 uses INACTIVE (deactivate) + DELETED (remove) |
| Email delivery | `EMAIL_ENABLED` defaults off -> no network call (`shared/email.ts:48`). No per-member notif-pref field; no redemption-alert / monthly-report email exists. | D9 hardcoded defaults; email is Phase 6 |
| Login/session resolver | login/OTP/refresh/register-verify resolve the merchant via `resolveMerchantInfo() -> getOwnerMembership` (OWNER only) (`auth/merchant/service.ts:47-54,76,207,288-292,684`). **A non-OWNER cannot authenticate today.** | NEEDS-BACKEND (PR-A/B, §4.4): extend login/session to resolve any ACTIVE membership |
| Invite delivery / readback | `issueMerchantClaim` mints the token to Redis (7-day TTL) + writes a `CommunicationLog` payload **before** the (dark) email step; `sendEmail` short-circuits when `EMAIL_ENABLED` off. Operator readback only: `prisma/issue-merchant-token.ts` (mint+print), `prisma/_get-merchant-otp.ts` (read QUEUED payload). | §5.1.2: real staff invites email-go-live dependent |
| App-user mutation shape | `resetBranchUserPassword`/`deactivate`/`reactivate` use `findFirst({where:{branchId}})` - no `orderBy`, no count, no `@@unique` on `branchId`; no list endpoint (`branch-user.service.ts:99,139,164`). | §5.3: count-keyed read + refuse-on->1 guard |
| merchant-web surfaces | Pages today: `(app)/page`, `/redemptions`, `/vouchers`, `/notifications`, `/foundations` + auth. **No staff / team / branches management page** (only the onboarding wizard's branch step). | NEEDS-MERCHANT-WEB (PR-C): the Staff & Access module is greenfield |

---

## 2. Prototype cross-check (Claude Design - structure/flow first-class; visual not final)

Source-extracted from the prototype handoff (`/private/tmp/mp-handoff/.../Redeemo for Business.dc.html`, route key `staff`, Live-established + Owner view). The prototype SPA does not render in this environment (custom `{{ }}` template runtime crashes), so the **source is the authoritative definition** of the demo states; structure + behaviour are the anchors, visual execution is improved within the merchant-web design system.

| Prototype capability | v1 decision |
|---|---|
| Header + subtitle ("Portal access lets someone manage on the web; App access lets them validate at their branches") + Add staff button (or "Limit reached" lock) | BUILD (PR-C) |
| Three summary cards: People (active/deactivated), Portal users (X of 8), App users (X of 20) | BUILD (PR-C). Caps **hardcoded** (`portal:8`, `app:20`, the prototype's placeholders); "contact Redeemo to raise" copy, no in-product upgrade |
| Search (appears when > 4 people) | BUILD (PR-C) |
| Allowance warning banner when a limit is full | BUILD (PR-C) from the hardcoded caps |
| Person row: avatar/name (owner star, deactivated pill), email | BUILD (PR-C) |
| Role + access cell: role chip (Owner/Branch manager/Staff), "+ Vouchers" extras chip, access pills (Portal / App) | BUILD (PR-C) |
| Branches cell: All branches / branch name / N branches + "Active {ago}" / "Last seen {ago}" | BUILD (PR-C); "ago" from `lastLoginAt` (best-effort) |
| Row actions: Edit access; Reset app password (app users); Reactivate; Deactivate; Remove from team; last-owner lock footnote | BUILD (PR-C) per D6/D7/D8. **Resend invite added** (not-yet-claimed; D5/D6) |
| Add/Edit drawer: full name, email, job title; Access toggles (Portal/App); Portal role radios + Can/Cannot detail; Extra responsibilities (Manage vouchers live; campaigns/billing coming-soon); Branches scope (All/Specific); Automated emails section; App password reset row (edit+app) | BUILD (PR-C). **Manage vouchers = the `canManageVouchers` grant** (D3). **Automated emails = read-only informational** (D9). **"Specific branches" gated on enforcement coverage** (D4). Campaigns/billing extras = coming-soon |
| No invite/pending status (status only active/deactivated) | v1 adds an implicit not-yet-claimed signal (`passwordHash==null`) driving Resend invite; no new status enum value |
| Lifecycle gating: pre-live = owner-only row + "for now it is just you"; live = full team + Add; suspended = read-only (prototype) | BUILD (PR-C). Pre-live the owner is the only member anyway; Add enabled once live. **v1 suspended = BLOCKED, not read-only (§6.1)** - the prototype's read-only-when-suspended diverges from live and is deferred |
| View-as Owner/Branch manager/Staff lens (prototype-only nav/capability preview); Staff cannot see Staff & access | The lens is a prototype demo control (not shipped). The **capability/nav gating it previews IS shipped** via the central resolver: who can reach/act on Staff & Access follows role (v1: owner-managed; see section 6) |
| "Grant manage vouchers" preview toggle | Realized as the `canManageVouchers` grant in the Edit drawer (owner-only) |

---

## 3. Minimal-schema proof

**Exactly one additive schema change.** Everything else reuses existing models, enums, routes, and helpers.

- **The one change:** `MerchantMembership.canManageVouchers Boolean @default(false)` (D3). Additive, default-false, **no backfill** (existing OWNER rows read `false`; owners get voucher power by role, not by this flag), one migration in PR-A.
- **No schema for:** roles (enum exists), branch scope (`MerchantMembershipBranch` exists), member status lifecycle (`UserStatus` has INACTIVE/DELETED), invite (claim-token flow + nullable `passwordHash` + `emailVerified` exist), `invitedById` (field exists, no-FK), app-user management (`BranchUser` + routes exist), audit (`AuditLog` exists), session revocation (helpers exist), last-owner protection (`assertNotLastOwner` exists), email preferences (hardcoded defaults; deferred).
- **Explicitly NOT added in v1:** any `MerchantAdmin <-> BranchUser` link/FK (D2 deferred), `validatedByAdminId` (deferred), any capability table/array (D3 rejected), any per-member notification-preference field (D9 deferred), any per-merchant caps column (caps hardcoded), any invite/pending status enum value (D6 uses `passwordHash==null`).
- **New error CODES are not schema (rev 2):** `MULTIPLE_BRANCH_USERS` (§5.3) and `MULTI_MEMBERSHIP_UNSUPPORTED` (§4.1) are `AppError` code additions in `shared/errors.ts`, not migrations - the one-additive-column proof stays accurate. (Noted so the plan doesn't read "no new error codes" into the no-schema framing.)

---

## 4. Authorization architecture (PR-A foundation)

### 4.1 Two resolvers - the safe-default-deny pattern

The audit confirmed the hidden risk: today `resolveAdminMerchant` resolves **only the OWNER membership** (`getOwnerMembership`) and is the first call in **every** merchant-management service function (read and write). If we mutated it in place to resolve non-owners, every route would silently admit Branch managers / Staff with owner-level power - an instant authz hole. So the design is **two resolvers**, not one mutated resolver:

- **`resolveAdminMerchant` is left UNCHANGED** - it keeps resolving OWNER-only and throws `INVALID_CREDENTIALS` for a non-owner and `MERCHANT_SUSPENDED` for a suspended merchant (`merchant/shared.ts:82-90`). **A route is "owner-only in v1" simply by continuing to call it** - it denies non-owners by construction, zero new code, no hole.
- **New `resolveMerchantContext(prisma, adminId)`** resolves **any ACTIVE membership** and returns:

```
{
  adminId: string
  merchantId: string
  role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  allBranches: boolean
  allowedBranchIds: string[]      // [] + allBranches=true => all; populated when scoped
  canManageVouchers: boolean      // role==='OWNER' || membership.canManageVouchers
}
```

  It keeps the same SEC-M2 suspended-merchant guard (throws `MERCHANT_SUSPENDED`). Only routes that **intentionally admit non-owners** migrate from `resolveAdminMerchant` to `resolveMerchantContext` + an explicit guard (see the matrix). Every other route stays on `resolveAdminMerchant` = safe deny.

  **Single-membership contract (rev 2):** `getOwnerMembership` uses `findFirst` keyed on `adminId+role+status` with **no `merchantId` selector and no ordering** (`shared/merchantMembership.ts:29`). To prevent a non-deterministic merchant context for a person who somehow holds >1 ACTIVE membership (invariant #10 "multi-merchant rejected in v1" is enforced only at *invite* time, not *resolve* time), `resolveMerchantContext` **must assert exactly one ACTIVE membership** for the `adminId` and throw a deterministic `MULTI_MEMBERSHIP_UNSUPPORTED` if more than one exists - mirroring §5.3's count-then-refuse pattern - so multi-merchant is enforced at the resolver, not just at invite. Pinned by a test: a 2-membership person resolves deterministically refused, never an arbitrary `findFirst` row.

- **Resolver-bypass caveat (rev 2):** the safe-default-deny property in this section holds **only for routes that call `resolveAdminMerchant`/`resolveMerchantContext`.** Two merchant-JWT-reachable routes do **not** call either - the app-root redemption-plugin routes `POST /redemption/verify` and `GET /branch/:branchId/redemptions` authorize off the cached `authMerchant` session (which §4.4 will populate identically for non-owners). They are a **separate class** (the † rows in §4.3) that must get an explicit in-handler scope guard before non-owner login is enabled; they are not protected by "just keep calling `resolveAdminMerchant`."

- The merchant JWT is unchanged (`{ sub, role:'merchant', deviceId, sessionId }`); role/scope/capability are resolved per-request from the membership, mirroring how `merchantId` is resolved today (not placed in the token).

### 4.2 Reusable guards (PR-A)

- `assertNotLastOwner` (exists, `shared/merchantMembership.ts:60-80`) - called by demote/remove/deactivate/self-step-down.
- `assertCanManageVouchers(ctx)` - `ctx.role==='OWNER' || ctx.canManageVouchers`, else `FORBIDDEN`.
- `assertBranchAllowed(ctx, branchId)` - `ctx.allBranches || ctx.allowedBranchIds.includes(branchId)`; **never trusts a client `branchId` alone** (intersect/mask), else `FORBIDDEN`/`NOT_FOUND`.
- `assertOwner(ctx)` - owner-only mutations (mint/promote owners, manage memberships in v1) -> `FORBIDDEN`.
- Role-elevation guard: only an OWNER may set a target role to OWNER or grant `canManageVouchers`; non-owners may never set their own role/scope/capability (server ignores client-supplied values on self).

### 4.3 Route-guard matrix (authz outcome for EVERY merchant route)

**Scope of "merchant route" (corrected rev 2):** this matrix classifies **every route a merchant JWT/session can authenticate to**, defined by **reachability** (any handler that accepts `merchantVerify()` / the `authMerchant` session), **not** by file namespace. An audit grep for `merchantVerify` across all of `src/api` confirms the reachable surface is the `/merchant/*` + `/auth/merchant/*` routes **plus two app-root redemption-plugin routes** (`POST /redemption/verify`, `GET /branch/:branchId/redemptions`) that fall back to `merchantVerify()`. Those two are a distinct **resolver-bypassing** class (see the dagger † rows + §4.1 caveat): they read `merchantId` straight from the Redis `authMerchant` session and call neither resolver, so the safe-default-deny property does **not** cover them - they need an explicit in-handler guard before non-owner login is enabled.

**Outcome legend:** `OWNER` = owner-only (stays on `resolveAdminMerchant`, denies non-owners); `OWNER|MV` = owner or `canManageVouchers` (migrate to context + `assertCanManageVouchers`); `SCOPED-READ` = any active member, branch-scoped read (context + `assertBranchAllowed` / allowed-branch intersect); `SCOPED-WRITE` = any active member, branch-scoped write/action (context + `assertBranchAllowed`); `MEMBER-READ` = any active member, not branch-specific (context, no branch filter); `OWN-RECIPIENT` = scoped to `req.user.sub` (no membership-org resolver); `AUTH/REF` = auth or reference-data, no membership-authz change (but see §4.4 for the login extension). A † marks a **resolver-bypassing** route that authorizes off the cached session, not the resolver.

**Source for outcomes:** the prototype per-role Can/Cannot (Owner all; Branch manager: view vouchers + edit-OWN-branch + scoped redemptions + manage-OWN-branch app staff, manage-vouchers only if granted; Staff: validate+view only) cross-referenced with the locked decisions. Where the prototype grants a Branch manager a **write** capability that would widen v1's enforcement surface (edit-own-branch, manage-own-branch app staff), v1 takes the **safe-deny** path (`OWNER`) and defers the BM-write to a later slice - a denial is never a hole.

| Route | Op | v1 outcome | Notes / deferred |
|---|---|---|---|
| `GET /merchant/branches` | read | SCOPED-READ | scoped member sees only `allowedBranchIds`; owner all |
| `POST /merchant/branches` | write | OWNER | BM cannot create branches (prototype) |
| `GET /merchant/branches/:id` | read | SCOPED-READ | `assertBranchAllowed` |
| `PATCH /merchant/branches/:id` | write | OWNER (v1) | prototype lets BM edit own branch -> **deferred** (BM branch-write slice) |
| `POST /merchant/branches/:id/edit-request` | write | OWNER (v1) | BM edit-own-branch deferred |
| `GET /merchant/branches/:id/edit-requests` | read | OWNER (v1) | BM scoped read deferred (low value) |
| `DELETE /merchant/branches/:id/edit-requests/:editId` | write | OWNER | |
| `POST /merchant/branches/:id/hours` | write | OWNER (v1) | BM edit-own-branch deferred |
| `POST /merchant/branches/:id/amenities` | write | OWNER (v1) | BM edit-own-branch deferred |
| `POST /merchant/branches/:id/photos/edit-request` | write | OWNER (v1) | BM edit-own-branch deferred |
| `DELETE /merchant/branches/:id` | write | OWNER | BM cannot close branches (prototype) |
| `GET /merchant/branches/:id/pin` | read | OWNER (v1) | PIN sensitive; prototype gives BM own-branch PIN -> **deferred** |
| `PUT /merchant/branches/:id/pin` | write | OWNER (v1) | BM own-branch PIN deferred |
| `POST /merchant/branches/:id/pin/send` | write | OWNER (v1) | BM own-branch PIN deferred |
| `GET /merchant/vouchers` | read | MEMBER-READ | all members view vouchers (prototype) |
| `POST /merchant/vouchers` | write | OWNER\|MV | **§5.1 explicit voucher protection** |
| `GET /merchant/vouchers/:id` | read | MEMBER-READ | |
| `PATCH /merchant/vouchers/:id` | write | OWNER\|MV | |
| `POST /merchant/vouchers/:id/submit` | write | OWNER\|MV | |
| `DELETE /merchant/vouchers/:id` | write | OWNER\|MV | |
| `GET /merchant/vouchers/rmv` | read | MEMBER-READ | |
| `POST /merchant/vouchers/rmv/create-flagship` | write | OWNER\|MV | flagship is mandatory-onboarding; plan may tighten to OWNER-only |
| `PATCH /merchant/vouchers/rmv/:id` | write | OWNER\|MV | |
| `POST /merchant/vouchers/rmv/:id/submit` | write | OWNER\|MV | |
| `GET /merchant/redemptions` | read | SCOPED-READ | intersect requested `branchId` with `allowedBranchIds` (today only ANDs `merchantId`) |
| `GET /merchant/redemptions/lookup` | read | SCOPED-READ | scoped member: code's branch must be in `allowedBranchIds`, else `REDEMPTION_NOT_FOUND` mask |
| `GET /merchant/redemptions/export.csv` | read | SCOPED-READ | same intersect |
| † `POST /redemption/verify` (merchant actor) | write | SCOPED-WRITE | **app-root redemption plugin, NOT `/merchant/*`** ([redemption/routes.ts:123-159](src/api/redemption/routes.ts#L123)); falls back to `merchantVerify()`, reads `authMerchant` Redis session, **no resolver**, merchant-WIDE today. This is **Validate-a-code**. PR-B: in the merchant branch, `resolveMerchantContext` + `assertBranchAllowed(ctx, redemption.branchId)` (the redemption row exposes `branchId`); reject out-of-scope -> `BRANCH_ACCESS_DENIED`/`REDEMPTION_NOT_FOUND` mask |
| † `GET /branch/:branchId/redemptions` (merchant actor) | read | SCOPED-READ | **app-root redemption plugin** ([redemption/routes.ts:173-228](src/api/redemption/routes.ts#L173)); `merchantVerify()` + `authMerchant`, only checks `branch.merchantId === session.merchantId`, merchant-WIDE today. PR-B: intersect path `branchId` with `ctx.allowedBranchIds` before listing |
| `GET /merchant/profile` | read | MEMBER-READ | business info read (owner+BM nav); Staff UI doesn't surface it |
| `PATCH /merchant/profile` | write | OWNER | BM cannot edit business identity (prototype) |
| `POST /merchant/profile/edit-request` | write | OWNER | |
| `GET /merchant/profile/edit-requests` | read | OWNER | |
| `DELETE /merchant/profile/edit-requests/:id` | write | OWNER | |
| `GET /merchant/onboarding/checklist` | read | OWNER | onboarding is owner territory; pre-live only owner exists |
| `GET /merchant/onboarding/status` | read | OWNER | |
| `GET /merchant/onboarding/taxonomy` | read | AUTH/REF | reference data, no membership resolver (unchanged) |
| `POST /merchant/onboarding/identity` | write | OWNER | |
| `GET /merchant/onboarding/contract` | read | AUTH/REF | static constants (unchanged) |
| `POST /merchant/onboarding/contract/accept` | write | OWNER | |
| `POST /merchant/onboarding/submit` | write | OWNER | |
| `GET /merchant/notifications` (+ unread-count) | read | OWN-RECIPIENT | per-person `recipientId=sub`; **intentionally unchanged**; suspended-reachable |
| `POST /merchant/notifications/:id/read` (+ read-all) | write | OWN-RECIPIENT | per-person; unchanged |
| `POST /merchant/uploads/:kind` | write | OWNER\|MV (v1) | logo/banner/voucher-image; returns a URL only (persistence routes own the real guard). **Note (rev 2):** `OWNER\|MV` is intentionally broader than any current consumer (logo/banner feed OWNER-only profile writes; only voucher-image needs MV) - acceptable only because the URL is inert without a guarded persistence write. Plan may split by `:kind` (voucher-image -> `OWNER\|MV`; logo/banner -> `OWNER`). BM branch-photo upload **deferred** with BM branch-write |
| `POST /merchant/branches/:branchId/user` (create app user) | write | OWNER (v1) | app-user create stays on existing flow; mgmt owner-only (D7) |
| `POST .../user/reset-password` | write | OWNER (v1) | **§5.3 findFirst-ambiguity guard required** |
| `PATCH .../user/deactivate` | write | OWNER (v1) | **§5.3 findFirst-ambiguity guard required** |
| `PATCH .../user/reactivate` | write | OWNER (v1) | **§5.3 findFirst-ambiguity guard required** |
| `PATCH .../pin` (branch PIN via branch-user routes) | write | OWNER (v1) | duplicate of branch PIN; BM own-branch deferred |
| NEW `*/merchant/staff/*` (list/invite/edit/deactivate/reactivate/remove/resend) | mixed | OWNER | member management owner-only in v1 (`assertOwner`) |
| `POST /merchant/auth/logout` | write | AUTH (any member) | session-scoped, unchanged |
| `POST /merchant/auth/deactivate` \| `/reactivate` (merchant account self) | write | OWNER | account-level self-action; `getOwnerMembership` (unchanged) |
| `POST /merchant/auth/{login,otp/verify,refresh,register,register/verify,register/resend,forgot-password,reset-password,claim}` | mixed | AUTH/REF | public/credential routes; **login/OTP/refresh/verify extended per §4.4 to admit non-owner sessions** |

**v1 net surface that migrates to `resolveMerchantContext` + a guard:** the 3 `/merchant/redemptions` reads, the 10 voucher routes, the 2 branch reads, the 1 profile read, uploads, **and the 2 resolver-bypassing redemption-plugin routes** (`POST /redemption/verify`, `GET /branch/:branchId/redemptions`) = the SCOPED/MEMBER/OWNER|MV set. Everything else stays on `resolveAdminMerchant` (owner-only, safe deny). **Caveat (the † routes):** the safe-default-deny property holds **only** for routes that call `resolveAdminMerchant`/`resolveMerchantContext`; the two † redemption routes call neither, so "deny is never a hole" does NOT cover them - they MUST receive their explicit in-handler guard in the same PR-B slice that enables non-owner login (§4.4), or be blocked for non-owner merchant actors outright in that slice. This bounds PR-B's enforcement work to a known, reviewed set.

### 4.4 Login / session must admit non-owner members (PR-A/PR-B)

The audit found login/OTP/refresh/register-verify resolve the merchant via `resolveMerchantInfo() -> getOwnerMembership` (OWNER only, `auth/merchant/service.ts:47-54,76,207,288-292,684`). **A non-owner cannot authenticate today at all.** For Branch managers / Staff to log in, the login/session path must resolve **any ACTIVE membership** (not only OWNER) and carry the resolved `merchantId` into the session/Redis cache as it does now. The SEC-M2 suspended check on refresh must apply to the resolved membership's merchant regardless of role.

**Coordinated-cutover invariant (corrected rev 2):** non-owner login is **not enabled until every merchant-JWT-reachable route has an explicit matrix outcome AND every resolver-bypassing † route has its explicit in-handler guard.** For routes that call `resolveAdminMerchant`/`resolveMerchantContext`: owner-only routes already deny non-owners by construction, and migrated routes carry their guard - so for *that class* enabling non-owner login only exposes the deliberately-migrated set, no silent widening. **But the two † redemption-plugin routes call neither resolver** - they read the `authMerchant` session that PR-B will populate identically for non-owners, so enabling non-owner login would otherwise expose them with zero branch scope. Therefore the cutover slice MUST also land the explicit `resolveMerchantContext` + `assertBranchAllowed` guards inside `POST /redemption/verify` and `GET /branch/:branchId/redemptions` (or block non-owner merchant actors on them outright) **in the same slice** that turns on non-owner login. PR-A ships the `resolveMerchantContext` + guards + the `canManageVouchers` migration + the login-resolver extension behind tests, with **no route migrated and no UI** (foundation reviewed in isolation); PR-B migrates the matrix's non-owner routes (including the two † routes), then turns on non-owner login only after all of them - resolver routes and † routes - carry their guards.

---

## 5. Backend behaviour (PR-B)

### 5.1 Membership management (portal members)

New owner-only merchant routes (exact paths in the plan), all audited, all guarded by `assertOwner` + the relevant guard:

- **List members** - merchant's memberships (excluding `DELETED`), with role, scope (branch names), status, `canManageVouchers`, claimed-state (`passwordHash!=null`), `lastLoginAt`. Curated select (never returns `passwordHash`).
- **Invite member** (D5) - create `MerchantAdmin` (`passwordHash:null`) + `MerchantMembership` (role/scope/`canManageVouchers`, `status:ACTIVE`, `invitedById`) + write `MerchantMembershipBranch` rows for a scoped member + `issueMerchantClaim` + email. **Reject if email belongs to an existing `MerchantAdmin`** (D5b). Role-elevation guard. Branch-scope only accepted once enforcement coverage exists (D4); until then v1 invites all-branches members.
- **Edit access** - role / branch scope / `canManageVouchers`; re-write `MerchantMembershipBranch` rows; `assertNotLastOwner` if demoting/removing an owner role; role-elevation + self-edit guards; audited before/after.
- **Deactivate** - membership `status:INACTIVE` + revoke merchant sessions + audit. `assertNotLastOwner`.
- **Reactivate** - `status:ACTIVE` + audit.
- **Remove** - membership `status:DELETED` + revoke sessions + clear `MerchantMembershipBranch` rows + audit before/after. `assertNotLastOwner`. Re-invite later flips the row back to ACTIVE (no `EMAIL_ALREADY_EXISTS` dead-end).
- **Resend invite** (D6, required) - only when `passwordHash==null`; mint a fresh claim token, invalidate the old, re-email, audit.

### 5.1.1 Voucher route protection (D3, explicit - Codex amendment)

Day-2 Vouchers currently authorizes via `resolveAdminMerchant` (owner-only). The moment non-owners can log in, the voucher **write** routes (`POST /vouchers`, `PATCH /vouchers/:id`, `POST /vouchers/:id/submit`, `DELETE /vouchers/:id`, and the RMV/flagship write routes) **must** migrate to `resolveMerchantContext` + `assertCanManageVouchers` (`OWNER || canManageVouchers`). Voucher **read** routes (`GET /vouchers`, `GET /vouchers/:id`, `GET /vouchers/rmv`) become `MEMBER-READ`. This retrofit of the existing Day-2 routes is **in PR-B scope** and is not optional - leaving them on the old owner-only resolver would either keep them owner-only (breaking the prototype's "manager with Manage vouchers can create/edit/end vouchers") or, if the resolver were widened, silently admit every member.

**Required tests (must pin all four):**
1. Owner -> voucher write **allowed**.
2. Branch manager **with** `canManageVouchers` -> voucher write **allowed**.
3. Branch manager **without** `canManageVouchers` -> voucher write **denied** (`FORBIDDEN`); read still allowed.
4. Staff -> voucher write **denied** (`FORBIDDEN`); read still allowed.
Plus: a client cannot self-grant `canManageVouchers` (role-elevation guard); a Staff payload carrying `canManageVouchers:true` is ignored server-side.

### 5.1.2 Invite delivery dependency (email-dark - Codex amendment)

The claim-link invite reuses `issueMerchantClaim`, which **always mints the token into Redis** (`merchant-claim:<token>`, 7-day TTL) **before** the email step and writes a `CommunicationLog` row whose payload carries the claim link. But `EMAIL_ENABLED` defaults **off** (`shared/email.ts:48`), so `sendEmail` short-circuits (`skipped:true`) and **the invite email is never delivered**. Operational consequence, stated plainly:

- In a dark-email environment, **inviting a staff member creates a live, claimable token but the member never receives it.** A real staff member cannot self-claim until email is live.
- The only interim retrieval paths are **operator-only dev/admin scripts**: `prisma/issue-merchant-token.ts claim <email>` (mints + prints the claim URL) and `prisma/_get-merchant-otp.ts <emailSubstring>` (reads the token from the still-`QUEUED` `CommunicationLog` payload, before any worker NULLs it). Neither is an in-product UI/API path; an operator must hand the link to the staff member out-of-band.
- **Therefore real staff invites are email-go-live dependent** (Phase 6: `EMAIL_ENABLED=true` + the runbook §6 sender/domain/SPF-DKIM-DMARC gates). v1 ships the invite mechanism and the dev/admin readback as the documented interim; the merchant-web UI must set expectations (e.g. surface the claim link to the owner, or a clear "invite sent once email is live" state) rather than implying an email was delivered. The exact interim UX (show-link-to-owner vs await-email-go-live) is a plan decision; the spec only fixes the constraint.
- **Secret-at-rest risk (rev 2, from review):** `notify()` commits a `CommunicationLog` row with status `QUEUED` whose `payload.html` contains the **full claim link (token)** *before* the dark email step (`shared/notify.ts:164-186`). The only thing that NULLs that payload is the email worker on a terminal transition (`queues/processors/email.ts`); the worker "need not even run while dark - nothing to deliver." So in a **dark-email production** environment the claim-link-bearing payload can persist in Postgres for the token's 7-day Redis-TTL window (the TTL is only on the Redis copy; the DB payload has no TTL and no terminaliser running). The claim token is a single-use password-set credential, so a reader of `CommunicationLog` (a DB dump, backup, or admin timeline query) during that window is an **account-takeover-at-rest** vector. **Mitigation (plan must choose one):** (a) run the email worker even while dark so rows terminalise and `payload` is NULLed (the processor already FAILs + NULLs on `skipped:true`), or (b) treat unread `merchant_claim` `CommunicationLog.payload` as sensitive-at-rest and time-box/redact it. This is also a §9 stop-and-report: do not ship *real* staff invites before the worker/terminalisation story is settled.

### 5.2 Branch-scope enforcement (D4, cross-cutting)

Apply `assertBranchAllowed` / allowed-branch intersection on every branch-specific route a non-owner can reach:

- Branch read/edit/hours/amenities/photos/PIN (`merchant/branch/routes.ts`).
- Redemptions list/lookup/CSV (`merchant/redemptions/*`) - intersect the requested `branchId` with `ctx.allowedBranchIds` (today only ANDs `branch.merchantId`).
- Validate-a-code (`redemption/verify`) - reject a code whose branch is outside the actor's allowed set.
- Any branch-specific app-user action.

Vouchers are merchant-wide -> gated by `assertCanManageVouchers`, not branch scope (matches the prototype's business-wide Manage-vouchers).

**Invariant (D4) + Specific-branches timing (Codex amendment #6):** the "Specific branches" scope option is gated on enforcement coverage, **as an in-v1 sequencing step, NOT a permanent product deferral.** The intended end-state of v1 **includes** "Specific branches." The sequencing is: an early slice may ship **all-branches members only** (no branch boundary exists yet, so nothing to enforce - safe), and "Specific branches" is then surfaced **within v1** in the same slice that completes branch-scope enforcement across every branch-specific route a non-owner can reach (the SCOPED-READ rows in §4.3). "Specific branches" becomes a *permanent* deferral **only if the owner explicitly chooses that** at plan time; absent that explicit choice, v1 ships it once coverage lands. The branch-specific routes whose coverage gates the unlock are the **single authoritative set of 7** (must match the §4.3 SCOPED rows + the line-187 net surface): `GET /merchant/branches`, `GET /merchant/branches/:id`, `GET /merchant/redemptions`, `GET /merchant/redemptions/lookup`, `GET /merchant/redemptions/export.csv`, and the two † resolver-bypassing redemption-plugin routes `POST /redemption/verify` (SCOPED-WRITE) + `GET /branch/:branchId/redemptions` (SCOPED-READ). (The branch-WRITE routes - hours/amenities/photos/PIN/edit - are `OWNER`-only in v1, so they impose no scoped-member boundary to enforce.) This set is the single source of truth; §4.3, §4.4, and line 187 all reference it.

### 5.3 App-user surface (D7) - findFirst ambiguity guard (Codex amendment #5)

- New read query: list `BranchUser`s for the merchant's branches (grouped by branch) - curated select, **no `passwordHash`**. (No list endpoint exists today.) The read returns a per-branch **count** (or the list) so the UI knows when a branch has more than one app user.
- **The ambiguity defect, confirmed:** `resetBranchUserPassword` / `deactivateBranchUser` / `reactivateBranchUser` select the target via `prisma.branchUser.findFirst({where:{branchId}})` with **no `orderBy`, no id/email selector, and no `@@unique` on `branchId`** (`branch-user.service.ts:99,139,164`; schema only `@unique` on `email`). With two+ app users at a branch these mutations act on a **non-deterministic** row. v1 must not act on the wrong user.
- **Required guard (backend, authoritative):** before any reset/deactivate/reactivate, the service counts `BranchUser` rows for the branch (`count({where:{branchId}})`, or `findMany({where:{branchId},take:2})`): `0` -> `BRANCH_USER_NOT_FOUND`; `>1` -> **refuse** with a new error (e.g. `MULTIPLE_BRANCH_USERS`) instead of mutating; `==1` -> proceed on that row's id. This is a server-side gate, not just UI.
- **Atomicity residual (rev 2, from review):** because there is no `@@unique` on `branchId`, the count + select + update run in separate statements, so a concurrent `createBranchUser` between the `count==1` read and the mutation could insert a second row. v1 accepts this **narrow** race because app-user create is **owner-only and serialized in practice** (D7); the plan should wrap count+select+update in a single `prisma.$transaction` (re-count inside the tx) to make the >1-refuse atomic, and **§9 flags it as a must-fix when multi-user-per-branch / by-id addressing lands** (the race widens then).
- **UI guard (defence-in-depth):** when the per-branch count is `>1`, the reset/deactivate/reactivate row actions are **hidden/disabled** with an explanatory note (the precise per-user action needs the deferred by-id addressing).
- **Required tests (must pin):** a branch with 2 `BranchUser` rows -> reset/deactivate/reactivate all **refuse** (`MULTIPLE_BRANCH_USERS`) and **mutate nothing** (prove no findFirst mis-targeting); a branch with exactly 1 -> the action targets that row; a branch with 0 -> `BRANCH_USER_NOT_FOUND`.
- All three actions remain scope-aware via the resolver (owner-only in v1 per §4.3; a scoped Branch manager acting on their branch's app users is deferred with the BM-write slice).
- App-user **create / edit / multi-user-per-branch / by-id addressing** are deferred (a later app-management slice). Email correlation to a portal member is display-only (D2/D6b).

---

## 6. merchant-web Staff & Access module (PR-C)

- Route `(app)/staff` + the module under `apps/merchant-web/...`; sidebar entry under LOCATIONS & TEAM (matches the prototype's IA).
- **List page:** three summary cards (People; Portal users X of 8; App users X of 20 - hardcoded caps), allowance banner when full, search when > 4, the unified person table (portal members + app users) with role/access/branches/last-active columns and the row-action menu.
- **Add/Edit drawer:** name, email, job title; Access (Portal/App); Portal role radios with Can/Cannot detail; Extra responsibilities (Manage vouchers = `canManageVouchers`; campaigns/billing coming-soon disabled); Branches (All / Specific - Specific gated on D4 coverage); Automated emails read-only informational (D9); App password reset row (edit + app user).
- **Row actions:** Edit access; Reset app password (app); Reactivate; Deactivate; Remove from team; Resend invite (not-yet-claimed); last-owner lock footnote.
- **Capability gating (v1):** Staff & Access management is **owner-only** in v1 (the prototype lets a Branch manager manage their branch's app staff; v1 keeps member management owner-only and defers branch-manager-scoped staff management). The page consults the resolver; a non-owner does not see management affordances. Backend `assertOwner` is the source of truth; UI is display only.
- **Lifecycle:** pre-live shows the owner only ("for now it is just you"); Add enabled once live. **Suspended = BLOCKED, not read-only** (Codex amendment #3 - see §6.1).
- Branch scope UI surfaces "Specific branches" within v1 once server enforcement is complete (the in-v1 sequencing gate of §5.2, not a permanent deferral).

### 6.1 Suspended behaviour - resolved to BLOCKED (Codex amendment #3)

The initial draft said the resolver keeps the SEC-M2 suspended guard **and** that suspended = "read-only"; those conflict. **Resolution: suspended merchants are BLOCKED from Staff & Access routes** (the existing, consistent live behaviour), not read-only. Verified: `resolveAdminMerchant` / `resolveMerchantContext` throw `MERCHANT_SUSPENDED` (403) (`merchant/shared.ts:89`), and that resolver is the first call in every merchant-management read and write path - so a suspended merchant cannot reach Staff & Access at all. The **only** suspended-reachable merchant-side surface is the per-person notification bell (`OWN-RECIPIENT`, no membership resolver, `notifications/routes.ts:9-12`), which exists precisely so the merchant can read the notice telling them they are suspended. The merchant-web Staff & Access page, when the merchant is suspended, therefore shows the standard suspended-account state (consistent with the rest of the portal), **not** a read-only team table. The prototype's "suspended = read-only team view" diverges from the live platform and is recorded as a **deferred** enhancement (a status-aware read-only resolver path), not v1.

---

## 7. Security invariants (must hold; pinned by tests)

1. **Never display a branch boundary the server does not enforce** (D4). "Specific branches" is gated on full enforcement coverage.
2. **Server decides authorization; client payloads are never trusted** - role, branch scope, `canManageVouchers` are validated/overridden server-side. Non-owners can never self-edit role/scope/capability.
3. **Only owners mint owners** - role-elevation guard rejects promote-to-OWNER or `canManageVouchers` grant by non-owners.
4. **Last-owner protection** - `assertNotLastOwner` on demote/remove/deactivate/self-step-down; the merchant can never reach zero active owners.
5. **Branch-scope IDOR closed** - the requested `branchId` is intersected with the caller's allowed set on every branch-specific route; cross-tenant masking/denial preserved.
6. **Invite is email-control-proven** - claim token single-use + 7-day TTL; re-invite mints a fresh token and invalidates the old; owner never knows the member's password.
7. **Email correlation is display-only, never authorization or destructive action** (D2/D6b) - removing/deactivating a portal member never auto-touches a same-email `BranchUser`.
8. **Deactivation/removal revoke sessions** - `revokeAllSessionsForEntity` + `revokeAllUserSessionRecords` on the merchant entity.
9. **No `passwordHash` ever returned** in any list/detail payload (curated selects).
10. **Multi-merchant identity rejected in v1** - an invite to an existing `MerchantAdmin` email is refused (D5b).
11. **Every staff/owner/lifecycle mutation is audited** (`AuditLog` with actor, before/after, reason where relevant).
12. **Voucher writes require `OWNER || canManageVouchers`** (§5.1.1) - pinned by the four-case test (owner allow / BM+MV allow / BM-no-MV deny / Staff deny) + the self-grant-rejection test.
13. **No ambiguous app-user mutation** (§5.3) - reset/deactivate/reactivate refuse (`MULTIPLE_BRANCH_USERS`) and mutate nothing when a branch has >1 `BranchUser`; pinned by the 2-row test. Never act on a `findFirst` arbitrary row.
14. **Suspended = blocked** (§6.1) - a `MERCHANT_SUSPENDED` (403) merchant cannot reach any Staff & Access route; only the per-person notification bell is reachable. No read-only carve-out in v1.
15. **Coordinated non-owner-login cutover** (§4.4) - non-owner login is not enabled until every route a non-owner can reach has an explicit matrix outcome; unmigrated routes deny non-owners by construction (`resolveAdminMerchant`), so the migrated set is the entire non-owner surface.
16. **Every route a merchant JWT/session can authenticate to has an explicit §4.3 matrix outcome** - scoped by *reachability*, not by the `/merchant/*` namespace (this is why the two app-root redemption-plugin † routes are in the matrix). No route is left on an implicit "any merchant admin = owner" assumption; the route-audit must grep `merchantVerify`/`authMerchant` across **all** plugins, and any new merchant-reachable route added later must be classified before it ships.

---

## 8. Deferred set (recorded, not built in v1)

- **Real identity unification** (Option B): `MerchantAdmin <-> BranchUser` link/unification, one-invite-provisions-both, atomic cross-system deactivation. Dedicated future schema/security milestone.
- **`validatedByAdminId`** + portal-validation attribution (also M3 OD6).
- **Multi-merchant identity** - one person, memberships in N merchants + a merchant-context switcher + JWT/session/`getOwnerMembership` rework.
- **Multi-owner notification fan-out** - `getMerchantOwnerContact` / admin `getMerchantOwner` use `findFirst`, so with multiple owners only one receives owner-targeted notifications. Record clearly; not a v1 blocker.
- **Full app-user CRUD** - create-from-unified-UI, multi-user-per-branch, by-id `BranchUser` addressing.
- **Editable per-member notification preferences** + the redemption-alert / monthly-report emails + "adjust in Settings" - Phase 6, with the email features and the SEC.1 atomic limiter + Resend wiring.
- **Per-merchant configurable caps** - v1 caps are hardcoded placeholders (8 portal / 20 app); raising = "contact Redeemo".
- **Manage campaigns / Manage billing** extras - coming-soon.
- **Branch-manager-scoped staff management** - in v1 member management is owner-only; the prototype's "branch manager manages their branch's app staff" is deferred.
- **Branch-manager branch-WRITE capabilities** - the prototype lets a Branch manager edit their own branch (details/hours/amenities/photos) and view/send their branch PIN. v1 takes the safe-deny path (those routes are `OWNER`-only per §4.3); BM branch-write is a later slice. (A denial is never a hole; relaxing a specific guard later is additive.)
- **Read-only-when-suspended** - the prototype shows a read-only team view while suspended; the live platform blocks suspended merchants entirely (§6.1). A status-aware read-only resolver path is deferred.
- **NOT deferred (explicit):** "Specific branches" member scope is **in v1** (gated on enforcement coverage as an in-v1 sequencing step, §5.2), unless the owner explicitly chooses to defer it at plan time. Non-owner portal login + the scoped view/validate/manage-vouchers experience are **in v1**.

---

## 9. Stop-and-report triggers (pause + surface, do not work around)

- Any requirement that needs a schema change **beyond** the single `canManageVouchers` column.
- Any need to modify the merchant JWT shape, the mobile/branch auth, or the validation FK.
- Discovery that branch-scope enforcement cannot be applied to a branch-specific route a non-owner can reach (would break the D4 invariant - then either cover it or do not surface "Specific branches").
- Any pressure to use email correlation for an authorization or destructive action.
- Any case where the one-app-user-per-branch route shape makes a selected action ambiguous and the safe fallback (display-only) is unacceptable to the design (would require the deferred by-id extension - pause).
- Any owner-lockout edge case not covered by `assertNotLastOwner`.
- **Shipping real (email-delivered) staff invites** before the `CommunicationLog.payload` worker/terminalisation + `EMAIL_ENABLED` story is settled (the secret-at-rest claim-token risk, §5.1.2).
- **Multi-user-per-branch / by-id app-user addressing landing** - the findFirst count-refuse guard's read-then-act race widens and must become transactional (§5.3).
- A merchant-JWT-reachable route discovered **outside** the `/merchant/*` namespace that is not in the §4.3 matrix (re-grep `merchantVerify`/`authMerchant` before the cutover).
- Scope creep toward identity unification, multi-merchant, attribution, or full app-user CRUD.

---

## 10. PR slicing (D10, foundation-first horizontal)

- **PR-A - authz foundation + schema (no UI, no route migrated).** New `resolveMerchantContext` (role + allowed branches + `canManageVouchers`) **alongside the unchanged owner-only `resolveAdminMerchant`** (§4.1); the `canManageVouchers` migration; reusable guards (`assertCanManageVouchers` / `assertBranchAllowed` / `assertOwner` / role-elevation; `assertNotLastOwner` reuse); the login/session resolver extension to admit non-owner sessions (§4.4), kept behind tests with non-owner login **not yet enabled**. Unit tests pin the resolver, the guards, and that no existing route changes behaviour. SHA-bound merge gate.
- **PR-B - backend behaviour + non-owner cutover (no merchant-web UI).** Membership list/invite/edit/deactivate/reactivate/remove/resend (`assertOwner`); **migrate the §4.3 non-owner routes** to `resolveMerchantContext` + guard - the voucher-write retrofit to `OWNER||canManageVouchers` (§5.1.1, four-case tests), the SCOPED-READ branch reads + redemptions reads (branch intersect), the MEMBER-READ voucher/profile reads; app-user read + reset/deactivate/reactivate with the **findFirst-ambiguity guard** (§5.3); **enable non-owner login** in this slice (coordinated cutover, §4.4); audit logs. May sub-split (e.g. B1 membership CRUD + B2 branch-scope enforcement + non-owner login + B3 app-user). Adversarial review; SHA-bound gate. "Specific branches" is surfaced once the SCOPED-READ enforcement is complete (in-v1, §5.2).
- **PR-C - merchant-web Staff & Access module.** List page, summary cards, add/edit drawer, row actions, app-user display/actions; branch-scope UI only where server enforcement is complete; owner-only management. Adversarial review; SHA-bound gate.

Each PR: fresh implementer + fresh adversarial reviewer (no self-certify), CI green, scope-guard, no merge without explicit owner approval bound to the exact head SHA. Docs (this spec + the plan) updated in-PR if behaviour shifts.

---

## 11. Honesty notes / known consequences (carried from the grill-me)

1. **v1 is not strictly no-schema** - it adds exactly one additive boolean (`canManageVouchers`). This is accepted because Staff & Access is a Tier-3 permissions milestone (D3).
2. **The unified person UI is a presentation over two backends** correlated by email - the correlation is display-only and never drives authorization or destructive action. The true single-identity model is Option B (deferred).
3. **Owner notifications reach only one owner today** (`findFirst`); multi-owner fan-out is a recorded deferred follow-up (D8), not a v1 blocker.
4. **App-user management is intentionally light** (display + reset/deactivate, one-per-branch); full app-user CRUD is a later slice (D7).
5. **Member management is owner-only in v1**; the prototype's branch-manager-scoped staff management is deferred.
