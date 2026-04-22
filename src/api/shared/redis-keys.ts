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

  // Rate limiting counters
  rateLimitOtpSend:    (phone: string)            => `rl:otp:${phone}`,
  rateLimitPwdReset:   (email: string)            => `rl:pwd-reset:${email}`,

  // PIN brute-force counter — keyed per (userId, branchId) so failures at one branch
  // don't block the user at a different branch
  pinFailCount:        (userId: string, branchId: string) => `pin:fail:${userId}:${branchId}`,

  // Staff verify fail counter — keyed per (actorId, branchId). Distinct from
  // customer-side pinFailCount so staff mistypes don't lock out the customer.
  staffVerifyFailCount: (actorId: string, branchId: string) => `verify:fail:${actorId}:${branchId}`,
} as const
