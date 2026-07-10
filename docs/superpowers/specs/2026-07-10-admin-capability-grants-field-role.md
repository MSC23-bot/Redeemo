# SPEC: Admin capability-grant authorization model + FIELD role + Team & Roles launch slice

- Status: DRAFT (Tier 3 spec; docs only, no implementation, no migration)
- Date: 2026-07-10
- Owner decisions source: memory `project_admin_recruitment_owner_decisions_2026_07_10.md` (grill-me 2026-07-10, LOCKED)
- Paired plan: `docs/superpowers/plans/2026-07-10-team-roles-implementation.md`
- Schema change: OWNER-GATED. Rides the bundled recruitment migration window (see §9).

## 1. Purpose and scope

Redeemo is recruiting field reps who create merchant leads and drive assisted onboarding on
behalf of merchants. The current admin authorization model is role-only (`AdminRole` baseline
capability sets in `src/api/admin/capability.ts`). That model cannot express "this specific rep
may approve merchants, but reps in general may not" without either minting a bespoke role per
person or over-granting a whole role. The prototype deferred this as fork D57.

This spec resolves D57 with the owner-locked model: base roles PLUS per-account capability
grants. It also introduces the `FIELD` base role for reps and the minimal Team & Roles admin
surface required to stand up rep accounts.

In scope:
- The authorization model: base role x per-account grant matrix; effective-capability
  resolution; where and how it is enforced.
- The `FIELD` base role and pre-live-scope enforcement for its on-behalf capabilities.
- The approval-grant path plus the self-approval audit model (derivation, badge, filter).
- The Team & Roles capability and the SUPER_ADMIN-gated account/grant management surface.
- Security invariants.

