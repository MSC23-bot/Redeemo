# Merchant Portal - Staff & Access (v1) - Design Spec

**Status:** Draft (for owner review before the implementation plan)
**Tier:** 3 (new merchant-side authorization architecture + the first non-owner roles + one additive schema column), plan-first, owner-gated per PR.
**Date:** 2026-06-22
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
| Lifecycle gating: pre-live = owner-only row + "for now it is just you"; live = full team + Add; suspended = read-only | BUILD (PR-C). Pre-live the owner is the only member anyway; Add enabled once live |
| View-as Owner/Branch manager/Staff lens (prototype-only nav/capability preview); Staff cannot see Staff & access | The lens is a prototype demo control (not shipped). The **capability/nav gating it previews IS shipped** via the central resolver: who can reach/act on Staff & Access follows role (v1: owner-managed; see section 6) |
| "Grant manage vouchers" preview toggle | Realized as the `canManageVouchers` grant in the Edit drawer (owner-only) |

---

## 3. Minimal-schema proof

**Exactly one additive schema change.** Everything else reuses existing models, enums, routes, and helpers.

- **The one change:** `MerchantMembership.canManageVouchers Boolean @default(false)` (D3). Additive, default-false, **no backfill** (existing OWNER rows read `false`; owners get voucher power by role, not by this flag), one migration in PR-A.
- **No schema for:** roles (enum exists), branch scope (`MerchantMembershipBranch` exists), member status lifecycle (`UserStatus` has INACTIVE/DELETED), invite (claim-token flow + nullable `passwordHash` + `emailVerified` exist), `invitedById` (field exists, no-FK), app-user management (`BranchUser` + routes exist), audit (`AuditLog` exists), session revocation (helpers exist), last-owner protection (`assertNotLastOwner` exists), email preferences (hardcoded defaults; deferred).
- **Explicitly NOT added in v1:** any `MerchantAdmin <-> BranchUser` link/FK (D2 deferred), `validatedByAdminId` (deferred), any capability table/array (D3 rejected), any per-member notification-preference field (D9 deferred), any per-merchant caps column (caps hardcoded), any invite/pending status enum value (D6 uses `passwordHash==null`).

---

## 4. Authorization architecture (PR-A foundation)

### 4.1 Central merchant authz resolver

Extend `resolveAdminMerchant` (or add a sibling `resolveMerchantContext`) to resolve **any ACTIVE membership** (not just OWNER) and return:

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

- Keeps the existing SEC-M2 suspended-merchant guard.
- **Additive:** existing owner-only call sites can continue to read `{ adminId, merchantId }`; the richer fields are opt-in. PR-A must not change behaviour of any existing route - it only makes the context available.
- The merchant JWT is unchanged (`{ sub, role:'merchant', ... }`); role/scope/capability are resolved per-request from the membership, mirroring how `merchantId` is resolved today (not placed in the token).

### 4.2 Reusable guards (PR-A)

- `assertNotLastOwner` (exists) - called by demote/remove/deactivate/self-step-down.
- `assertCanManageVouchers(ctx)` - `ctx.role==='OWNER' || ctx.canManageVouchers`.
- `assertBranchAllowed(ctx, branchId)` - `ctx.allBranches || ctx.allowedBranchIds.includes(branchId)`; never trusts a client `branchId` alone (intersect).
- `assertOwner(ctx)` - owner-only mutations (mint/promote owners, manage memberships in v1).
- Role-elevation guard: only an OWNER may set a target role to OWNER or grant `canManageVouchers`; non-owners may never set their own role/scope/capability (server ignores client-supplied values on self).

PR-A ships the resolver + guards + the migration + unit tests, **no route uses the new enforcement yet** (no behaviour change, no UI) so the foundation is reviewed in isolation.

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

### 5.2 Branch-scope enforcement (D4, cross-cutting)

Apply `assertBranchAllowed` / allowed-branch intersection on every branch-specific route a non-owner can reach:

- Branch read/edit/hours/amenities/photos/PIN (`merchant/branch/routes.ts`).
- Redemptions list/lookup/CSV (`merchant/redemptions/*`) - intersect the requested `branchId` with `ctx.allowedBranchIds` (today only ANDs `branch.merchantId`).
- Validate-a-code (`redemption/verify`) - reject a code whose branch is outside the actor's allowed set.
- Any branch-specific app-user action.

