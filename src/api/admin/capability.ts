// Phase 2 Slice 1 M2 — admin capability enforcement foundation.
//
// AdminUser.role is one of: SUPER_ADMIN | OPERATIONS | FINANCE | CONTENT |
// SUPPORT (prisma `AdminRole`). The role is carried on the admin JWT as
// `request.user.adminRole` (set by the admin-auth plugin).
//
// Slice 1 wires ONLY `merchant:create-draft` to a route (M2). The other
// capabilities are declared here as the enforcement foundation and become
// load-bearing when their routes land (approval:* in M3/M5, merchant:suspend +
// branch:confirm-location in M4/M6). Declaring them now keeps the map the
// single source of truth.
//
// `merchant:read` (admin follow-up WP2) gates the read-only merchants directory
// (list + search) + the bell click-through + the future admin-edit surfaces. It
// is intentionally distinct from the destructive `merchant:suspend` (so a
// directory-read role need not also hold the takedown action) AND from
// `approval:read` (the directory surfaces ALL merchants, not just those with a
// pending approval, so coupling it to the approval workflow would be a semantic
// mismatch).

export type AdminCapability =
  | 'merchant:create-draft'
  | 'merchant:read'
  | 'approval:read'
  | 'approval:action'
  | 'merchant:suspend'
  | 'branch:confirm-location'
  // Option B B1: gates applying a merchant-requested identity edit
  // (MERCHANT_IDENTITY_EDIT / BRANCH_IDENTITY_EDIT). Distinct from the
  // onboarding-only `approval:action` so an edit-applier role need not also
  // hold the go-live/reject actions. OPERATIONS + SUPER_ADMIN hold it.
  | 'approval:apply-edit'
  // Option B B2.1: gates the admin direct-edit-on-behalf routes (PATCH a
  // merchant's / branch's simple-DIRECT fields). Distinct from B1's
  // `approval:apply-edit`: B1 APPLIES a merchant-REQUESTED identity edit;
  // B2.1 is the admin EDITING directly on the merchant's behalf. OPERATIONS +
  // SUPER_ADMIN hold it.
  | 'merchant:edit'
  // Option B B2.2: gates the admin edit of a merchant's registered identity
  // fields (vatNumber / companyNumber). Intentionally NOT in ALL_SLICE1_CAPS: it
  // is held ONLY by SUPER_ADMIN (via the superuser short-circuit in
  // adminHasCapability). OPERATIONS does NOT hold it, because identity edits are
  // a higher bar than the websiteUrl / branch-contact edits gated by merchant:edit.
  | 'merchant:edit-identity'
  // Option B B2.3: gates the admin edit of a merchant's primaryCategoryId.
  // NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only (via the superuser short-circuit).
  // Category change has RMV-provisioning side effects (it discards DRAFT RMVs and
  // reprovisions 2 mandatory vouchers), so it sits at the same higher bar as
  // merchant:edit-identity.
  | 'merchant:edit-category'
  // Option B B2.4: gates admin branch create + soft-delete on the merchant's
  // behalf. NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only. Soft-delete is destructive
  // (it permanently removes a branch and deactivates its staff logins), so it sits
  // at the higher SUPER_ADMIN bar.
  | 'merchant:manage-branches'
  // Option B B2.5: gates the admin PROPOSE of a merchant's SENSITIVE identity
  // fields on the merchant's behalf (routes into the B1 pending-edit lane; does
  // NOT directly mutate). NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only.
  // Intentionally distinct from approval:apply-edit (the B1 APPLY side), so the
  // PROPOSE and APPLY capabilities are separable.
  | 'merchant:propose-edit'
  // Option B B3: gates the admin submit-for-approval-on-behalf route (POST
  // /admin/merchants/:id/submit). An operational lifecycle action (like
  // merchant:create-draft / merchant:suspend) — NOT approval — so it IS in
  // ALL_SLICE1_CAPS (OPERATIONS holds it). Submitting only QUEUES the merchant
  // for review; claim + go-live stay the separate `approval:action` capability,
  // preserving the submit/approve separation of duties.
  | 'merchant:submit'
  // Option B B4: gates the admin upload + delete of a merchant's verification
  // documents on the merchant's behalf. NOT in ALL_SLICE1_CAPS -> SUPER_ADMIN-only.
  // Uploading/removing documents on a merchant's behalf is sensitive (same higher
  // bar as merchant:edit-identity / merchant:manage-branches). Document VIEW on the
  // detail page is gated on the lower `merchant:read` (consistent with the M4
  // review screen, where OPERATIONS already sees documents).
  | 'merchant:manage-documents'
  // Option B B5.1: gates admin RMV co-build on behalf (edit allowedFields + submit
  // the mandatory RMV vouchers during onboarding). An operational onboarding-
  // completion helper (like merchant:submit), NOT a higher-bar destructive action,
  // so it IS in ALL_SLICE1_CAPS (OPERATIONS holds it). RMV edits are template-
  // constrained (allowedFields) and DRAFT-only, and the go-live approval
  // (approval:action) stays the separation-of-duties backstop. VIEW of the RMV list
  // is gated on the lower `merchant:read`. NOTE: B5.2 custom-voucher CRUD (creating
  // PUBLIC custom offers) is a higher product/legal bar and may warrant a SEPARATE
  // capability/tier; do not assume it reuses this one.
  | 'merchant:manage-vouchers'
  // D65 (in-person signing ceremony): gates the assisted contract-signing route
  // (POST /admin/merchants/:id/agreement/sign) where the rep WITNESSES the owner's
  // signature on the rep's device: the rep is recorded as actorAdminId plus the witness
  // identity, and the owner types their own name as the signer of record. An obvious
  // same-name signing is refused; the system cannot independently prove two distinct
  // humans were present. An operational onboarding-completion
  // action like merchant:submit (it drives a pre-live merchant toward go-live), so it
  // IS in ALL_SLICE1_CAPS (OPERATIONS holds it) AND in FIELD_CAPABILITIES (spec §1.6:
  // FIELD completes assisted onboarding END-TO-END, including the contract ceremony).
  // The pre-live scope guard (assertFieldPreLiveScope) is the FIELD safety boundary,
  // and the fail-closed AGREEMENT_LEGAL_REVIEW_REQUIRED gate blocks production binding
  // writes regardless of role. NOT in GRANTABLE_CAPABILITIES.
  | 'merchant:sign-agreement'
  // D67: gates the read-only cross-merchant admin redemptions list (GET
  // /admin/redemptions). Distinct from `merchant:read` (the merchants
  // directory) so a redemption-visibility role need not also hold the
  // merchant-directory read. OPERATIONS + SUPER_ADMIN hold it.
  | 'redemption:read'
  // Team & Roles S1: FIELD baseline anchor. Create/update/progress merchant
  // leads. The MerchantLead pipeline routes are a sibling packet; this literal
  // is declared here so ROLE_CAPABILITIES.FIELD can reference it now.
  | 'lead:manage'
  // MerchantNote packet (2026-07-13, owner-locked OD2 grill-me 2026-07-10):
  // gates the internal per-merchant admin notes surface (list / add / edit-own /
  // retract-own). UNIVERSAL by owner decision: readable AND writable by EVERY
  // admin role (OPERATIONS, FIELD, FINANCE, CONTENT, SUPPORT; SUPER_ADMIN via the
  // short-circuit), so it is added to ALL FIVE role baselines below. It is NOT in
  // GRANTABLE_CAPABILITIES: a grant is pointless when every role already holds it.
  // A universal cap (rather than an ungated surface) keeps the fail-closed cap-
  // gated house pattern; FINANCE/CONTENT/SUPPORT baselines were empty, so no
  // pre-existing cap could express "all roles".
  | 'merchant:notes'
  // Team & Roles S1: gates the entire Team & Roles surface (create admin
  // account, set base role, deactivate, grant/revoke curated capabilities).
  // Intentionally NOT in ALL_SLICE1_CAPS and NOT in ANY role baseline (incl.
  // FIELD / OPERATIONS), so under the SUPER_ADMIN short-circuit it is held ONLY
  // by SUPER_ADMIN. It is NOT in GRANTABLE_CAPABILITIES either, so no grant can
  // ever confer it (privilege-escalation guard, spec §7 invariant 1).
  | 'admin:manage-team'
  // §SEC.1 GAP-7 (plan 2026-07-10-transactional-email-enablement §1.7): gates the
  // read-only transactional-email OPS surface (the 24h send/failed/bounced
  // aggregates + Redis counters + pause state) AND the SUPER_ADMIN-only resume
  // action that clears the GAP-6 send-pause. The plan names no capability, so this
  // follows the admin:manage-team precedent: NOT in any role baseline and NOT in
  // GRANTABLE_CAPABILITIES, so under the SUPER_ADMIN short-circuit it is held ONLY
  // by SUPER_ADMIN. Email ops (pausing/resuming all transactional mail, incl. admin
  // OTP) is a platform-safety lever, so it sits at the top bar.
  | 'email:ops'