Out of scope (owned by sibling packets, cross-referenced only): MerchantLead pipeline,
MerchantNote, MerchantAgreementRecord/D65, email enablement (#477). This spec depends on
email enablement for rep GO-LIVE but not for build (see §8).

## 2. Current state (inspected, cited)

- `src/api/admin/capability.ts`:
  - `AdminCapability` union (`capability.ts:21-90`) and `ALL_SLICE1_CAPS`
    (`capability.ts:92-104`).
  - `ROLE_CAPABILITIES` (`capability.ts:110-115`): `OPERATIONS` holds all Slice-1 caps;
    `FINANCE`/`CONTENT`/`SUPPORT` hold none.
  - `adminHasCapability(role, cap)` (`capability.ts:117-121`): `!role -> false`;
    `SUPER_ADMIN -> true` (superuser short-circuit); else membership in the role list.
  - `requireAdminCapability(cap)` (`capability.ts:128-140`): Fastify preHandler; 403
    `ADMIN_CAPABILITY_DENIED` when `adminHasCapability(request.user?.adminRole, cap)` is false.
    Runs after `authenticateAdmin`.
- `prisma/schema.prisma`:
  - `enum AdminRole` (`schema.prisma:90-96`): `SUPER_ADMIN | OPERATIONS | FINANCE | CONTENT |
    SUPPORT`.
  - `model AdminUser` (`schema.prisma:354-369`): `id`, `email` (unique), `passwordHash`,
    `firstName`, `lastName`, `role @default(SUPPORT)`, `isActive @default(true)`, `lastLoginAt`,
    `approvals AdminApproval[]`.
  - `model AdminApproval` (`schema.prisma:1716-1746`): `adminUserId` (the admin who ACTIONED
    it), `claimedById`, `referenceId`, `referenceType`, `type ApprovalType`. Bare ids, no FK on
    `claimedById` (kept additive).
  - `model AuditLog` (`schema.prisma:327-348`): `entityId`, `entityType`, `event`, `actorId`,
    `actorType ActorType`, `before`, `after`, `reason`, `metadata`. Indexed on
    `[entityId, entityType]`, `event`, `actorId`.
- Draft-creator audit row (self-approval derivation source): `createMerchantDraft` writes an
  AuditLog row `event: 'MERCHANT_DRAFT_CREATED'`, `entityId: merchant.id`,
  `entityType: 'merchant'`, `actorId: adminId`, `actorType: 'ADMIN'`
  (`src/api/admin/merchants/service.ts:582-591`). This is the durable link from a merchant to
  the admin who created its draft. No schema is needed to derive self-approval.
- Admin JWT claims: signed as `{ sub, role: 'admin', adminRole, sessionId }` at login
  (`src/api/auth/admin/service.ts:165-168`) and refresh (`service.ts:229-232`). The token
  carries `adminRole` only, no capability list today. Access-token TTL is `15m`
  (`service.ts:17`).
- H4 refresh freshness: `refreshAdminToken` re-fetches the `AdminUser` and denies +
  revokes all sessions if `!admin.isActive` (`service.ts:200-214`), then re-signs with the
  fresh `admin.role` (`service.ts:229-232`). So role is already re-read every refresh cycle
  (<= 15m).
- Admin-web capability mirror: `apps/admin-web/lib/auth/session.ts` is a self-contained copy of
  the backend union + `ROLE_CAPABILITIES` + `hasCapability` (`session.ts:23-122`). The role is
  decoded fresh from the access token's claims via `decodeAdminJwt` (`session.ts:215-236`);
  `adminRole` is the only capability-relevant claim decoded. The mirror is UI gating only;
  backend `requireAdminCapability` is the real enforcement point (per `.claude/rules/admin-web.md`).
- `request.user.adminRole` is populated by `request.adminVerify()` (fastify-jwt) in the
  `authenticateAdmin` decorator (`src/api/auth/admin/plugin.ts:14-22`); it is exactly the JWT
  `adminRole` claim.

## 3. Authorization model: base role x per-account grant

### 3.1 Data model (NEW table)

`AdminCapabilityGrant` (schema-gated, OWNER-GATED migration):

| Field | Type | Notes |
|---|---|---|
| `id` | String @id | uuid |
| `adminUserId` | String | grantee AdminUser id (FK) |
| `capability` | String | one `AdminCapability` value (stored as string; not a DB enum, so new caps need no migration, matching the existing string-union convention) |
| `grantedById` | String | SUPER_ADMIN who granted (bare id, no FK, matching `AdminApproval.claimedById`) |
| `grantedAt` | DateTime @default(now()) | |
| `revokedAt` | DateTime? | null = active; set = revoked (never hard-delete: audit trail) |
| `revokedById` | String? | who revoked |

Indexes: `[adminUserId, revokedAt]` (active-grant lookup by grantee); `[capability]`.
A grant is ACTIVE iff `revokedAt IS NULL`. Revocation is a soft update (`revokedAt = now()`),
never a delete, so the grant history is auditable. Re-granting after revoke inserts a new row.

`enum AdminRole` gains `FIELD` (same migration).

No other schema changes. Self-approval derivation, badge, and filter are all schema-free
(see §5).

### 3.2 Effective-capability resolution

Effective capabilities for an admin = role baseline UNION active (non-revoked) grants.
`SUPER_ADMIN` short-circuits to "all capabilities" unchanged (never consults the grant table;
never needs a grant).

Formally, for a non-SUPER_ADMIN admin:
```
effectiveCaps(admin) = ROLE_CAPABILITIES[admin.role]
                       UNION { g.capability | g in grants(admin.id) where g.revokedAt is null }
```
`SUPER_ADMIN` returns true for every cap without evaluating the set.

### 3.3 WHERE enforced, and the freshness design (KEY DECISION)

`requireAdminCapability` must consult grants, not just role. The open design question is HOW
effective caps reach the preHandler given the synchronous, per-request check and the 15m
access-token TTL.

Two options were evaluated:

- Option A: EMBED effective caps in the JWT. At token sign time (login + every refresh),
  compute `effectiveCaps(admin)` (role baseline plus active grants read once) and add a `caps`
  claim (array of `AdminCapability` strings; omit for `SUPER_ADMIN`, which short-circuits).
  `requireAdminCapability` checks membership in the token's `caps` claim (SUPER_ADMIN
  short-circuit preserved from the `adminRole` claim). Grants/revokes take effect at the next
  refresh, i.e. within one access-token lifetime (<= 15m).
- Option B: PER-REQUEST grant lookup. `requireAdminCapability` reads active grants for
  `request.user.sub` on each gated request (DB, or a short-TTL Redis cache keyed by admin id).
  Revoke is near-immediate. Adds a lookup to every capability-gated admin request.

RECOMMENDATION: Option A (embed effective caps in the JWT).

Rationale:
1. It mirrors the existing, proven pattern: `adminRole` already rides the token and
   `requireAdminCapability` already reads it synchronously off `request.user`. Adding a `caps`
   claim is the minimal, same-shape extension; the admin-web mirror already decodes claims from
   the token (`decodeAdminJwt`) and can decode `caps` the same way.
