/**
 * Admin session storage + capability logic.
 *
 * H5 migration (security audit): mirrors the merchant-web BFF-lite token
 * pattern, adapted for the admin auth contract. The access token lives ONLY in
 * memory (tokenStore.ts); the refresh token + `{ entityId, sessionId }` record
 * the refresh endpoint needs (`POST /admin/auth/refresh` body is
 * `{ refreshToken, sessionId, entityId }`) live server-side in an httpOnly
 * cookie set by the BFF route handlers (app/api/admin-auth/**) and are never
 * readable by page JS. The admin role, used for capability checks, is decoded
 * fresh from the access token's own claims (`decodeAdminJwt`) by the
 * SessionProvider on every install rather than persisted here.
 *
 * `hasCapability` is a deliberate, self-contained MIRROR of the backend
 * `adminHasCapability` in `src/api/admin/capability.ts`. We copy the literal
 * unions rather than importing backend code (the admin-web app must not depend
 * on the API source tree). The backend remains the real enforcement point; this
 * is UI gating only.
 */

// ── Capability model (mirror of src/api/admin/capability.ts) ──────────────────

export type AdminCapability =
  | 'merchant:create-draft'
  | 'merchant:read'
  | 'approval:read'
  | 'approval:action'
  | 'merchant:suspend'
  | 'branch:confirm-location'
  // Option B B1: gates the Approve-edit / Reject-edit actions on a merchant
  // identity-edit review (MERCHANT_IDENTITY_EDIT / BRANCH_IDENTITY_EDIT).
  | 'approval:apply-edit'
  // Option B B2.1: gates the admin direct-edit-on-behalf routes (PATCH a
  // merchant's / branch's simple-DIRECT fields).
  | 'merchant:edit'
  // Option B B2.2: gates the admin edit of a merchant's registered identity
  // fields (vatNumber / companyNumber). NOT in ALL_SLICE1_CAPS, so it is held
  // ONLY by SUPER_ADMIN (via the hasCapability short-circuit). Keep aligned with
  // the backend src/api/admin/capability.ts.
  | 'merchant:edit-identity'
  // Option B B2.3: gates the admin edit of a merchant's primaryCategoryId. NOT in
  // ALL_SLICE1_CAPS, so it is held ONLY by SUPER_ADMIN. Keep aligned with the
  // backend src/api/admin/capability.ts.
  | 'merchant:edit-category'
  // Option B B2.4: gates admin branch create + soft-delete. NOT in
  // ALL_SLICE1_CAPS, so it is held ONLY by SUPER_ADMIN. Keep aligned with the
  // backend src/api/admin/capability.ts.
  | 'merchant:manage-branches'
  // Option B B2.5: gates the admin PROPOSE of a merchant's SENSITIVE identity
  // fields on the merchant's behalf (routes into the B1 pending-edit lane; does
  // NOT directly mutate). NOT in ALL_SLICE1_CAPS, so it is held ONLY by
  // SUPER_ADMIN (via the hasCapability short-circuit). Distinct from
  // approval:apply-edit (the B1 APPLY side). Keep aligned with the backend
  // src/api/admin/capability.ts.
  | 'merchant:propose-edit'
  // Option B B3: gates the admin submit-for-approval-on-behalf affordance (POST
  // /admin/merchants/:id/submit). An operational lifecycle action (like
  // merchant:create-draft / merchant:suspend), NOT approval, so it IS in
  // ALL_SLICE1_CAPS (OPERATIONS holds it). Keep aligned with the backend
  // src/api/admin/capability.ts.
  | 'merchant:submit'
  // Option B B4: gates the admin upload + delete of a merchant's verification
  // documents on the merchant's behalf. NOT in ALL_SLICE1_CAPS, so it is held
  // ONLY by SUPER_ADMIN (via the hasCapability short-circuit). Document VIEW uses
  // the lower `merchant:read`. Keep aligned with the backend src/api/admin/capability.ts.
  | 'merchant:manage-documents'
  // Option B B5.1: gates admin RMV co-build on behalf (edit allowedFields + submit
  // the mandatory RMV vouchers during onboarding). An operational onboarding-
  // completion helper (like merchant:submit), so it IS in ALL_SLICE1_CAPS
  // (OPERATIONS holds it). Keep aligned with the backend src/api/admin/capability.ts.
  | 'merchant:manage-vouchers'
  // D65 (in-person signing ceremony): gates the assisted contract-signing route
  // (POST /admin/merchants/:id/agreement/sign) where the rep WITNESSES the owner's
  // signature on the rep's device (admin-never-signs: the rep is the witness, never
  // the signatory). An operational onboarding-completion action (like
  // merchant:submit), so it IS in ALL_SLICE1_CAPS (OPERATIONS holds it) AND in
  // FIELD_CAPABILITIES (FIELD completes assisted onboarding end-to-end). Keep
  // aligned with the backend src/api/admin/capability.ts.
  | 'merchant:sign-agreement'
  // D67: gates the read-only cross-merchant admin redemptions list. IS in
  // ALL_SLICE1_CAPS (OPERATIONS + SUPER_ADMIN hold it). Keep aligned with the
  // backend src/api/admin/capability.ts.
  | 'redemption:read'
  // Team & Roles S1: FIELD baseline anchor. Create/update/progress merchant
  // leads. NOT in ALL_SLICE1_CAPS (OPERATIONS does not hold it) — only FIELD's
  // own baseline grants it. Keep aligned with the backend src/api/admin/capability.ts.
  | 'lead:manage'
  // MerchantNote packet (2026-07-13, PR #510, owner-locked OD2 grill-me
  // 2026-07-10): gates the internal per-merchant admin notes surface (list /
  // add / edit-own / retract-own). UNIVERSAL by owner decision: readable AND
  // writable by EVERY admin role (OPERATIONS, FIELD, FINANCE, CONTENT,
  // SUPPORT; SUPER_ADMIN via the short-circuit), so it is added to ALL FIVE
  // role baselines below. NOT in GRANTABLE_CAPABILITIES: a grant is pointless
  // when every role already holds it. Keep aligned with the backend
  // src/api/admin/capability.ts.
  | 'merchant:notes'
  // Team & Roles S1: gates the entire Team & Roles surface (create admin
  // account, set base role, deactivate, grant/revoke curated capabilities).
  // NOT in ALL_SLICE1_CAPS and NOT in ANY role baseline (incl. FIELD /
  // OPERATIONS), so under the SUPER_ADMIN short-circuit it is held ONLY by
  // SUPER_ADMIN. Keep aligned with the backend src/api/admin/capability.ts.
  | 'admin:manage-team'
  // D65 lane-2 (evidence read): gates the Merchant 360 "View signing evidence"
  // action + the "Download signed PDF" download (the ordinary-tier evidence read
  // + the server-proxied PDF retrieval). IS in ALL_SLICE1_CAPS (OPERATIONS holds
  // it) + SUPER_ADMIN via the short-circuit; NOT in FIELD_CAPABILITIES and NOT
  // grantable. Keep aligned with the backend src/api/admin/capability.ts.
  | 'contract:view-evidence'