Vouchers are merchant-wide -> gated by `assertCanManageVouchers`, not branch scope (matches the prototype's business-wide Manage-vouchers).

**Invariant (D4):** the "Specific branches" option is not surfaced in the UI until this enforcement covers every branch-specific route a non-owner can reach. v1 may ship all-branches members first (nothing to enforce), then unlock "Specific branches" in the same slice that completes coverage.

### 5.3 App-user surface (D7)

- New read query: list `BranchUser`s for the merchant's branches (grouped by branch) - curated select, no `passwordHash`. (No list endpoint exists today.)
- Reuse existing routes for **reset app password / deactivate / reactivate**, made scope-aware via the resolver (a scoped Branch manager may act only on their branches' app users, owners on all). Because the existing routes are one-app-user-per-branch (`findFirst` by `branchId`), v1 accepts that shape; if a branch has multiple app users, the per-user action is **display-only** rather than acting ambiguously.
- App-user **create / edit / multi-user-per-branch / by-id addressing** are deferred (a later app-management slice). Email correlation to a portal member is display-only (D2/D6b).

---

## 6. merchant-web Staff & Access module (PR-C)

- Route `(app)/staff` + the module under `apps/merchant-web/...`; sidebar entry under LOCATIONS & TEAM (matches the prototype's IA).
- **List page:** three summary cards (People; Portal users X of 8; App users X of 20 - hardcoded caps), allowance banner when full, search when > 4, the unified person table (portal members + app users) with role/access/branches/last-active columns and the row-action menu.
- **Add/Edit drawer:** name, email, job title; Access (Portal/App); Portal role radios with Can/Cannot detail; Extra responsibilities (Manage vouchers = `canManageVouchers`; campaigns/billing coming-soon disabled); Branches (All / Specific - Specific gated on D4 coverage); Automated emails read-only informational (D9); App password reset row (edit + app user).
- **Row actions:** Edit access; Reset app password (app); Reactivate; Deactivate; Remove from team; Resend invite (not-yet-claimed); last-owner lock footnote.
- **Capability gating (v1):** Staff & Access management is **owner-only** in v1 (the prototype lets a Branch manager manage their branch's app staff; v1 keeps member management owner-only and defers branch-manager-scoped staff management). The page consults the resolver; a non-owner does not see management affordances. Backend `assertOwner` is the source of truth; UI is display only.
- **Lifecycle:** pre-live shows the owner only ("for now it is just you"); Add enabled once live; suspended = read-only.
- Branch scope UI surfaces "Specific branches" only where server enforcement is complete.

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

---

## 9. Stop-and-report triggers (pause + surface, do not work around)

- Any requirement that needs a schema change **beyond** the single `canManageVouchers` column.
- Any need to modify the merchant JWT shape, the mobile/branch auth, or the validation FK.
- Discovery that branch-scope enforcement cannot be applied to a branch-specific route a non-owner can reach (would break the D4 invariant - then either cover it or do not surface "Specific branches").
- Any pressure to use email correlation for an authorization or destructive action.
- Any case where the one-app-user-per-branch route shape makes a selected action ambiguous and the safe fallback (display-only) is unacceptable to the design (would require the deferred by-id extension - pause).
- Any owner-lockout edge case not covered by `assertNotLastOwner`.
- Scope creep toward identity unification, multi-merchant, attribution, or full app-user CRUD.

---

## 10. PR slicing (D10, foundation-first horizontal)

- **PR-A - authz foundation + schema (no UI).** Central resolver extension (role + allowed branches + `canManageVouchers`, additive); the `canManageVouchers` migration; reusable guards (`assertCanManageVouchers` / `assertBranchAllowed` / `assertOwner` / role-elevation; `assertNotLastOwner` reuse). Unit tests pin the resolver + guards + the no-behaviour-change of existing routes. SHA-bound merge gate.
- **PR-B - backend behaviour (no merchant-web UI).** Membership list/invite/edit/deactivate/reactivate/remove/resend; branch-scope enforcement across branch-specific routes; app-user read + reset/deactivate/reactivate (scope-aware); audit logs. May sub-split (e.g. B1 portal CRUD + B2 branch-scope enforcement + B3 app-user). Adversarial review; SHA-bound gate. "Specific branches" remains un-surfaced until enforcement coverage is complete.
- **PR-C - merchant-web Staff & Access module.** List page, summary cards, add/edit drawer, row actions, app-user display/actions; branch-scope UI only where server enforcement is complete; owner-only management. Adversarial review; SHA-bound gate.

Each PR: fresh implementer + fresh adversarial reviewer (no self-certify), CI green, scope-guard, no merge without explicit owner approval bound to the exact head SHA. Docs (this spec + the plan) updated in-PR if behaviour shifts.

---

## 11. Honesty notes / known consequences (carried from the grill-me)

1. **v1 is not strictly no-schema** - it adds exactly one additive boolean (`canManageVouchers`). This is accepted because Staff & Access is a Tier-3 permissions milestone (D3).
2. **The unified person UI is a presentation over two backends** correlated by email - the correlation is display-only and never drives authorization or destructive action. The true single-identity model is Option B (deferred).
3. **Owner notifications reach only one owner today** (`findFirst`); multi-owner fan-out is a recorded deferred follow-up (D8), not a v1 blocker.
4. **App-user management is intentionally light** (display + reset/deactivate, one-per-branch); full app-user CRUD is a later slice (D7).
5. **Member management is owner-only in v1**; the prototype's branch-manager-scoped staff management is deferred.
