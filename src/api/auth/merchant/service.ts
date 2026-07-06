import crypto from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { verifyPassword, validatePasswordPolicy, hashPassword } from '../../shared/password'
import { generateRefreshToken, hashRefreshToken, generateSessionId, generateSecureToken } from '../../shared/tokens'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import { consumePwdResetAttempt } from '../../shared/pwdResetLimiter'
import { getActiveMembership } from '../../shared/merchantMembership'
import {
  storeRefreshToken, revokeAllSessionsForEntity,
  revokeAllUserSessionRecords, writeUserSession, validateRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../../shared/session'
import { writeAuditLog, writeAuditLogTx } from '../../shared/audit'
import { merchantVerifyEmail, merchantAccountExistsEmail, type RenderedEmail } from '../../shared/emailTemplates'
import { TERMS_VERSION } from '../../shared/legal'
import {
  rotateMerchantRefreshTokenAtomic,
  revokeMerchantSessionUnconditional,
  revokeMerchantSessionByPossession,
} from './atomicRotate'

const OTP_CHALLENGE_TTL = 600   // 10 minutes
const PWD_RESET_TTL     = 3600
const CLAIM_TTL         = 7 * 24 * 3600   // 7 days — draft-owner claim token
const EMAIL_VERIFY_TTL  = 24 * 3600       // 24 hours: self-serve registration email verify
const ACCESS_TOKEN_TTL  = '15m'

// M1 Slice 0: merchant login OTP mirrors the admin email-HMAC pattern. The dev
// bypass is an ALLOWLIST (not `!== production`) so an unset / typo'd / staging
// NODE_ENV fails CLOSED. Real email is dark (Phase 6); dev reads the code from
// the CommunicationLog outbox.
const MERCHANT_OTP_DEV_BYPASS_ENVS = new Set(['development', 'test'])
const MERCHANT_DEV_OTP_BYPASS_CODE = '000000'
// Per-challenge wrong-code ceiling: on the Nth wrong attempt the challenge is
// destroyed (the merchant must restart login for a fresh code), bounding brute
// force to N guesses per live challenge regardless of the edge rate-limit.
const MERCHANT_OTP_MAX_ATTEMPTS = 5

function otpRequired(admin: any, deviceId: string, knownDevices: string[]): boolean {
  if (!admin.otpVerifiedAt) return true                       // first ever login
  if (!knownDevices.includes(deviceId)) return true           // new device
  return false
}

/**
 * M6b (D-1): resolve a merchant-admin's merchant via the MerchantMembership
 * source of truth — replaces the dropped MerchantAdmin.merchant relation /
 * merchantId column.
 *
 * Staff & Access PR-B B8 (THE CUTOVER, §4.4): resolves ANY ACTIVE membership
 * (getActiveMembership) rather than only the OWNER membership — this is what lets a
 * BRANCH_MANAGER / STAFF member authenticate into a working merchant session. Per-
 * request role + branch scope are resolved separately by resolveMerchantContext on
 * each guarded route (NOT stored in the JWT/session, which keeps its
 * `{ sub, role:'merchant', deviceId, sessionId }` shape), so enabling non-owner
 * login only exposes the deliberately-migrated PR-B route set + the two † routes,
 * which all now carry their guard. getActiveMembership throws
 * MULTI_MEMBERSHIP_UNSUPPORTED for a >1-active-membership person (multi-merchant
 * deferred). The SEC-M2 suspended throw is preserved below.
 *
 * Throws INVALID_CREDENTIALS when the admin has no active membership (or its joined
 * merchant is absent).
 */
async function resolveMerchantInfo(
  prisma: PrismaClient,
  adminId: string
): Promise<{ merchantId: string; status: string; businessName: string }> {
  const membership = await getActiveMembership(prisma, adminId)
  if (!membership?.merchant) throw new AppError('INVALID_CREDENTIALS')
  return { merchantId: membership.merchantId, status: membership.merchant.status, businessName: membership.merchant.businessName }
}

export async function loginMerchant(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { email: string; password: string; deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken?: string; refreshToken?: string; merchant?: object; status?: string; sessionChallenge?: string }> {
  const admin = await prisma.merchantAdmin.findUnique({
    where: { email: data.email },
  })

  if (!admin || !admin.passwordHash) throw new AppError('INVALID_CREDENTIALS')

  const valid = await verifyPassword(data.password, admin.passwordHash)
  if (!valid) {
    writeAuditLog(prisma, { entityId: admin.id, entityType: 'merchant', event: 'AUTH_LOGIN_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('INVALID_CREDENTIALS')
  }

  // M6b (D-1): resolve the merchant via the MerchantMembership source of truth,
  // NOT the (dropped) MerchantAdmin.merchant relation / merchantId column.
  const merchantInfo = await resolveMerchantInfo(prisma, admin.id)

  // Status checks after password verification
  if (merchantInfo.status === 'SUSPENDED') throw new AppError('MERCHANT_SUSPENDED')
  if (merchantInfo.status === 'INACTIVE')  throw new AppError('MERCHANT_DEACTIVATED')
  if (admin.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED')

  // M1 Slice R: block sign-in until the email is verified. Placed AFTER the status
  // checks so suspension/deactivation take precedence (spec Section 6.1). Self-
  // registered owners start unverified (flip true on email-verify); claimed/seeded
  // owners are pre-verified by the migration backfill, so this never locks them out.
  if (!admin.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED')

  // Check known devices (stored as JSON list in Redis)
  const knownRaw = await redis.get(`known-devices:merchant:${admin.id}`)
  const knownDevices: string[] = knownRaw ? JSON.parse(knownRaw) : []

  if (otpRequired(admin, data.deviceId, knownDevices)) {
    const challenge = generateSecureToken(16)

    // M1 Slice 0: generate a real 6-digit code, store only its challenge-bound
    // HMAC (never the code itself, even in Redis), and email it via the outbox.
    // The HMAC is keyed by ENCRYPTION_KEY and bound to THIS challenge so a code is
    // meaningless against any other challenge. `attempts` caps brute force in
    // verifyMerchantOtp. Replaces the dark Twilio path.
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const codeHmac = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
      .update(challenge + ':' + code)
      .digest('hex')

    await redis.set(
      RedisKey.otpChallenge('merchant', challenge),
      JSON.stringify({ adminId: admin.id, deviceId: data.deviceId, deviceType: data.deviceType, codeHmac, attempts: 0 }),
      'EX', OTP_CHALLENGE_TTL
    )

    // Deliver the code through the outbox (dark by default). Best-effort: a
    // delivery failure must never change the response (no enumeration). The code
    // is NEVER logged or returned; only the session challenge goes to the client.
    try {
      const { notify } = await import('../../shared/notify')
      const { merchantOtpEmail } = await import('../../shared/emailTemplates')
      await notify(prisma, redis, {
        to: admin.email,
        recipientType: 'MERCHANT_ADMIN',
        recipientId: admin.id,
        userId: null,
        type: 'merchant_login_otp',
        email: merchantOtpEmail(code),
        ip: data.ipAddress ?? null,
      })
    } catch {
      // swallow: never reveal a delivery failure
    }

    return { status: 'OTP_REQUIRED', sessionChallenge: challenge }
  }

  return completeMerchantLogin(prisma, redis, app, admin, merchantInfo, data, knownDevices)
}

export async function verifyMerchantOtp(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { sessionChallenge: string; code: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; merchant: object }> {
  const key = RedisKey.otpChallenge('merchant', data.sessionChallenge)
  const raw = await redis.get(key)
  if (!raw) throw new AppError('ACTION_TOKEN_INVALID')

  const { adminId, deviceId, deviceType, codeHmac, attempts } = JSON.parse(raw) as {
    adminId: string; deviceId: string; deviceType: string; codeHmac?: string; attempts?: number
  }

  // M1 Slice 0: verify the submitted code against the challenge-bound HMAC stored
  // at login. We must NOT delete the challenge on a wrong code; increment
  // `attempts` (KEEPTTL so the 10-minute window is unchanged) and only delete once
  // the per-challenge cap is reached, so an attacker gets a hard ceiling, not
  // unlimited guesses against one live challenge. The `000000` dev bypass works in
  // dev/test ONLY (allowlist, not `!== production`) so unset/staging fails CLOSED.
  const devBypass =
    MERCHANT_OTP_DEV_BYPASS_ENVS.has(process.env.NODE_ENV ?? '') &&
    data.code === MERCHANT_DEV_OTP_BYPASS_CODE

  let match = devBypass
  if (!match && codeHmac) {
    const submittedHmac = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
      .update(data.sessionChallenge + ':' + data.code)
      .digest('hex')
    match =
      submittedHmac.length === codeHmac.length &&
      crypto.timingSafeEqual(Buffer.from(submittedHmac, 'hex'), Buffer.from(codeHmac, 'hex'))
  }

  if (!match) {
    const next = (attempts ?? 0) + 1
    if (next >= MERCHANT_OTP_MAX_ATTEMPTS) {
      await redis.del(key)
    } else {
      await redis.set(
        key,
        JSON.stringify({ adminId, deviceId, deviceType, codeHmac, attempts: next }),
        'KEEPTTL'
      )
    }
    throw new AppError('OTP_INVALID')
  }

  // Match: single-use, consume the challenge before issuing tokens.
  await redis.del(key)

  const admin = await prisma.merchantAdmin.findUnique({
    where: { id: adminId },
  })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  // Mark OTP verified + add device
  await prisma.merchantAdmin.update({
    where: { id: admin.id },
    data: { otpVerifiedAt: new Date() },
  })

  const knownRaw = await redis.get(`known-devices:merchant:${admin.id}`)
  const knownDevices: string[] = knownRaw ? JSON.parse(knownRaw) : []
  if (!knownDevices.includes(deviceId)) knownDevices.push(deviceId)
  await redis.set(`known-devices:merchant:${admin.id}`, JSON.stringify(knownDevices), 'EX', 7776000)

  // M6b (D-1): resolve the merchant via membership (NOT admin.merchant).
  const merchantInfo = await resolveMerchantInfo(prisma, admin.id)
  return completeMerchantLogin(prisma, redis, app, admin, merchantInfo, {
    deviceId, deviceType, ipAddress: data.ipAddress, userAgent: data.userAgent,
  }, knownDevices)
}

async function completeMerchantLogin(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  admin: any,
  // M6b (D-1): the merchant is resolved via MerchantMembership by the caller
  // (login/OTP), NOT the dropped MerchantAdmin.merchant relation / merchantId.
  merchantInfo: { merchantId: string; status: string; businessName: string },
  data: { deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string },
  _knownDevices: string[]
): Promise<{ accessToken: string; refreshToken: string; merchant: object }> {
  const sessionId  = generateSessionId()
  const rawRefresh = generateRefreshToken()
  const tokenHash  = hashRefreshToken(rawRefresh)

  await storeRefreshToken(redis, {
    role: 'merchant', entityId: admin.id, sessionId,
    tokenHash, deviceId: data.deviceId, deviceType: data.deviceType,
  })

  await writeUserSession(prisma, {
    entityId: admin.id, entityType: 'merchant', sessionId,
    deviceId: data.deviceId, deviceType: data.deviceType,
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  await redis.set(
    RedisKey.authMerchant(admin.id),
    JSON.stringify({
      merchantId: merchantInfo.merchantId,
      approvalStatus: merchantInfo.status,
      isSuspended: merchantInfo.status === 'SUSPENDED',
    }),
    'EX', 3600
  )

  const accessToken = app.jwt.merchant.sign(
    { sub: admin.id, role: 'merchant', deviceId: data.deviceId, sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  writeAuditLog(prisma, {
    entityId: admin.id, entityType: 'merchant', event: 'AUTH_LOGIN_SUCCESS',
    ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId,
  })

  return {
    accessToken,
    refreshToken: rawRefresh,
    merchant: {
      id: merchantInfo.merchantId,
      businessName: merchantInfo.businessName,
      approvalStatus: merchantInfo.status,
    },
  }
}

export async function refreshMerchantToken(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { refreshToken: string; sessionId: string; entityId: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string }> {
  const key    = RedisKey.refreshToken('merchant', data.entityId, data.sessionId)
  const stored = await redis.get(key)

  if (!stored || !validateRefreshToken(stored, data.refreshToken)) {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'merchant', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  // SEC-M2 (M6a): refuse to renew a SUSPENDED merchant's session — live DB read
  // via the membership source of truth (NOT the MerchantAdmin.merchantId column;
  // that reroute is M6b). Lenient: only an explicitly suspended merchant is
  // refused. Status is joined by getActiveMembership — no extra query.
  //
  // Staff & Access PR-B B8 (review FIX 1): resolved via getActiveMembership (ANY
  // active role) rather than getOwnerMembership (OWNER-only). After the B8 cutover a
  // non-owner (BRANCH_MANAGER / STAFF) member has a live merchant session, and
  // getOwnerMembership returns null for them (it filters role:'OWNER'), which SKIPPED
  // the suspended throw and let a suspended merchant's non-owner staff refresh forever.
  // getActiveMembership joins merchant.status for any role, so the suspended gate now
  // fires for owners AND non-owners alike. A person with >1 active membership throws
  // MULTI_MEMBERSHIP_UNSUPPORTED here (multi-merchant deferred), matching login.
  const membership = await getActiveMembership(prisma, data.entityId)
  if (membership?.merchant?.status === 'SUSPENDED') {
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'merchant', event: 'AUTH_REFRESH_FAILED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('MERCHANT_SUSPENDED')
  }

  const parsed     = JSON.parse(stored)

  // §3.1 (backend logout-durability design, merchant-only): the previous
  // `redis.del(key)` + `storeRefreshToken(...)` pair ran as two separate
  // commands, leaving a window where a concurrent `logoutMerchant` DEL could
  // land BETWEEN the del and the set and resurrect the session (design §3.5
  // CO-SHIP dependency). Replaced with a single atomic Lua compare-and-rotate:
  // it re-verifies the token still matches at rotation time and, on match,
  // atomically SETs the complete replacement — no del-then-set window exists
  // for a concurrent logout to interleave into. See
  // src/api/auth/merchant/atomicRotate.ts.
  const newRefresh = generateRefreshToken()
  const newHash    = hashRefreshToken(newRefresh)
  const replacementValue = JSON.stringify({
    tokenHash:  newHash,
    deviceId:   parsed.deviceId,
    deviceType: parsed.deviceType,
    deviceName: parsed.deviceName,
    createdAt:  new Date().toISOString(),
  })

  const rotated = await rotateMerchantRefreshTokenAtomic(redis, {
    entityId: data.entityId, sessionId: data.sessionId,
    expectedHash: hashRefreshToken(data.refreshToken),
    replacementValue, ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
  })

  if (!rotated.ok) {
    // §3.2: a 'revoked' refusal means a pending-revocation tombstone from an
    // earlier bounded-failure logout (§3.4) enforced itself here — the pull-
    // based durable owner. Any other refusal (missing/mismatch/corrupt) is the
    // ordinary "token no longer valid" case.
    const event = rotated.reason === 'revoked' ? 'AUTH_REFRESH_REFUSED_REVOKED' : 'AUTH_REFRESH_FAILED'
    writeAuditLog(prisma, { entityId: data.entityId, entityType: 'merchant', event, ipAddress: data.ipAddress, userAgent: data.userAgent })
    throw new AppError('REFRESH_TOKEN_INVALID')
  }

  await prisma.userSession.updateMany({
    where: { sessionId: data.sessionId },
    data:  { lastActiveAt: new Date() },
  })

  const accessToken = app.jwt.merchant.sign(
    { sub: data.entityId, role: 'merchant', deviceId: parsed.deviceId, sessionId: data.sessionId },
    { expiresIn: ACCESS_TOKEN_TTL }
  )

  return { accessToken, refreshToken: newRefresh }
}

export type MerchantLogoutRevokeOutcome = 'confirmed' | 'pending' | 'unavailable' | 'stale'

/**
 * Merchant logout (backend logout-durability design §3.3/§3.4, merchant-only).
 *
 * NOT gated by `authenticateMerchant` — an already-expired access token must
 * still authorize a logout (§3.3's explicit expired-token policy: expiry is
 * ignored for logout because a validly-signed even-expired token proves the
 * caller held THIS session, and logout is strictly lower-risk than API
 * access). The route instead calls this function directly with whatever
 * proof material the caller presents.
 *
 * Proof precedence:
 *   1. SIGNED access-token JWT (primary, authoritative). Verified with
 *      `ignoreExpiration: true` + `algorithms: ['HS256']` (pinned — forecloses
 *      alg-confusion even though fast-jwt already rejects `alg:none` /
 *      asymmetric here). `entityId`/`sessionId` are read from the SIGNED
 *      claims, NEVER the raw body — a tampered/forged body cannot revoke or
 *      audit-attribute another merchant's session. A validly-signed token
 *      missing `sub`/`sessionId`, or one whose `role` claim isn't `'merchant'`,
 *      is NOT treated as signed proof (falls through to the fallback).
 *   2. Fallback (rare — no access token at all): refresh-token POSSESSION.
 *      Validates the presented refresh token's hash against the currently
 *      stored value and DELs on match; a stale/mismatched secret is a no-op
 *      (disclosed residual — design §3.5).
 *   3. No proof at all: pure no-op. Uniform with a proof-bearing revoke of an
 *      already-absent key (no session-existence oracle, §3.3 F6).
 *
 * Side effects (authMerchant cache invalidation + AUTH_LOGOUT audit row) are
 * gated ONLY on a PROVEN identity (signed verification succeeding, or the
 * fallback's hash actually matching) — never on the raw/unforced body — so a
 * forged or stale request cannot thrash another merchant's cache or write a
 * false-attribution audit row (§3.3 F3).
 */
export async function logoutMerchant(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: {
    accessToken?: string
    refreshToken?: string
    sessionId?: string
    entityId?: string
    ipAddress: string
    userAgent: string
  }
): Promise<{ revoke: MerchantLogoutRevokeOutcome }> {
  let proven: { entityId: string; sessionId: string } | null = null

  if (data.accessToken) {
    try {
      const claims = app.jwt.merchant.verify(data.accessToken, {
        ignoreExpiration: true,
        algorithms: ['HS256'],
      }) as { sub?: unknown; role?: unknown; sessionId?: unknown }
      if (claims?.role === 'merchant' && typeof claims.sub === 'string' && typeof claims.sessionId === 'string') {
        proven = { entityId: claims.sub, sessionId: claims.sessionId }
      }
    } catch {
      // Invalid signature / malformed token — proven stays null, falls
      // through to the possession fallback (never throws: logout must
      // always reach a locally-clean state on the caller's side).
    }
  }

  if (proven) {
    const outcome = await revokeMerchantSessionUnconditional(redis, proven)
    await redis.del(RedisKey.authMerchant(proven.entityId))
    writeAuditLog(prisma, {
      entityId: proven.entityId, entityType: 'merchant', event: 'AUTH_LOGOUT',
      ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: proven.sessionId,
    })
    if (outcome === 'pending') {
      writeAuditLog(prisma, {
        entityId: proven.entityId, entityType: 'merchant', event: 'AUTH_LOGOUT_REVOKE_PENDING',
        ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: proven.sessionId,
      })
    } else if (outcome === 'unavailable') {
      writeAuditLog(prisma, {
        entityId: proven.entityId, entityType: 'merchant', event: 'AUTH_LOGOUT_REVOKE_UNAVAILABLE',
        ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: proven.sessionId,
      })
    }
    return { revoke: outcome }
  }

  if (data.refreshToken && data.sessionId && data.entityId) {
    const outcome = await revokeMerchantSessionByPossession(redis, {
      entityId: data.entityId, sessionId: data.sessionId, presentedRefreshToken: data.refreshToken,
    })
    if (outcome === 'confirmed') {
      await redis.del(RedisKey.authMerchant(data.entityId))
      writeAuditLog(prisma, {
        entityId: data.entityId, entityType: 'merchant', event: 'AUTH_LOGOUT',
        ipAddress: data.ipAddress, userAgent: data.userAgent, sessionId: data.sessionId,
      })
    }
    return { revoke: outcome }
  }

  // No proof at all — pure no-op, uniform with a proof-bearing revoke of an
  // already-absent key (§3.3 F6: no session-existence oracle).
  return { revoke: 'confirmed' }
}

export async function forgotPasswordMerchant(
  prisma: PrismaClient,
  redis: Redis,
  email: string,
  ip?: string | null
): Promise<void> {
  // SEC-H4 + §SEC.1: rate-limit BEFORE the lookup and for EVERY request, so
  // existing and non-existing emails are treated identically (no enumeration).
  // One ATOMIC check-and-count (victim = per-email caps, abuser = per-IP cap).
  await consumePwdResetAttempt(redis, { email, ip })

  const admin = await prisma.merchantAdmin.findUnique({ where: { email } })
  if (!admin) return

  const token = generateSecureToken(32)
  await redis.set(RedisKey.passwordReset('merchant', token), admin.id, 'EX', PWD_RESET_TTL)

  // PR-0.4: deliver the reset link through the outbox (dark by default). Token
  // never logged (SEC-H1). userId is null — a MerchantAdmin is not a User.
  // Best-effort so a delivery failure can't change the anti-enumeration return.
  try {
    const { notify } = await import('../../shared/notify')
    const { passwordResetEmail, buildPasswordResetLink } = await import('../../shared/emailTemplates')
    await notify(prisma, redis, {
      to: email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: admin.id,
      userId: null,
      type: 'password_reset',
      email: passwordResetEmail(buildPasswordResetLink('merchant', token)),
      ip: ip ?? null,
    })
  } catch {
    // swallow — never reveal a delivery failure (no enumeration)
  }
}

export async function resetPasswordMerchant(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key     = RedisKey.passwordReset('merchant', data.token)
  const adminId = await redis.get(key)
  if (!adminId) throw new AppError('RESET_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  // M1 Slice R: a consumed reset token proves email control (the link reached the
  // owner's inbox), so mark emailVerified true. Without this a never-verified shell
  // that recovers via reset would set a passwordHash but stay blocked by the login
  // emailVerified gate, bricking the account.
  await prisma.merchantAdmin.update({ where: { id: adminId }, data: { passwordHash, emailVerified: true } })
  await redis.del(key)

  await revokeAllSessionsForEntity(redis, { role: 'merchant', entityId: adminId })
  await revokeAllUserSessionRecords(prisma, { entityId: adminId, entityType: 'merchant', reason: 'PASSWORD_RESET' })
  await redis.del(RedisKey.authMerchant(adminId))

  writeAuditLog(prisma, { entityId: adminId, entityType: 'merchant', event: 'AUTH_PASSWORD_RESET', ipAddress: data.ipAddress, userAgent: data.userAgent })
}

/**
 * Issue a draft-owner claim: store a single-use claim token (7-day TTL) keyed to
 * the owner admin, and queue the "set up your account" email via the notify
 * outbox (dark-safe). Best-effort — a delivery/enqueue failure must NOT fail the
 * already-committed draft. The token is NEVER returned to the caller or logged
 * (SEC-H1) — it reaches the owner only through the email.
 */
export async function issueMerchantClaim(
  prisma: PrismaClient,
  redis: Redis,
  data: { adminId: string; email: string; ip?: string | null }
): Promise<void> {
  const token = generateSecureToken(32)

  // Supersession (PR-B review FIX A): a re-issue (resend / re-invite-after-remove)
  // must mint a FRESH token AND invalidate the prior one. Claim tokens are stored
  // by token-key only, so without a per-admin pointer the old token would stay
  // valid for the full 7-day TTL alongside the new one. Read the current pointer,
  // delete the prior token if present, then store the new token + re-point.
  const priorToken = await redis.get(RedisKey.merchantClaimCurrent(data.adminId))
  if (priorToken) await redis.del(RedisKey.merchantClaim(priorToken))

  await redis.set(RedisKey.merchantClaim(token), data.adminId, 'EX', CLAIM_TTL)
  await redis.set(RedisKey.merchantClaimCurrent(data.adminId), token, 'EX', CLAIM_TTL)

  try {
    const { notify } = await import('../../shared/notify')
    const { claimAccountEmail, buildClaimLink } = await import('../../shared/emailTemplates')
    await notify(prisma, redis, {
      to: data.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: data.adminId,
      userId: null,
      type: 'merchant_claim',
      email: claimAccountEmail(buildClaimLink(token)),
      ip: data.ip ?? null,
    })
  } catch {
    // best-effort: the token is stored; delivery is dark/queued anyway.
  }
}

/**
 * Draft-owner claim: the owner sets their own password via the single-use token
 * emailed at draft creation. Sets passwordHash, CLEARS mustChangePassword, and
 * SETS otpVerifiedAt (interim proof-of-ownership — the emailed link proves email
 * control; phone OTP/Twilio is not wired). Single-use: the token is deleted.
 * Intentionally does NOT touch the unknown-device OTP path — a first browser
 * login still requires device OTP (deferred to the Twilio/portal work).
 */
export async function claimMerchantAccount(
  prisma: PrismaClient,
  redis: Redis,
  data: { token: string; newPassword: string; ipAddress: string; userAgent: string }
): Promise<void> {
  if (!validatePasswordPolicy(data.newPassword)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const key     = RedisKey.merchantClaim(data.token)
  const adminId = await redis.get(key)
  if (!adminId) throw new AppError('CLAIM_TOKEN_EXPIRED')

  const passwordHash = await hashPassword(data.newPassword)
  await prisma.merchantAdmin.update({
    where: { id: adminId },
    // M1 Slice R: the emailed claim link proves email control, so the claim also
    // marks the owner email-verified (clears the new login emailVerified gate).
    data:  { passwordHash, mustChangePassword: false, otpVerifiedAt: new Date(), emailVerified: true },
  })
  // Single-use — reuse hits CLAIM_TOKEN_EXPIRED. PR-B review FIX A: also clear the
  // per-admin current-token pointer so a stale pointer can't keep a dead token's
  // identity around (and a future re-issue starts clean with no prior to delete).
  await redis.del(key)
  await redis.del(RedisKey.merchantClaimCurrent(adminId))

  writeAuditLog(prisma, {
    entityId: adminId, entityType: 'merchant', event: 'MERCHANT_CLAIM_COMPLETED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })
}

// M1 Slice R: store a merchant email-verify challenge (real OR decoy). A decoy
// passes a random codeHmac that no emailed code can match, so /register/verify
// returns OTP_INVALID on a decoy exactly as on a fresh-but-wrong code: closes the
// error-code enumeration oracle (a missing row would otherwise yield a distinct
// VERIFICATION_TOKEN_INVALID).
async function storeMerchantVerifyChallenge(
  redis: Redis,
  challenge: string,
  adminId: string,
  deviceId: string,
  deviceType: string,
  codeHmac: string
): Promise<void> {
  await redis.set(
    RedisKey.merchantEmailVerify(challenge),
    JSON.stringify({ adminId, deviceId, deviceType, codeHmac, attempts: 0 }),
    'EX', EMAIL_VERIFY_TTL
  )
}

// Best-effort merchant-auth email send (dark-safe). Swallows so a delivery failure
// never changes the response or reveals account existence.
async function sendMerchantAuthEmail(
  prisma: PrismaClient,
  redis: Redis,
  params: { to: string; recipientId: string; type: string; email: RenderedEmail; ip?: string | null }
): Promise<void> {
  try {
    const { notify } = await import('../../shared/notify')
    await notify(prisma, redis, {
      to: params.to, recipientType: 'MERCHANT_ADMIN', recipientId: params.recipientId,
      userId: null, type: params.type, email: params.email, ip: params.ip ?? null,
    })
  } catch {
    // best-effort: never reveal a delivery failure
  }
}

/**
 * M1 Slice R: self-serve merchant registration. PUBLIC endpoint. Non-enumerating
 * across BOTH the response and the follow-up /register/verify step:
 *  - A FRESH email creates Merchant(REGISTERED) + MerchantAdmin(emailVerified:false)
 *    + OWNER MerchantMembership atomically, stores a real 6-digit email-verify
 *    challenge (HMAC, never the code), and emails the code.
 *  - A duplicate VERIFIED email creates nothing, stores a DECOY challenge (random
 *    HMAC that never verifies), and emails the real holder an "account exists" notice.
 *  - A duplicate UNVERIFIED email (abandoned signup / hit the attempt cap) RECOVERS:
 *    it re-issues a real verify challenge + code to the same admin so the account is
 *    not permanently bricked.
 * All three return the identical { VERIFY_EMAIL_SENT, sessionChallenge } shape and,
 * because every path stores a challenge row, /register/verify returns OTP_INVALID
 * for all of them. Password is hashed UNCONDITIONALLY before the existence check so
 * the dominant (~bcrypt) cost is equal on every path (no timing oracle). Cloudflare
 * Turnstile is checked first (no-op when CAPTCHA_ENABLED is off).
 */
export async function registerMerchant(
  prisma: PrismaClient,
  redis: Redis,
  data: {
    firstName: string; lastName: string; email: string; password: string; businessName: string;
    mobile?: string; mobileCountryCode?: string;
    deviceId: string; deviceType: string; turnstileToken: string; ipAddress: string; userAgent: string
  }
): Promise<{ status: 'VERIFY_EMAIL_SENT'; sessionChallenge: string }> {
  // 1. Human check (no network call / no-op when CAPTCHA_ENABLED is off).
  const { verifyTurnstile } = await import('../../shared/turnstile')
  if (!(await verifyTurnstile(data.turnstileToken, data.ipAddress))) throw new AppError('CAPTCHA_FAILED')

  // 2. Password policy (defence in depth; the route also enforces it).
  if (!validatePasswordPolicy(data.password)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  // 3. Hash UNCONDITIONALLY, before the existence check, so the fresh and duplicate
  //    paths pay the same dominant (~bcrypt) cost: closes the timing enumeration
  //    oracle. The fresh path's extra transaction (~ms) is within network jitter.
  const passwordHash = await hashPassword(data.password)

  // 4. A verify challenge + 6-digit code (store only the HMAC, never the code).
  const challenge = generateSecureToken(16)
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeHmac = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
    .update(challenge + ':' + code)
    .digest('hex')

  const existing = await prisma.merchantAdmin.findUnique({
    where: { email: data.email },
    select: { id: true, emailVerified: true },
  })

  if (existing) {
    if (existing.emailVerified) {
      // Verified account: never reveal. DECOY challenge (random HMAC) so verify is
      // indistinguishable; email the real holder an "account exists" notice. The
      // challenge adminId is the non-resolvable 'decoy' (NOT the real id) so that
      // even the dev/test 000000 bypass cannot use it to auto-login as the existing
      // account: on a match the subsequent findUnique({id:'decoy'}) returns null and
      // throws INVALID_CREDENTIALS. (recipientId on the email is still the real id so
      // the notice + its CommunicationLog are correctly attributed.)
      await storeMerchantVerifyChallenge(redis, challenge, 'decoy', data.deviceId, data.deviceType, crypto.randomBytes(32).toString('hex'))
      await sendMerchantAuthEmail(prisma, redis, { to: data.email, recipientId: existing.id, type: 'merchant_account_exists', email: merchantAccountExistsEmail(), ip: data.ipAddress })
    } else {
      // Unverified existing account: RECOVER it. Re-issue a real verify challenge +
      // code to the same admin (observably identical to a fresh signup, so it leaks
      // nothing, and it un-bricks an abandoned / attempt-capped registration).
      await storeMerchantVerifyChallenge(redis, challenge, existing.id, data.deviceId, data.deviceType, codeHmac)
      await sendMerchantAuthEmail(prisma, redis, { to: data.email, recipientId: existing.id, type: 'merchant_email_verify', email: merchantVerifyEmail(code), ip: data.ipAddress })
    }
    return { status: 'VERIFY_EMAIL_SENT', sessionChallenge: challenge }
  }

  let adminId: string
  try {
    adminId = await prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.create({
        data: { businessName: data.businessName, status: 'REGISTERED' },
        select: { id: true },
      })
      const admin = await tx.merchantAdmin.create({
        data: {
          email: data.email, firstName: data.firstName, lastName: data.lastName,
          phone: data.mobile ?? null, phoneCountryCode: data.mobileCountryCode ?? null,
          passwordHash, mustChangePassword: false, emailVerified: false, status: 'ACTIVE',
        },
        select: { id: true },
      })
      await tx.merchantMembership.create({
        data: { merchantId: merchant.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' },
      })
      await writeAuditLogTx(tx, {
        entityId: merchant.id, entityType: 'merchant', event: 'MERCHANT_SELF_REGISTERED',
        actorId: admin.id, actorType: 'MERCHANT_ADMIN',
        ipAddress: data.ipAddress, userAgent: data.userAgent,
        // M1: platform-terms consent is recorded in the audit trail (no schema column).
        metadata: { termsAccepted: true, termsVersion: TERMS_VERSION },
      })
      return admin.id
    })
  } catch (e) {
    // A concurrent signup raced the @unique email. The transaction rolled back (no
    // orphan merchant). Store a DECOY challenge so /register/verify is still
    // indistinguishable, then return the generic shape.
    if ((e as { code?: string })?.code === 'P2002') {
      await storeMerchantVerifyChallenge(redis, challenge, 'decoy', data.deviceId, data.deviceType, crypto.randomBytes(32).toString('hex'))
      return { status: 'VERIFY_EMAIL_SENT', sessionChallenge: challenge }
    }
    throw e
  }

  await storeMerchantVerifyChallenge(redis, challenge, adminId, data.deviceId, data.deviceType, codeHmac)
  await sendMerchantAuthEmail(prisma, redis, { to: data.email, recipientId: adminId, type: 'merchant_email_verify', email: merchantVerifyEmail(code), ip: data.ipAddress })

  return { status: 'VERIFY_EMAIL_SENT', sessionChallenge: challenge }
}

/**
 * M1 Slice R: complete self-serve registration by verifying the emailed 6-digit
 * code (same HMAC + per-challenge attempt-cap model as login OTP). On success it
 * flips emailVerified + otpVerifiedAt true, seeds the device, and AUTO-LOGS-IN
 * (issues tokens) so the owner lands straight in the portal. A missing/expired
 * challenge throws VERIFICATION_TOKEN_INVALID; a wrong code throws OTP_INVALID.
 */
export async function verifyMerchantEmail(
  prisma: PrismaClient,
  redis: Redis,
  app: any,
  data: { sessionChallenge: string; code: string; ipAddress: string; userAgent: string }
): Promise<{ accessToken: string; refreshToken: string; merchant: object }> {
  const key = RedisKey.merchantEmailVerify(data.sessionChallenge)
  const raw = await redis.get(key)
  if (!raw) throw new AppError('VERIFICATION_TOKEN_INVALID')

  const { adminId, deviceId, deviceType, codeHmac, attempts } = JSON.parse(raw) as {
    adminId: string; deviceId: string; deviceType: string; codeHmac?: string; attempts?: number
  }

  const devBypass =
    MERCHANT_OTP_DEV_BYPASS_ENVS.has(process.env.NODE_ENV ?? '') &&
    data.code === MERCHANT_DEV_OTP_BYPASS_CODE

  let match = devBypass
  if (!match && codeHmac) {
    const submittedHmac = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
      .update(data.sessionChallenge + ':' + data.code)
      .digest('hex')
    match =
      submittedHmac.length === codeHmac.length &&
      crypto.timingSafeEqual(Buffer.from(submittedHmac, 'hex'), Buffer.from(codeHmac, 'hex'))
  }

  if (!match) {
    const next = (attempts ?? 0) + 1
    if (next >= MERCHANT_OTP_MAX_ATTEMPTS) {
      await redis.del(key)
    } else {
      await redis.set(
        key,
        JSON.stringify({ adminId, deviceId, deviceType, codeHmac, attempts: next }),
        'KEEPTTL'
      )
    }
    throw new AppError('OTP_INVALID')
  }

  await redis.del(key)

  const admin = await prisma.merchantAdmin.findUnique({ where: { id: adminId } })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  // Verifying the emailed code proves email control: flip emailVerified + mark the
  // device OTP-verified so the auto-login (and future logins on this device) skip
  // the device-OTP step.
  await prisma.merchantAdmin.update({
    where: { id: admin.id },
    data: { emailVerified: true, otpVerifiedAt: new Date() },
  })

  writeAuditLog(prisma, {
    entityId: admin.id, entityType: 'merchant', event: 'MERCHANT_EMAIL_VERIFIED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
  })

  const knownRaw = await redis.get(`known-devices:merchant:${admin.id}`)
  const knownDevices: string[] = knownRaw ? JSON.parse(knownRaw) : []
  if (!knownDevices.includes(deviceId)) knownDevices.push(deviceId)
  await redis.set(`known-devices:merchant:${admin.id}`, JSON.stringify(knownDevices), 'EX', 7776000)

  const merchantInfo = await resolveMerchantInfo(prisma, admin.id)
  return completeMerchantLogin(prisma, redis, app, admin, merchantInfo, {
    deviceId, deviceType, ipAddress: data.ipAddress, userAgent: data.userAgent,
  }, knownDevices)
}

/**
 * M1 Slice R: re-issue the registration verify code, bound to the SAME challenge
 * (so the client keeps its verify session). Anti-enumeration: a missing/invalid
 * challenge, an already-verified account, or a vanished admin all return void with
 * no signal. Re-issuing resets the attempt counter and refreshes the TTL.
 */
export async function resendMerchantVerification(
  prisma: PrismaClient,
  redis: Redis,
  data: { sessionChallenge: string; ipAddress?: string | null }
): Promise<void> {
  const key = RedisKey.merchantEmailVerify(data.sessionChallenge)
  const raw = await redis.get(key)
  if (!raw) return

  const { adminId, deviceId, deviceType } = JSON.parse(raw) as { adminId: string; deviceId: string; deviceType: string }
  const admin = await prisma.merchantAdmin.findUnique({ where: { id: adminId }, select: { email: true, emailVerified: true } })
  if (!admin || admin.emailVerified) return

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeHmac = crypto
    .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
    .update(data.sessionChallenge + ':' + code)
    .digest('hex')
  await redis.set(
    key,
    JSON.stringify({ adminId, deviceId, deviceType, codeHmac, attempts: 0 }),
    'EX', EMAIL_VERIFY_TTL
  )

  try {
    const { notify } = await import('../../shared/notify')
    const { merchantVerifyEmail } = await import('../../shared/emailTemplates')
    await notify(prisma, redis, {
      to: admin.email, recipientType: 'MERCHANT_ADMIN', recipientId: adminId, userId: null,
      type: 'merchant_email_verify', email: merchantVerifyEmail(code), ip: data.ipAddress ?? null,
    })
  } catch {
    // best-effort: never reveal a delivery failure
  }
}