// Exhaustiveness guard: TypeScript errors if a capability is added to (or
// removed from) the AdminCapability union above without a matching edit
// here. Anti-drift improvement (honesty-copy sweep, 2026-07-13): the
// backend added `merchant:notes` to every role baseline in PR #510 and this
// mirror silently missed it, because the FIELD-baseline test's own
// "every OTHER declared capability" list was a SEPARATE hand-copied literal
// that nothing forced back in sync with the union type. `ALL_ADMIN_CAPABILITIES`
// below is the single list derived from this guard; the test iterates it
// instead of hand-copying its own, so a capability added to the union without
// a role decision can no longer pass silently.
const CAPABILITY_EXHAUSTIVENESS_GUARD: Record<AdminCapability, true> = {
  'merchant:create-draft': true,
  'merchant:read': true,
  'approval:read': true,
  'approval:action': true,
  'merchant:suspend': true,
  'branch:confirm-location': true,
  'approval:apply-edit': true,
  'merchant:edit': true,
  'merchant:edit-identity': true,
  'merchant:edit-category': true,
  'merchant:manage-branches': true,
  'merchant:propose-edit': true,
  'merchant:submit': true,
  'merchant:manage-documents': true,
  'merchant:manage-vouchers': true,
  'merchant:sign-agreement': true,
  'redemption:read': true,
  'lead:manage': true,
  'merchant:notes': true,
  'admin:manage-team': true,
  'contract:view-evidence': true,
}

/**
 * Every declared `AdminCapability`, derived from the exhaustiveness guard
 * above rather than hand-copied, so this list can never silently omit a
 * capability that exists in the union type. Exported for tests (the
 * anti-drift check that replaced the old hand-copied `ALL_DECLARED` literal).
 */
