export const RedisKey = {
  // Auth permission cache
  authCustomer:        (userId: string)          => `auth:customer:${userId}`,
  authMerchant:        (merchantAdminId: string)  => `auth:merchant:${merchantAdminId}`,
  authBranch:          (branchUserId: string)     => `auth:branch:${branchUserId}`,
  authAdmin:           (adminUserId: string)      => `auth:admin:${adminUserId}`,

  // Refresh tokens
  refreshToken:        (role: string, entityId: string, sessionId: string) =>
                         `refresh:${role}:${entityId}:${sessionId}`,

  // Merchant logout-durability (backend design 2026-07-06 §3.2/§3.4): pending-
  // revocation tombstone. Written ONLY when a signed-JWT logout's unconditional
  // DEL of the refresh-token key could not be confirmed (bounded retry
  // exhausted); the merchant refresh Lua checks + self-deletes it on the NEXT
  // refresh attempt for that session (pull-based durable enforcement — no new
  // worker/infra). TTL = REFRESH_TOKEN_TTL_SECONDS so it always outlives any
  // straddling refresh token. Merchant-only for now (see
  // src/api/auth/merchant/atomicRotate.ts); a future cross-role convergence
  // would reuse this same key shape for other roles.
  sessionRevoked:      (role: string, entityId: string, sessionId: string) =>
                         `session-revoked:${role}:${entityId}:${sessionId}`,

  // Active mobile sessions (for single-session enforcement)
  activeMobileSession: (role: string, entityId: string) =>
                         `sessions:mobile:${role}:${entityId}`,

  // OTP
  otp:                 (role: string, entityId: string) => `otp:${role}:${entityId}`,
  otpLock:             (role: string, entityId: string) => `otp:lock:${role}:${entityId}`,
  otpSendCount:        (phone: string)            => `otp:send:${phone}`,
  otpAction:           (userId: string, action: string) => `otp:action:${userId}:${action}`,

  // Email verification
  emailVerify:         (token: string)            => `email-verify:${token}`,
  emailChange:         (token: string)            => `email-change:${token}`,

  // Phone verification (during registration)
  phoneVerifyPending:  (userId: string)           => `phone-verify:${userId}`,

  // Password reset
  passwordReset:       (role: string, token: string) => `pwd-reset:${role}:${token}`,
  // Merchant draft-owner claim token (set-password). Value = merchantAdminId. 7-day TTL.
  merchantClaim:       (token: string)               => `merchant-claim:${token}`,
  // Per-admin pointer to the CURRENT live claim token (set-password). Value = the
  // token. Lets a re-issue (resend / re-invite-after-remove) SUPERSEDE the prior
  // token: issueMerchantClaim reads this, deletes the prior merchantClaim(token),
  // then re-points it at the fresh token. Without it a re-issue would leave BOTH
  // tokens valid for the full 7-day TTL. 7-day TTL (mirrors the token).
  merchantClaimCurrent: (adminId: string)            => `merchant-claim-current:${adminId}`,
  // M1 Slice R: merchant self-serve registration email-verify challenge. Value =
  // JSON {adminId, deviceId, deviceType, codeHmac, attempts}. Role-scoped (NOT the
  // customer `email-verify:` namespace) so a merchant token can never be consumed
  // by the customer verify endpoint, and vice versa. 24h TTL.
  merchantEmailVerify: (challenge: string)           => `merchant-email-verify:${challenge}`,

  // BranchUser first-login temp token
  branchTempToken:     (token: string)            => `branch-temp:${token}`,

  // Merchant OTP session challenge
  otpChallenge:        (role: string, token: string) => `otp-challenge:${role}:${token}`,

  // Rate limiting counters.
  // SEC-H3 (Gate-PR-7): per-phone keys take a HASHED phone (see smsLimiter.hashPhone)
  // so raw phone numbers never appear in Redis key listings or logs.
  rateLimitOtpSend:        (phoneHash: string)        => `rl:otp:${phoneHash}`,         // per-phone hourly
  rateLimitOtpSendDay:     (phoneHash: string)        => `rl:otp:day:${phoneHash}`,     // per-phone daily
  rateLimitOtpSendUser:    (userId: string)           => `rl:otp:user:${userId}`,       // per-user hourly
  rateLimitOtpSendUserDay: (userId: string)           => `rl:otp:user:day:${userId}`,   // per-user daily
  rateLimitOtpIp:          (ip: string)               => `rl:otp:ip:${ip}`,             // per-IP hourly
  rateLimitOtpIpDay:       (ip: string)               => `rl:otp:ip:day:${ip}`,         // per-IP daily
  rateLimitOtpCooldown:    (phoneHash: string)        => `rl:otp:cooldown:${phoneHash}`,// per-phone resend cooldown
  rateLimitSmsGlobalDay:   ()                         => `rl:sms:global:day`,           // global daily circuit-breaker
  rateLimitBranchPinDay:   (branchId: string)         => `rl:sms:branchpin:day:${branchId}`, // per-branch PIN daily
  // SEC-H4 (Gate-PR-8): password-reset request limiter. Per-email keys take a
  // HASHED email (see pwdResetLimiter.hashEmail) so raw emails never appear in
  // Redis key listings or logs.
  rateLimitPwdReset:       (emailHash: string)        => `rl:pwd-reset:${emailHash}`,        // per-email hourly
  rateLimitPwdResetDay:    (emailHash: string)        => `rl:pwd-reset:day:${emailHash}`,    // per-email daily
  rateLimitPwdResetIpDay:  (ip: string)               => `rl:pwd-reset:ip:day:${ip}`,        // per-IP daily ceiling

  // PR-0.4: transactional-email send limiter + bounce suppression. Per-recipient
  // keys take a HASHED email (pwdResetLimiter.hashEmail) so raw addresses never
  // appear in Redis key listings or logs.
  rateLimitEmailSend:      (type: string, emailHash: string) => `rl:email:${type}:${emailHash}`, // per-(type,recipient) hourly
  rateLimitEmailIpDay:     (ip: string)               => `rl:email:ip:day:${ip}`,      // per-IP daily abuser ceiling
  // Suppression: existence ⇒ provider reported a hard bounce / spam complaint for
  // this recipient; future MARKETING sends to it are skipped (notify guard).
  // Transactional sends (password reset, branch PIN) are NEVER suppressed —
  // account recovery must not be denied by a complaint / transient bounce.
  emailSuppression:        (emailHash: string)        => `email:suppress:${emailHash}`,

  // Branches PR-6 (§4e, blueprint §11.3): merchant Google location-search limiter.
  // The LOCKED pre-live multi-instance-safe cap that moves the merchant Google flow
  // off the single-process file counter (which stays for the admin CLI). Per-user +
  // per-merchant are VICTIM keys (counted on allowed only); per-IP is an ABUSER key
  // (every attempt counts); the global daily ceiling is a GATE key (cost breaker).
  rateLimitMerchantLocSearchUserDay:     (userId: string)     => `rl:merchloc:user:day:${userId}`,     // per-user daily
  rateLimitMerchantLocSearchMerchantDay: (merchantId: string) => `rl:merchloc:merchant:day:${merchantId}`, // per-merchant daily
  rateLimitMerchantLocSearchIpHour:      (ip: string)         => `rl:merchloc:ip:hour:${ip}`,          // per-IP hourly (abuser)
  rateLimitMerchantLocSearchIpDay:       (ip: string)         => `rl:merchloc:ip:day:${ip}`,           // per-IP daily (abuser)
  rateLimitMerchantLocSearchGlobalDay:   ()                   => `rl:merchloc:global:day`,             // global daily cost ceiling

  // Branches PR-6 (§4a): server-issued opaque candidate token -> server-held
  // { placeId, latitude, longitude } stash. The client NEVER sees the coords; it
  // holds only the token and resolves it server-side at the apply step (Layer 2)
  // via this Redis lookup, NEVER a fresh billable Google call. 15-minute TTL.
  // Scoped by merchantId so a token minted for one merchant can never be replayed
  // against another merchant's apply.
  merchantLocationCandidate: (merchantId: string, token: string) => `merchant:${merchantId}:loccand:${token}`,

  // PIN brute-force counter — keyed per (userId, branchId) so failures at one branch
  // don't block the user at a different branch
  pinFailCount:        (userId: string, branchId: string) => `pin:fail:${userId}:${branchId}`,

  // Show-to-Staff screenshot anti-fraud telemetry dedup. Set with NX + 5s TTL
  // so a rapid burst of screenshot events for the same (userId, code) writes
  // exactly one RedemptionScreenshotEvent row instead of N.
  redemptionScreenshotDedup: (userId: string, code: string) => `rl:ss:${userId}:${code}`,
} as const