const ALL_SLICE1_CAPS: AdminCapability[] = [
  'merchant:create-draft',
  'merchant:read',
  'approval:read',
  'approval:action',
  'merchant:suspend',
  'branch:confirm-location',
  'approval:apply-edit',
  'merchant:edit',
  'merchant:submit',
  'merchant:manage-vouchers',
  // D65: OPERATIONS may witness the assisted contract-signing ceremony.
  'merchant:sign-agreement',
  'redemption:read',
  // MerchantNote packet: OPERATIONS holds the universal notes cap via its list.
  'merchant:notes',
]

// Team & Roles S1: FIELD baseline (owner-locked UNION set, 2026-07-10: FIELD
// must complete assisted onboarding END-TO-END for pre-live merchants,
// including submit-for-review). Field reps capture leads and drive assisted
// PRE-LIVE onboarding on a merchant's behalf. FIELD holds NO approval
// capability (`approval:action` is grant-only, spec §5), NO `redemption:read`
// (reps have no cross-merchant redemption need), NO `merchant:suspend`, NO
// `admin:manage-team`, and NONE of the SUPER_ADMIN-only edit-identity /
// edit-category caps. The safety boundary for the on-behalf caps is the
// SERVER-SIDE pre-live scope guard (spec §4.2, slice S3): these powers apply
// only to REGISTERED/PENDING_APPROVAL merchants, never live ones.
const FIELD_CAPABILITIES: AdminCapability[] = [
  'lead:manage',
  'merchant:create-draft',
  'merchant:read',
  'merchant:edit',
  'merchant:submit',
  'merchant:manage-branches',
  'merchant:manage-documents',
  'merchant:manage-vouchers',
  // D65: FIELD completes assisted onboarding end-to-end, including witnessing the
  // in-person contract-signing ceremony for a PRE-LIVE merchant (pre-live scope
  // guarded).
  'merchant:sign-agreement',
  // MerchantNote packet: FIELD holds the universal notes cap.
  'merchant:notes',
]

