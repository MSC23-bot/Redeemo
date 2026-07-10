# PLAN: Team & Roles + capability-grant model + FIELD role

- Status: DRAFT (Tier 3 plan; docs only, no implementation, no migration in this PR)
- Date: 2026-07-10
- Paired spec: `docs/superpowers/specs/2026-07-10-admin-capability-grants-field-role.md`
- Owner decisions: memory `project_admin_recruitment_owner_decisions_2026_07_10.md` (LOCKED)
- Schema change: OWNER-GATED, bundled recruitment migration window (spec §9)

## Slice order and dependencies

```
S1 backend capability-grant model + effective-cap resolution + grant/revoke routes + audit
   |                                     (schema-gated: AdminCapabilityGrant + FIELD enum)
   v
S2 Team & Roles admin-web screen (create account, set role, toggle grants, deactivate)
   |
   v
S3 FIELD role baseline + pre-live scope enforcement on on-behalf routes
   |
   v
S4 self-approval audit: metadata stamp + badge + SUPER_ADMIN filter
```

S1 is the foundation (everything depends on effective-cap resolution). S2 depends on S1's
routes. S3 depends on S1's `FIELD` enum + effective-cap resolution. S4 is independent of
S2/S3 and can land in parallel after S1 (it only needs the approval action path, which already
exists). Rep GO-LIVE is gated on email enablement (#477); see S-order note at the end.

Each slice below states: schema-free vs schema-needing, capability gates, tests, and an Opus
adversarial-review checkpoint. Tier 3, so pause at each slice boundary for review.

---

## S1: Backend capability-grant model + effective-cap resolution

Schema: SCHEMA-NEEDING (rides the bundled OWNER-GATED window).
- NEW `model AdminCapabilityGrant` (spec §3.1): `id`, `adminUserId` (FK), `capability`
  (string), `grantedById`, `grantedAt`, `revokedAt?`, `revokedById?`; indexes
  `[adminUserId, revokedAt]`, `[capability]`.
- `enum AdminRole` add `FIELD`.
- Migration is NOT applied in this work; code lands review-ready.

Code (schema-free once the migration exists / against the generated client):
- Add `lead:manage`, `admin:manage-team` to the `AdminCapability` union in
  `src/api/admin/capability.ts` (and the admin-web mirror `session.ts`, kept aligned).
- `GRANTABLE_CAPABILITIES` allow-list constant = `['approval:action']` (launch curated set).
- Effective-cap resolution (spec §3.2, §3.3 Option A):
  - `computeEffectiveCaps(role, activeGrants): AdminCapability[]` = role baseline UNION active
    grant capabilities; SUPER_ADMIN handled by short-circuit (no `caps` needed).
  - Embed `caps` claim in the admin JWT at sign time: modify `loginAdmin`
    (`src/api/auth/admin/service.ts:165-168`) and `refreshAdminToken` (`service.ts:229-232`)
    to read active grants for the admin and add `caps` to the signed payload. Reuse H4's
    existing `admin` re-fetch in refresh (`service.ts:200`) so no extra AdminUser query.
  - `adminHasEffectiveCapability(role, caps, cap)`: SUPER_ADMIN short-circuit; else membership
    in `caps`. `requireAdminCapability` switches to consult `request.user.adminRole` +
    `request.user.caps`.
- Grant/revoke service + routes (all `admin:manage-team`-gated; see S2 for the UI):
  - `POST /admin/team/:adminId/grants` (grant a capability from `GRANTABLE_CAPABILITIES`).
  - `DELETE /admin/team/:adminId/grants/:capability` (soft-revoke: set `revokedAt`).
  - Reject any capability not in `GRANTABLE_CAPABILITIES` (400).
  - Optional sensitive-revoke escape hatch (spec §3.3): call
    `revokeAllSessionsForEntity` + `revokeAllUserSessionRecords` on revoke to force <= 15m ->
    next-request. Gate behind a flag if immediacy is owner-required (see FLAGS).
  - Every grant/revoke writes an AuditLog row (`actorId` = SUPER_ADMIN, `entityType: 'admin'`,
    `entityId` = grantee, `before`/`after`, capability).

Capability gates: grant/revoke routes gated on `admin:manage-team` (SUPER_ADMIN-only by
omission from `ALL_SLICE1_CAPS`, per the superuser short-circuit).

Tests (authz matrix pins + grant behaviour):
- Matrix pin: `computeEffectiveCaps` for each base role (SUPER_ADMIN all; OPERATIONS =
  ALL_SLICE1_CAPS; FINANCE/CONTENT/SUPPORT empty; FIELD baseline set) with and without an
  active `approval:action` grant.
- Grant appears in effective caps; revoke removes it; a second (re-)grant after revoke works.
- Revoked (revokedAt set) grant is NOT in effective caps.
- Self-grant-denied: a non-SUPER_ADMIN (incl. FIELD) calling grant/revoke gets 403.
- Cannot grant a capability outside `GRANTABLE_CAPABILITIES` (e.g. `admin:manage-team`,
  `merchant:suspend`) -> 400/denied.
- Revoke-takes-effect: after revoke, a token minted post-revoke lacks the cap; a token minted
  pre-revoke still carries it until refresh (documents the <= 15m bound); with the escape hatch
  enabled, session revoke forces re-auth.
- JWT carries `caps`; `requireAdminCapability` honours it; SUPER_ADMIN short-circuit still
  passes with no `caps` claim.

Opus adversarial-review checkpoint: focus on privilege-escalation via grant (allow-list
bypass, capability string spoofing), the token-staleness window semantics vs the owner
invariant, and that the SUPER_ADMIN short-circuit is never routed through the grant table.

---

## S2: Team & Roles admin-web screen

Schema: SCHEMA-FREE (consumes S1 routes; UI + mirror only).

Code:
- New Team & Roles page under `apps/admin-web/app/(app)/...`, gated on the mirror
  `hasCapability(role, 'admin:manage-team')` (SUPER_ADMIN-only in practice). Two-layer:
  UI hides for non-holders; backend 403 is authoritative.
- Extend the admin-web capability mirror (`lib/auth/session.ts`) to decode the new `caps` claim
  from the token (alongside `adminRole`) and expose effective-cap checks; add `lead:manage`,
  `admin:manage-team` to the union to stay aligned with the backend.
- Screen operations (spec §6.2): create account (email, name, base role incl. FIELD); set base
  role; toggle grantable set (launch = single `approval:action` switch per account); deactivate
  account. Curated grant toggles are driven by a `GRANTABLE_CAPABILITIES` mirror constant.
- Neutral admin styling (no brand fonts, per `.claude/rules/admin-web.md`); copy locked (no
  emoji, no em-dash).

Capability gates: page + all mutations gated on `admin:manage-team`; grant toggle only exposes
the curated set.

Tests:
- Mirror: `hasCapability` honours the `caps` claim (granted `approval:action` -> true for a
  FIELD account view); SUPER_ADMIN short-circuit; no-role -> false.
- Non-SUPER_ADMIN cannot see the Team & Roles nav/page (mirror gate) AND the backend 403 is
  the real gate (do not rely on UI alone).
- Grant toggle only renders curated caps; deactivate flips `isActive` and the account can no
  longer refresh (integration-level, or asserted via the S1 route contract).
- `next build` verification (catches Next 15 route/type errors tsc/lint/jest miss; per memory
  `feedback_admin_web_next_build_verification`).

Opus adversarial-review checkpoint: verify the UI never fires a mutation a non-SUPER_ADMIN
lacks the capability for, that the grant toggle cannot be coerced into granting a non-curated
capability, and that deactivate has no client-only bypass.

---

## S3: FIELD role baseline + pre-live scope enforcement

Schema: SCHEMA-FREE (the `FIELD` enum value lands in S1's migration; this slice is baseline
config + a scope guard).

Code:
- Add `FIELD` to `ROLE_CAPABILITIES` (backend `capability.ts` + admin-web mirror) with the
  baseline: `lead:manage`, `merchant:create-draft`, `merchant:read`, `merchant:edit`,
  `merchant:submit`, `merchant:manage-vouchers`. NO approval capability. NO redemption:read
  (recommended; see FLAGS).
- `requirePreLiveMerchant` guard (spec §4.2): for a FIELD actor, load the target merchant's
  `status` and 403 (`MERCHANT_NOT_PRE_LIVE`) unless `status IN {REGISTERED, PENDING_APPROVAL}`.
  Runs AFTER `requireAdminCapability` on the on-behalf routes (`merchant:edit`,
  `merchant:submit`, `merchant:manage-vouchers`). Role-conditional: only clamps FIELD;
  OPERATIONS/SUPER_ADMIN unaffected (preserves their post-live edit powers).
- Wire the guard onto the existing on-behalf routes in `src/api/admin/merchants/routes.ts`.

Capability gates: FIELD baseline caps as above; pre-live scope enforced by the guard, not by a
new capability.

Tests (authz matrix pins + scope):
- FIELD matrix pin: holds exactly the baseline set; does NOT hold `approval:action`,
  `merchant:suspend`, `redemption:read`, `approval:read`, or any SUPER_ADMIN-only on-behalf cap.
- Pre-live scope: FIELD may `merchant:edit` / `submit` / `manage-vouchers` on a REGISTERED and a
  PENDING_APPROVAL merchant; is 403'd (`MERCHANT_NOT_PRE_LIVE`) on ACTIVE, INACTIVE, SUSPENDED,
  DELETED.
- Role-conditional clamp: OPERATIONS is NOT scope-restricted on the same route/merchant.
- FIELD with a granted `approval:action` (from S1) can action approvals (grant overrides the
  baseline gap), proving grant UNION baseline resolution end-to-end.

Opus adversarial-review checkpoint: probe the pre-live guard for TOCTOU / status-race gaps,
confirm the FIELD clamp cannot be evaded by a status flip mid-request, and that a granted
`approval:action` does NOT accidentally widen the pre-live edit scope.

---

## S4: Self-approval audit badge + filter

Schema: SCHEMA-FREE (derivation from the existing `MERCHANT_DRAFT_CREATED` AuditLog `actorId`;
stamp into existing audit `metadata`).

Code:
- `draftCreatorActorId(merchantId)`: read the latest `MERCHANT_DRAFT_CREATED` AuditLog
  `actorId` for the merchant (spec §5.2).
- At approve/go-live time, derive `selfOnboarded = approval.adminUserId ===
  draftCreatorActorId(merchant)` and stamp `{ selfOnboarded: true }` into the go-live action's
  AuditLog `metadata` (existing write; no schema).
- Queue History + merchant timeline: render a "Self-approved" badge from the
  `metadata.selfOnboarded` stamp (fall back to live derivation for pre-stamp rows).
- SUPER_ADMIN queue History filter "Self-approved only" narrowing to
  `metadata.selfOnboarded = true`. Filter visibility recommended SUPER_ADMIN-only (see FLAGS
  for the approval:read alternative).

Capability gates: badge visible wherever the approval history is (`approval:read`); the filter
gated to SUPER_ADMIN (or `approval:read`, flagged).

Tests (self-approval badge):
- selfOnboarded=true when draft-creator == approver; false when different admins.
- Self-serve merchant (no MERCHANT_DRAFT_CREATED actor) -> false.
- Draft creator deactivated after creation -> derivation still true (durable actorId).
- Badge renders on a stamped row; filter returns only stamped rows; SUPER_ADMIN-only gate.
- Copy is exactly "Self-approved" (no emoji, no em-dash).

Opus adversarial-review checkpoint: confirm the derivation cannot be spoofed (actorId is
audit-write-only), that a non-self approval never mis-badges, and that the metadata stamp is
written on the same transaction/path as the approval action so it cannot drift.

---

## SECURITY SEAMS

Explicit seams reviewers must scrutinise (each maps to a spec §7 invariant):
1. Grant allow-list boundary: only `GRANTABLE_CAPABILITIES` may be granted; `admin:manage-team`
   is off-list. Bypass here = full privilege escalation. (Invariant 1.)
2. JWT `caps` claim integrity + staleness: caps are minted server-side at sign time from the
   grant table; the token is signed with `JWT_SECRET_ADMIN`. Staleness bound = access-token TTL
   (<= 15m). Reviewers confirm the bound matches the owner invariant and the escape hatch
   works. (Invariants 2, 6.)
3. SUPER_ADMIN short-circuit isolation: never routed through the grant table; never grantable.
   (Invariants 1, 6.)
4. Team-management gate: `admin:manage-team` SUPER_ADMIN-only; FIELD/OPERATIONS cannot
   create/grant/deactivate. (Invariants 1, 3.)
5. Deactivation completeness (H4): `isActive=false` denies refresh + revokes sessions; grants
   die with the session. (Invariant 5.)
6. Pre-live scope server enforcement: `requirePreLiveMerchant`, role-conditional, after the
   capability gate; no UI-only reliance. (Invariant 9.)
7. Self-approval derivability: always stamped + badged + filterable; never silently
   self-approvable. (Invariant 7.)
8. Two-layer gating: admin-web mirror (UI) + backend 403 (authoritative). (Invariant 8.)
9. Audit completeness: every grant/revoke/create/role-set/deactivate + self-approval writes an
   AuditLog row. (Invariant 4, 7.)

## S-order: EMAIL dependency (rep go-live gate)

Team & Roles + the capability-grant model can be BUILT and REVIEWED now (S1-S4). FIELD rep
accounts go LIVE only AFTER transactional production email is enabled (#477 shipped +
`EMAIL_ENABLED` owner-gated on): reps receive login OTPs by email, with no db-read workaround
and no TOTP in scope. SUPER_ADMIN may create FIELD accounts before email is on, but those
accounts cannot log in until it is. This is a go-live gate, not a build gate.

## Migration bundling

The S1 schema delta (AdminCapabilityGrant + FIELD enum) ships in ONE coordinated OWNER-GATED
staging migration window with the three sibling recruitment packets (MerchantLead, MerchantNote,
MerchantAgreementRecord/D65). Each remains its own reviewed PR/slice; only the staging migration
application is bundled. Production migration is a separate future owner decision.

## FLAGS FOR OWNER

1. Effective-cap freshness (design fork, recommended but not forced): Option A embeds effective
   caps in the 15m JWT (grant/revoke effective within one token lifetime, <= 15m; zero
   per-request DB cost; mirrors the existing role-in-token pattern) vs Option B per-request grant
   lookup (near-immediate revoke; adds a DB/Redis read to every capability-gated admin request).
   RECOMMEND Option A with the optional session-revoke escape hatch for sensitive revokes. Flag:
   if the owner requires SUB-15-MINUTE (next-request) revoke of `approval:action` as a hard
   security requirement, that tips to Option B or a hybrid (per-request lookup for
   `approval:action` only). Decision needed.
2. Curated grantable set beyond `approval:action`: launch list is exactly `['approval:action']`.
   Which further capabilities (if any) should become grantable later (e.g. `merchant:suspend`,
   `redemption:read`) is undecided. Adding to the allow-list is a config change, not schema.
3. FIELD reps and cross-merchant redemptions: RECOMMEND NO `redemption:read` in the FIELD
   baseline (reps have no operational need to view cross-merchant redemptions). Confirm.
4. Self-approved filter visibility: RECOMMEND SUPER_ADMIN-only. Alternative = visible to any
   `approval:read` holder (broader oversight). Minor UX call; confirm.
5. `admin:manage-team` naming/scope: one capability covers account lifecycle + role/grant
   management for the launch slice. If the owner wants account-create separated from
   grant-management later, that is a future split (both stay SUPER_ADMIN-only for now).

## Unresolved fork

Only Flag 1 (Option A vs Option B revoke immediacy) is a genuine fork left open for the owner.
Recommendation is Option A; it is not forced because a hard sub-TTL revoke requirement for
`approval:action` would change the answer.