export const ALL_ADMIN_CAPABILITIES: AdminCapability[] = Object.keys(
  CAPABILITY_EXHAUSTIVENESS_GUARD
) as AdminCapability[]

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'OPERATIONS'
  | 'FINANCE'
  | 'CONTENT'
  | 'SUPPORT'
  // Team & Roles S1/S3: field reps who create merchant leads and drive
  // assisted pre-live onboarding. Baseline = FIELD_CAPABILITIES below; holds
  // NO approval capability (approval:action is grant-only).
  | 'FIELD'

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
  'merchant:sign-agreement',
  'redemption:read',
  // MerchantNote packet: OPERATIONS holds the universal notes cap via its list.
  'merchant:notes',
  // D65 lane-2: OPERATIONS may view signing evidence + download the signed PDF.
  'contract:view-evidence',
]

// Team & Roles S1/S3: FIELD baseline (owner-locked UNION set — see spec
// 2026-07-10-admin-capability-grants-field-role §4.1). FIELD holds NO approval
// capability (approval:action is grant-only), NO redemption:read, NO
// merchant:suspend, NO admin:manage-team, and none of the SUPER_ADMIN-only
// edit-identity/edit-category caps. COPY LITERALLY from FIELD_CAPABILITIES in
// src/api/admin/capability.ts — keep the order identical for an eyeball diff.
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

// Per-role grants. SUPER_ADMIN is the superuser (handled in `hasCapability`, so
// it implicitly holds every current and future capability). OPERATIONS runs the
// merchant lifecycle and holds all Slice-1 caps. FIELD holds the rep baseline
// above. FINANCE/CONTENT/SUPPORT hold NO Slice-1 capabilities; their only
// baseline entry is the universal `merchant:notes` (MerchantNote packet OD2:
// internal notes are readable + writable by EVERY role). Keep this aligned
// with ROLE_CAPABILITIES in the backend.
const ROLE_CAPABILITIES: Record<string, AdminCapability[]> = {
  OPERATIONS: ALL_SLICE1_CAPS,
  FIELD: FIELD_CAPABILITIES,
  FINANCE: ['merchant:notes'],
  CONTENT: ['merchant:notes'],
  SUPPORT: ['merchant:notes'],
}

// Team & Roles S1: the ONLY capabilities a SUPER_ADMIN may grant to another
// admin via the Team & Roles surface (spec §6.2). Launch curated set = exactly
// `approval:action`. Mirrors the backend server-side allow-list
// (src/api/admin/capability.ts GRANTABLE_CAPABILITIES) — the grant TOGGLE in
// the UI is driven by this list so it can never offer a non-curated capability;
// the backend allow-list remains the real enforcement (this is UI gating only).
export const GRANTABLE_CAPABILITIES = ['approval:action'] as const
export type GrantableCapability = (typeof GRANTABLE_CAPABILITIES)[number]

/** True iff `cap` is on the curated grantable allow-list. */
export function isGrantableCapability(cap: string): cap is GrantableCapability {
  return (GRANTABLE_CAPABILITIES as readonly string[]).includes(cap)
}

/**
 * Whether `role` holds `cap`. Mirrors `adminHasCapability` exactly:
 *   - no role               -> false
 *   - SUPER_ADMIN           -> true (superuser, every cap)
 *   - otherwise             -> membership in the role's grant list
 *
 * ROLE-ONLY: does not consult a `caps` claim. Retained for callers that only
 * have a role (e.g. a pre-decode check) and as the legacy-token fallback
 * inside `hasEffectiveCapability`. New capability-gated UI should prefer
 * `hasEffectiveCapability`, which is grant-aware.
 */
export function hasCapability(
  role: string | null | undefined,
  cap: AdminCapability
): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return (ROLE_CAPABILITIES[role] ?? []).includes(cap)
}

/**
 * Grant-aware capability check — the client mirror of the backend
 * `adminHasEffectiveCapability` (src/api/admin/capability.ts). SUPER_ADMIN
 * short-circuits (never routed through the grant table / caps claim).
 * Otherwise membership is decided against the token's minted `caps` claim
 * (role baseline UNION active grantable grants, computed server-side at sign
 * time). `caps === undefined` means a LEGACY token minted before the `caps`
 * claim existed: fall back to the role baseline so the rollout does not break
 * an in-flight session. New tokens always carry an (at least empty) `caps`
 * array, so this fallback can never mask a revoke.
 *
 * This is UI gating ONLY — the backend `requireAdminCapability` (grant-aware,
 * same semantics) is the authoritative enforcement (two-layer rule,
 * .claude/rules/admin-web.md).
 */
