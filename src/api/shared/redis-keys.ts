export const RedisKey = {
  // Auth permission cache
  authCustomer:        (userId: string)          => `auth:customer:${userId}`,
  authMerchant:        (merchantAdminId: string)  => `auth:merchant:${merchantAdminId}`,
  authBranch:          (branchUserId: string)     => `auth:branch:${branchUserId}`,
  authAdmin:           (adminUserId: string)      => `auth:admin:${adminUserId}`,

  // Refresh tokens
  refreshToken:        (role: string, entityId: string, sessionId: string) =>
                         `refresh:${role}:${entityId}:${sessionId}`,

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
  rateLimitPwdReset:       (email: string)            => `rl:pwd-reset:${email}`,

  // PIN brute-force counter — keyed per (userId, branchId) so failures at one branch
  // don't block the user at a different branch
  pinFailCount:        (userId: string, branchId: string) => `pin:fail:${userId}:${branchId}`,

  // Show-to-Staff screenshot anti-fraud telemetry dedup. Set with NX + 5s TTL
  // so a rapid burst of screenshot events for the same (userId, code) writes
  // exactly one RedemptionScreenshotEvent row instead of N.
  redemptionScreenshotDedup: (userId: string, code: string) => `rl:ss:${userId}:${code}`,
} as const