2. The owner-locked invariant is "revoked grants take effect within one token lifetime." That
   is EXACTLY the 15m access-token TTL under Option A. The bound is owner-accepted by
   construction; no stronger immediacy was required.
3. H4 already re-fetches the AdminUser on every refresh (`service.ts:200`). Computing effective
   caps at sign time reuses that fetch plus one grant-table read every <= 15m per active
   session; there is zero added per-request DB load.
4. Deactivation already nukes everything within one TTL via H4 (isActive re-check +
   session revoke); grants inherit the same freshness ceiling for free.

Tradeoff accepted: a freshly granted OR revoked capability is stale for up to the remaining
access-token TTL (<= 15m) until the next refresh re-mints the token. For the launch curated set
(only `approval:action`), a <= 15m window before a granted approval power activates, or before a
revoked one is fully gone, is operationally acceptable and matches the owner invariant verbatim.

Escape hatch for immediate revoke (no schema, no per-request cost): revoking a sensitive grant
MAY additionally call the existing `revokeAllSessionsForEntity` + `revokeAllUserSessionRecords`
path (already used by H4 at `service.ts:208-212`), forcing the grantee to re-auth and re-mint a
token without the cap. This upper-bounds staleness at the same <= 15m but lets an operator cut it
to "next request" on demand. Flagged for owner (§7) in case immediate sub-TTL revoke is a hard
requirement, which would tip the decision toward Option B or a hybrid.

Enforcement points unchanged in shape:
- Backend: `requireAdminCapability(cap)` is the sole real gate (defence in depth). Under
  Option A it changes from `adminHasCapability(role, cap)` to a check that consults both the
  `adminRole` claim (SUPER_ADMIN short-circuit) and the `caps` claim. A new
  `adminHasEffectiveCapability(role, caps, cap)` helper encapsulates this so call sites stay
  one-liners.
- Admin-web mirror: gate UI on the decoded `caps` claim plus the SUPER_ADMIN short-circuit.
  UI gating only; the backend 403 remains authoritative (`.claude/rules/admin-web.md`
  two-layer rule).

## 4. FIELD base role

### 4.1 Baseline capabilities

`ROLE_CAPABILITIES.FIELD` (owner-locked):
- `lead:manage` — NEW capability (sibling MerchantLead packet owns the routes; declared here as
  the FIELD baseline anchor). Create/update/progress leads.
- `merchant:create-draft` — start an assisted onboarding from a converted lead.
- `merchant:read` — read the merchants directory / a merchant detail they are onboarding.
- The assisted-wizard on-behalf capabilities, SCOPED TO PRE-LIVE MERCHANTS ONLY:
  `merchant:edit`, `merchant:submit`, `merchant:manage-vouchers` (the RMV co-build /
  onboarding-completion helpers). See §4.2 for scope enforcement.

FIELD does NOT hold `approval:action` in the baseline. NO approval capability is in the FIELD
baseline. Approval is grant-only (§5). FIELD also does NOT hold the higher-bar
SUPER_ADMIN-only on-behalf caps (`merchant:edit-identity`, `merchant:edit-category`,
`merchant:manage-branches`, `merchant:manage-documents`, `merchant:propose-edit`), nor
`merchant:suspend`, `redemption:read`, `approval:read`, or `approval:apply-edit`.

RECOMMENDATION (flagged §7): FIELD does NOT get `redemption:read`. A rep has no operational
need to view cross-merchant redemptions; withholding it keeps the rep surface to lead capture
plus pre-live onboarding.

### 4.2 Pre-live scope enforcement (server-side)

"Pre-live" = the merchant has not yet gone live. Concretely `Merchant.status IN {REGISTERED,
PENDING_APPROVAL}` and NOT `{ACTIVE, INACTIVE, SUSPENDED, DELETED}`. This is the same
lifecycle the on-behalf routes already read: `createMerchantDraft` seeds `status: REGISTERED`
(`service.ts:552`); the submittable-on-behalf gate already keys on `REGISTERED` /
`PENDING_APPROVAL+NEEDS_CHANGES` (`service.ts:266-271`).

Scope is enforced SERVER-SIDE, not by capability alone, because a capability grant is
role-wide and cannot itself encode "only pre-live". Design:
- A shared preHandler/guard `requirePreLiveMerchant` (or an in-service assertion) that, for a
  FIELD actor, loads the target merchant's `status` and 403s (`MERCHANT_NOT_PRE_LIVE`) when the
  merchant is not in the pre-live set. It runs AFTER `requireAdminCapability` on the on-behalf
  routes.