// Per-role grants. SUPER_ADMIN is the superuser (handled in `adminHasCapability`
// so it implicitly holds every CURRENT and FUTURE capability without map
// upkeep). OPERATIONS runs the merchant lifecycle. FIELD holds the rep baseline
// above. FINANCE/CONTENT/SUPPORT hold NO Slice-1 capabilities; their only
// baseline entry is the universal `merchant:notes` (MerchantNote packet OD2:
// internal notes are readable + writable by EVERY role).
const ROLE_CAPABILITIES: Record<string, AdminCapability[]> = {
  OPERATIONS: ALL_SLICE1_CAPS,
  FIELD: FIELD_CAPABILITIES,
  FINANCE: ['merchant:notes'],
  CONTENT: ['merchant:notes'],
  SUPPORT: ['merchant:notes'],
}

// Team & Roles S1: the ONLY capabilities a SUPER_ADMIN may grant to another
// admin via the Team & Roles surface (spec §6.2). Launch curated set = exactly
// `approval:action`. This is a server-side allow-list, NOT free-form: an
// operator can never grant `admin:manage-team` (privilege-escalation guard) or
// any other capability off this list. Adding a capability here later is a config
// change, not a schema change.
export const GRANTABLE_CAPABILITIES = ['approval:action'] as const
export type GrantableCapability = (typeof GRANTABLE_CAPABILITIES)[number]