export function hasEffectiveCapability(
  role: string | null | undefined,
  caps: string[] | undefined,
  cap: AdminCapability
): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  if (caps === undefined) return (ROLE_CAPABILITIES[role] ?? []).includes(cap)
  return caps.includes(cap)
}

// ── Token + session storage ───────────────────────────────────────────────────
//
// H5 migration (security audit): the refresh token no longer lives in
// localStorage (XSS -> durable session theft). The access token now lives ONLY
// in memory (tokenStore.ts); the long-lived refresh material lives server-side
// in an httpOnly cookie set by the BFF route handlers
// (app/api/admin-auth/**/route.ts) and is never readable by page JS. These
// thin wrappers keep the historical `session.ts` call sites (lib/api/client.ts,
// the SessionProvider in useSession.ts) stable while delegating the actual
// storage to tokenStore. The vestigial non-httpOnly `redeemo_admin_auth` flag
// cookie is removed: the new httpOnly session cookie's PRESENCE is what
// middleware.ts gates on instead.
import { getAccessToken as getStoredAccessToken, setAccessToken, triggerSessionLost } from './tokenStore'

const DEVICE_KEY = 'redeemo_admin_device_id'

/** The bits of the session the SessionProvider needs to render/gate the shell. */
export type AdminSessionMeta = {
  entityId: string
  sessionId: string
  adminRole: AdminRole
  email: string
}

export function getAccessToken(): string | null {
  return getStoredAccessToken()
}

/**
 * Install a fresh access token after login/OTP-verify or a refresh. `meta` is
 * accepted for call-site symmetry with the BFF response shape but is NOT
 * persisted here: the SessionProvider (lib/auth/useSession.ts) is the single
 * place that derives role/adminId/email for React state (re-decoded fresh from
 * the token claims on every install via `decodeAdminJwt`), so there is exactly
 * one source of truth for those fields.
 */
export function setSession(accessToken: string, meta?: AdminSessionMeta): void {
  void meta // accepted for call-site symmetry only; see doc comment above.
  setAccessToken(accessToken)
}

/**
 * Clear the in-memory access token and arm the hard-logout latch (tokenStore's
 * `triggerSessionLost`). The httpOnly refresh cookie itself is cleared
 * server-side by the BFF `/api/admin-auth/logout` route, not here.
 */
export function clearSession(): void {
  setAccessToken(null)
  triggerSessionLost()
}

/**
 * A stable per-browser device id. The admin login body requires a UUID
 * `deviceId` (shared `deviceSchema`); we persist one so refresh-token rotation
 * stays tied to a single device record.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return generateUuid()
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = generateUuid()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

/** A v4 UUID. Prefers crypto.randomUUID; falls back where it is unavailable. */
function generateUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // RFC4122 v4 fallback using getRandomValues when present, else Math.random.
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

/**
 * Decode the (non-secret) payload of an admin access JWT to read the `sub`,
 * `sessionId`, `adminRole`, and (Team & Roles S1) `caps` claims. No signature
 * verification — we only read claims that originated from a token we just
 * received over TLS, to populate the refresh contract and drive capability
 * gating. Returns null on any malformed input or missing required claim.
 *
 * `caps` is OPTIONAL on the returned object: a legacy token minted before the
 * `caps` claim existed decodes to `caps: undefined`, which `hasEffectiveCapability`
 * treats as "fall back to the role baseline" (see its doc comment). A present
 * `caps` array (even empty) is always used as-is.
 */
export function decodeAdminJwt(
  token: string
): { sub: string; sessionId: string; adminRole: string; caps?: string[] } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = base64UrlDecode(parts[1])
    const payload = JSON.parse(json) as {
      sub?: string
      sessionId?: string
      adminRole?: string
      caps?: unknown
    }
    if (!payload.sub || !payload.sessionId || !payload.adminRole) return null
    const caps = Array.isArray(payload.caps)
      ? payload.caps.filter((c): c is string => typeof c === 'string')
      : undefined
    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      adminRole: payload.adminRole,
      caps,
    }
  } catch {
    return null
  }
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '==='.slice((b64.length + 3) % 4)
  if (typeof atob === 'function') {
    return decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
  }
  // Node (jsdom/test) fallback.
  return Buffer.from(padded, 'base64').toString('utf-8')
}