- Non-FIELD holders of the same caps (OPERATIONS, SUPER_ADMIN) are NOT scope-restricted: the
  guard checks the actor's role and only clamps FIELD. This keeps OPERATIONS' existing
  post-live edit powers intact.
- Rationale for role-conditional clamp rather than a separate capability: the owner locked
  "wizard on-behalf caps scoped to pre-live merchants only" as a property of the FIELD ROLE,
  not a new capability. Encoding it as a scope guard keyed on role avoids forking every
  on-behalf cap into pre-live and any-state variants.

Enforcement is defence-in-depth: the admin-web wizard already hides post-live edit affordances,
but the server guard is the real gate.

## 5. Approval grant + self-approval audit

### 5.1 Granting approval

SUPER_ADMIN may GRANT `approval:action` to a specific admin (typically a FIELD rep) via the
Team & Roles surface (§6). A granted `approval:action` applies to ANY merchant (not own-only).
There is deliberately NO approve-own-only capability: the owner rejected building a scoped
approve-own variant. Self-approval is ALLOWED when granted, but VISIBLY AUDITED.

### 5.2 Self-approval derivation (SCHEMA-FREE)

A merchant approval is "self-approved" when the admin who ACTIONS the go-live (the
`AdminApproval.adminUserId` set at approve time) is the SAME admin who created the merchant's
draft. The draft-creator is read from the durable `MERCHANT_DRAFT_CREATED` AuditLog row:
`actorId` where `entityId = merchant.id AND event = 'MERCHANT_DRAFT_CREATED'`
(`service.ts:582-591`). No schema, no new column.

At approve time (or when rendering history), derive:
```
selfOnboarded = (approval.adminUserId === draftCreatorActorId(merchant.id))
```
where `draftCreatorActorId` reads the latest `MERCHANT_DRAFT_CREATED` AuditLog `actorId` for
the merchant. Stamp the derived flag into the approval action's AuditLog `metadata` as
`{ selfOnboarded: true }` on the go-live audit row so it is durable and filterable without a
recompute. (The stamp is metadata on an EXISTING audit write, not a schema change.)

Edge cases:
- Draft created by admin A, approved by admin B: `selfOnboarded = false`.
- Merchant self-registered (no admin draft-creator row, e.g. inbound self-serve): no
  `MERCHANT_DRAFT_CREATED` actor to match, so `selfOnboarded = false` (an admin approving a
  self-serve merchant is not self-onboarding).
- Draft creator later deactivated: derivation still works (audit `actorId` is durable; admins
  are not hard-deleted).

### 5.3 Self-approved badge + filter

- Badge: a "Self-approved" badge renders in the approval queue History view and the merchant
  timeline wherever a go-live approval row is shown, driven by the `metadata.selfOnboarded`
  stamp (falls back to live derivation for pre-stamp rows).
- Filter: SUPER_ADMIN gets a queue History filter "Self-approved only" that narrows to approval
  rows with `metadata.selfOnboarded = true`. Available to SUPER_ADMIN (oversight surface);
  MAY also be visible to any holder of `approval:read` (flagged §7 as a minor UX call).

The badge is copy-locked to "Self-approved" (no emoji, no em-dash; brand-neutral admin styling).

## 6. Team & Roles capability + management surface

### 6.1 New capability

NEW capability `admin:manage-team`. Gates the entire Team & Roles surface: create an admin
account, set its base role, toggle the curated grantable set, and deactivate an account. It is
NOT added to `ALL_SLICE1_CAPS` and NOT in any non-SUPER_ADMIN role baseline, so under the
existing superuser short-circuit it is held ONLY by SUPER_ADMIN. (Same pattern as
`merchant:edit-identity` etc., which are SUPER_ADMIN-only by omission from `ALL_SLICE1_CAPS`.)

Naming: `admin:manage-team` chosen over `admin:manage-accounts` to cover both account
lifecycle and role/grant management under one gate for the launch slice.

### 6.2 Launch-slice management operations (all `admin:manage-team`-gated)

1. Create an admin account: email, first/last name, base role. Password bootstrap follows the
   existing admin auth pattern (owner-executed / claim flow); rep LOGIN needs email (§8).