/** True iff `cap` is on the curated grantable allow-list. */
export function isGrantableCapability(cap: string): cap is GrantableCapability {
  return (GRANTABLE_CAPABILITIES as readonly string[]).includes(cap)
}

/**
 * Effective capabilities for a NON-SUPER_ADMIN admin = role baseline UNION the
 * admin's active (non-revoked) grants, with grants FILTERED to the grantable
 * allow-list. Filtering here is defence in depth: even if a non-grantable
 * capability somehow lands in the grant table, it is IGNORED and never becomes
 * effective (spec §7 invariant 1). SUPER_ADMIN is intentionally NOT special-
 * cased here: its authority rides the SUPER_ADMIN short-circuit in
 * `adminHasEffectiveCapability`, and its computed `caps` claim is simply its
 * (empty) baseline. Order is deterministic (baseline first, then new grants).
 */
export function resolveEffectiveCapabilities(
  role: string | undefined,
  activeGrantCaps: string[],
): AdminCapability[] {
  const baseline = role ? (ROLE_CAPABILITIES[role] ?? []) : []
  const grantable = activeGrantCaps.filter(isGrantableCapability)
  const seen = new Set<string>()
  const out: AdminCapability[] = []
  for (const cap of [...baseline, ...grantable]) {
    if (seen.has(cap)) continue
    seen.add(cap)
    out.push(cap as AdminCapability)
  }
  return out
}

/**
 * Role-only capability check (base role + SUPER_ADMIN short-circuit). Retained
 * for callers that pre-date the per-account grant model and for the legacy-token
 * fallback in `adminHasEffectiveCapability`. Grant-aware call sites must use
 * `adminHasEffectiveCapability` / `requireAdminCapability`.
 */
export function adminHasCapability(role: string | undefined, cap: AdminCapability): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return (ROLE_CAPABILITIES[role] ?? []).includes(cap)
}

/**
 * Grant-aware capability check. SUPER_ADMIN short-circuits (never routed through
 * the grant table). Otherwise membership is decided against the token's minted
 * `caps` claim (role baseline UNION active grantable grants, computed at sign
 * time). `caps === undefined` means a LEGACY token minted before the `caps`
 * claim existed: fall back to the role baseline so the rollout does not break
 * in-flight sessions. New tokens always carry an (at least empty) `caps` array,
 * so this fallback can never mask a revoke.
 */
export function adminHasEffectiveCapability(
  role: string | undefined,
  caps: string[] | undefined,
  cap: AdminCapability,
): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  if (caps === undefined) return (ROLE_CAPABILITIES[role] ?? []).includes(cap)
  return caps.includes(cap)
}

/**
 * Fastify preHandler that 403s an admin lacking `cap`. Must run AFTER
 * `authenticateAdmin` (the admin-management plugin applies that hook to the
 * whole scope, so `request.user.adminRole` + `request.user.caps` are populated
 * by the time this runs). Grant-aware: consults the SUPER_ADMIN short-circuit
 * (`adminRole` claim) OR membership in the token's `caps` claim.
 */
export function requireAdminCapability(cap: AdminCapability) {
  return async function (request: any, reply: any) {
    if (!adminHasEffectiveCapability(request.user?.adminRole, request.user?.caps, cap)) {
      return reply.status(403).send({
        error: {
          code: 'ADMIN_CAPABILITY_DENIED',
          message: 'You do not have permission to perform this action.',
          statusCode: 403,
        },
      })
    }
  }
}
