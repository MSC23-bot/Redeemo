/**
 * Admin session storage + capability logic.
 *
 * Mirrors the customer-web token pattern (localStorage tokens + a flag cookie),
 * adapted for the admin auth contract:
 *   - access + refresh tokens
 *   - a `{ entityId, sessionId }` record needed by the refresh endpoint
 *     (`POST /admin/auth/refresh` body is `{ refreshToken, sessionId, entityId }`)
 *   - the admin role, used for capability checks
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
  // D67: gates the read-only cross-merchant admin redemptions list. IS in
  // ALL_SLICE1_CAPS (OPERATIONS + SUPER_ADMIN hold it). Keep aligned with the
  // backend src/api/admin/capability.ts.
  | 'redemption:read'

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'OPERATIONS'
  | 'FINANCE'
  | 'CONTENT'
  | 'SUPPORT'

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
  'redemption:read',
]

// Per-role grants. SUPER_ADMIN is the superuser (handled in `hasCapability`, so
// it implicitly holds every current and future capability). OPERATIONS runs the
// merchant lifecycle and holds all Slice-1 caps. FINANCE/CONTENT/SUPPORT hold
// none. Keep this aligned with ROLE_CAPABILITIES in the backend.
const ROLE_CAPABILITIES: Record<string, AdminCapability[]> = {
  OPERATIONS: ALL_SLICE1_CAPS,
  FINANCE: [],
  CONTENT: [],
  SUPPORT: [],
}

/**
 * Whether `role` holds `cap`. Mirrors `adminHasCapability` exactly:
 *   - no role               -> false
 *   - SUPER_ADMIN           -> true (superuser, every cap)
 *   - otherwise             -> membership in the role's grant list
 */
export function hasCapability(
  role: string | null | undefined,
  cap: AdminCapability
): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return (ROLE_CAPABILITIES[role] ?? []).includes(cap)
}

// ── Token + session storage ───────────────────────────────────────────────────

const ACCESS_KEY = 'redeemo_admin_access_token'
const REFRESH_KEY = 'redeemo_admin_refresh_token'
const SESSION_KEY = 'redeemo_admin_session'
const DEVICE_KEY = 'redeemo_admin_device_id'
const FLAG_COOKIE = 'redeemo_admin_auth'

/** The bits of the session needed to refresh + render the shell. */
export type AdminSessionMeta = {
  entityId: string
  sessionId: string
  adminRole: AdminRole
  email: string
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_KEY)
}

export function getSessionMeta(): AdminSessionMeta | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AdminSessionMeta
  } catch {
    return null
  }
}

/** The signed-in admin role, or null when signed out. */
export function getAdminRole(): AdminRole | null {
  return getSessionMeta()?.adminRole ?? null
}

export function isAuthenticated(): boolean {
  return getAccessToken() != null && getSessionMeta() != null
}

/**
 * Persist a fresh session after OTP verification. Stores both tokens plus the
 * meta the refresh endpoint requires, and sets a non-sensitive flag cookie.
 */
export function setSession(params: {
  accessToken: string
  refreshToken: string
  meta: AdminSessionMeta
}): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACCESS_KEY, params.accessToken)
  localStorage.setItem(REFRESH_KEY, params.refreshToken)
  localStorage.setItem(SESSION_KEY, JSON.stringify(params.meta))
  document.cookie = `${FLAG_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
}

/**
 * Replace just the rotating tokens after a refresh, keeping the session meta
 * (entityId / sessionId / role / email) intact.
 */
export function updateTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(SESSION_KEY)
  document.cookie = `${FLAG_COOKIE}=; path=/; max-age=0; SameSite=Lax`
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
 * `sessionId`, and `adminRole` claims. No signature verification — we only read
 * claims that originated from a token we just received over TLS, to populate the
 * refresh contract. Returns null on any malformed input.
 */
export function decodeAdminJwt(
  token: string
): { sub: string; sessionId: string; adminRole: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = base64UrlDecode(parts[1])
    const payload = JSON.parse(json) as {
      sub?: string
      sessionId?: string
      adminRole?: string
    }
    if (!payload.sub || !payload.sessionId || !payload.adminRole) return null
    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      adminRole: payload.adminRole,
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