2. Set base role: assign one `AdminRole` (including `FIELD`).
3. Toggle the curated grantable set: at launch, exactly one grantable capability,
   `approval:action`. Granting inserts an `AdminCapabilityGrant`; revoking sets `revokedAt`.
   The grantable set is a server-defined allow-list (`GRANTABLE_CAPABILITIES`), NOT free-form:
   an operator cannot grant an arbitrary capability, only ones on the curated list. Launch list
   = `['approval:action']`. This bounds the blast radius and prevents privilege-escalation via
   grant of, e.g., `admin:manage-team` itself (see §7 invariants).
4. Deactivate an account: set `AdminUser.isActive = false`. H4 then strips all access within one
   TTL (session revoke + refresh denial). Grants on a deactivated account are moot (effective
   caps are only ever computed for an active, refreshing session).

Launch default: reps are UNGRANTED. A FIELD account holds only its baseline until SUPER_ADMIN
grants `approval:action`.

Every create / role-set / grant / revoke / deactivate writes an AuditLog row (`actorId` = the
SUPER_ADMIN, `entityType: 'admin'`, `entityId` = target admin, `before`/`after`), matching the
existing admin-action audit convention.

## 7. Security invariants

1. A grant cannot escalate beyond SUPER_ADMIN. The grantable set is a curated server-side
   allow-list (`GRANTABLE_CAPABILITIES`); `admin:manage-team` is NOT on it, so no grant can
   confer team-management (which would let a grantee grant themselves anything). SUPER_ADMIN
   remains the only account that can manage the team, and it is assigned by role, never by
   grant.
2. Revoked grants take effect within one token lifetime (<= 15m). Under Option A this is the
   access-token TTL; the optional session-revoke escape hatch (§3.3) can force it to next
   request for sensitive revokes.
3. FIELD cannot self-grant. `admin:manage-team` is SUPER_ADMIN-only; FIELD holds no
   grant-management capability. A FIELD rep cannot create accounts, set roles, or grant/revoke.
4. Grant and revoke are fully audited: who granted/revoked, to whom, which capability, when
   (both the `AdminCapabilityGrant` row's own fields and a paired AuditLog row).
5. A deactivated admin loses everything via H4: `isActive = false` denies refresh and revokes
   all sessions (`service.ts:200-214`); the current access token expires within its TTL. Grants
   do not survive deactivation because effective caps are only minted for active sessions.
6. SUPER_ADMIN short-circuit is unchanged and never depends on the grant table.
7. Self-approval is never blocked when granted, but is always derivable and stamped
   (`metadata.selfOnboarded`), badged, and filterable, so oversight is preserved without a
   separation-of-duties hard block (owner-locked choice).
8. Two-layer gating preserved: admin-web mirror gates UI on the `caps` claim; backend
   `requireAdminCapability` (now grant-aware) is the authoritative 403. Never rely on one layer.
9. Pre-live scope for FIELD on-behalf caps is enforced server-side
   (`requirePreLiveMerchant`), not by capability shape or UI alone.

## 8. Email dependency and go-live ordering

FIELD reps LOG IN via email OTP (admin auth is HMAC email OTP). Transactional production email
MUST be enabled before live rep accounts (owner-locked; plan #477; no db-read workaround, no
TOTP in scope). Therefore:
- Team & Roles plus the capability-grant model can be BUILT and REVIEWED now (this spec + plan).
- Rep accounts go LIVE only after email enablement (#477 shipped + `EMAIL_ENABLED` owner-gated
  on). SUPER_ADMIN can create FIELD accounts before then, but those accounts cannot receive
  login OTPs until email is on.

This ordering is stated in the plan (§S-order) and is a hard gate on rep go-live, not on build.

## 9. Schema change (OWNER-GATED) and migration bundling

Schema delta:
- NEW `model AdminCapabilityGrant` (§3.1).
- `enum AdminRole` add `FIELD`.

Both are OWNER-GATED and ride the ONE coordinated recruitment migration window alongside the
three sibling packets (owner-locked, Q6b): `MerchantLead` (+ `MerchantSource` + anonymise),
`MerchantNote`, and `MerchantAgreementRecord` (D65). Each packet remains its own reviewed
PR/slice; only the STAGING migration application is bundled. Production migration is a separate
future owner decision (prod is ~5+ migrations behind).

No migration is written or applied by this work. The plan's schema-gated slices are marked and
sequenced so that code lands review-ready and the migration applies in the bundled window.

## 10. Open forks / flags

See the plan's FLAGS FOR OWNER section. The one design fork this spec could not fully close is
the immediacy-of-revoke requirement (Option A <= 15m vs Option B immediate), recommended as
Option A with an escape hatch but flagged in case the owner requires sub-TTL revoke for
`approval:action`.
