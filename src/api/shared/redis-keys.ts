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
  // §SEC.1 closure (plan 2026-07-10, GAP-1..GAP-4; src/api/shared/emailLimiter.ts).
  // GAP-1: global daily send GATE (env EMAIL_GLOBAL_DAILY_CAP): one ops-visible
  // platform breaker, counted only on allowed sends. GAP-2: aggregate per-address
  // hour+day VICTIM keys across ALL types (kills type-cycling around the per-type
  // 5/hr above). GAP-3: per-account/day VICTIM key (one recipient identity, across
  // address/type churn). GAP-4: per-IP HOURLY abuser key beside the daily one.
  rateLimitEmailGlobalDay: ()                         => `rl:email:global:day`,        // global daily send breaker (GAP-1)
  rateLimitEmailAddrHour:  (emailHash: string)        => `rl:email:addr:hour:${emailHash}`, // aggregate per-address hourly (GAP-2)
  rateLimitEmailAddrDay:   (emailHash: string)        => `rl:email:addr:day:${emailHash}`,  // aggregate per-address daily (GAP-2)
  rateLimitEmailAcctDay:   (recipientType: string, recipientId: string) => `rl:email:acct:day:${recipientType}:${recipientId}`, // per-account daily (GAP-3)
  rateLimitEmailIpHour:    (ip: string)               => `rl:email:ip:hour:${ip}`,     // per-IP hourly abuser ceiling (GAP-4)
  // §SEC.1 GAP-5 (plan 2026-07-10 §1.4; src/api/shared/emailLimiter.ts): cross-
  // challenge email-OTP resend cooldown + failed-round escalation. Keyed on the
  // recipient IDENTITY (recipientType + recipientId), never the address: the OTP
  // send paths already hold the authenticated identity, and keeping the address
  // out of the key mirrors the hashEmail discipline of every tier above.
  //   cooldown  : SET-NX-EX serializer gating the REQUEST of a fresh OTP email
  //               (short TTL normally; a LONGER TTL once the failed-round counter
  //               crosses the escalation threshold).
  //   failedRound: consecutive DESTROYED challenges (Nth wrong code) for this
  //               recipient; INCR on destroy, DEL on a successful verification.
  rateLimitEmailOtpCooldown:    (recipientType: string, recipientId: string) => `rl:email-otp:cooldown:${recipientType}:${recipientId}`,
  rateLimitEmailOtpFailedRound: (recipientType: string, recipientId: string) => `rl:email-otp:failed:${recipientType}:${recipientId}`,
  // Suppression: existence ⇒ provider reported a hard bounce / spam complaint for
  // this recipient; future MARKETING sends to it are skipped (notify guard).
  // Transactional sends (password reset, branch PIN) are NEVER suppressed —
  // account recovery must not be denied by a complaint / transient bounce.
  emailSuppression:        (emailHash: string)        => `email:suppress:${emailHash}`,

  // §SEC.1 GAP-6 (plan 2026-07-10 §1.6; src/api/shared/emailOps.ts): the automatic
  // send-pause circuit-breaker. `emailSendPaused` is a single global flag notify()
  // checks BEFORE consuming limiter budget; when present, every send is declined
  // ('send-paused'). It is set automatically by the bounce-ratio / repeated
  // gate-trip triggers and cleared ONLY by a SUPER_ADMIN action (no TTL; it must
  // persist until an operator resumes). `emailGateTripDay` counts how many times
  // the global daily gate blocked today (the repeated-trip trigger reads it).
  emailSendPaused:         ()                         => `email:send:paused`,
  emailGateTripDay:        (dateUtc: string)          => `email:gate-trip:${dateUtc}`,
  // §SEC.1 GAP-7 (plan 2026-07-10 §1.7; src/api/shared/emailOps.ts): send-volume
  // counters incremented beside the limiter consumption (per allowed send). Daily,
  // keyed by a UTC YYYYMMDD stamp so each day is a fresh key (a short TTL cleans
  // up old ones). `emailBouncedCount` is incremented by the Resend webhook; the
  // bounce-ratio trigger (GAP-6) reads sent-all vs bounced.
  emailSentCountType:      (type: string, dateUtc: string) => `email:count:sent:${type}:${dateUtc}`,
  emailSentCountAll:       (dateUtc: string)          => `email:count:sent:all:${dateUtc}`,
  emailBouncedCount:       (dateUtc: string)          => `email:count:bounced:${dateUtc}`,

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

  // Customer merchant-invite programme M1 (mirrors the Branches PR-6 §4a
  // merchantLocationCandidate shape): server-issued opaque candidate token ->
  // server-held { googlePlaceId, name, formattedAddress, locality } stash for
  // POST /api/v1/customer/invites/place-search. Scoped by userId so a token
  // minted for one customer can never be resolved by another customer's
  // submit. 15-minute TTL (set at write time in the route/service).
  inviteLocationCandidate: (userId: string, token: string) => `invite:${userId}:loccand:${token}`,

  // Customer merchant-invite programme M1 (mirrors rl:merchloc:* above):
  // inviteLocationLimiter counters for POST /api/v1/customer/invites/place-search.
  // Per-user daily is a VICTIM key (counted on allowed only); per-IP hourly is an
  // ABUSER key (every attempt counts); the global daily ceiling is a GATE key
  // (env INVITE_PLACES_GLOBAL_DAILY_CAP cost breaker). No per-merchant tier —
  // this is a customer-side flow with no merchant identity to key on.
  rateLimitInviteLocSearchUserDay:   (userId: string) => `rl:invloc:user:day:${userId}`, // per-user daily
  rateLimitInviteLocSearchIpHour:    (ip: string)     => `rl:invloc:ip:hour:${ip}`,      // per-IP hourly (abuser)
  rateLimitInviteLocSearchGlobalDay: ()                => `rl:invloc:global:day`,        // global daily cost ceiling

  // Customer merchant-invite programme M1 (Codex correction round;
  // src/api/shared/inviteSubmitLimiter.ts): per-IP + global atomic limiter for
  // POST /api/v1/customer/invites (submit). Per-IP hourly is an ABUSER key
  // (every attempt counts); the global daily ceiling is a GATE key (env
  // INVITE_SUBMIT_GLOBAL_DAILY_CAP cost/abuse breaker). No per-user tier here
  // — the per-customer `inviteSubmit` rate-limit tier
  // (src/api/plugins/rate-limit.ts) and the in-transaction OPEN_INVITE_CAP
  // (service.ts) already bound a single account; this bounds one MACHINE
  // running many accounts.
  rateLimitInviteSubmitIpHour:       (ip: string)     => `rl:invsub:ip:hour:${ip}`,      // per-IP hourly (abuser)
  rateLimitInviteSubmitGlobalDay:    ()                => `rl:invsub:global:day`,        // global daily cost/abuse ceiling

  // D65 personalised-agreement admin PREVIEW limiter
  // (src/api/shared/agreementPreviewLimiter.ts): a bounded per-caller rate limit on
  // POST /api/v1/admin/merchants/:id/agreement/preview (decision doc §4b REQUIRED
  // acceptance criterion). Both keys are ABUSER keys (every attempt counts): the
  // preview is a cheap server-side render for the ceremony, so per-admin bounds the
  // authenticated caller and per-IP is defence in depth.
  rateLimitAgreementPreviewAdminMin: (adminId: string) => `rl:agrprev:admin:min:${adminId}`, // per-admin per-minute (abuser)
  rateLimitAgreementPreviewIpMin:    (ip: string)       => `rl:agrprev:ip:min:${ip}`,         // per-IP per-minute (abuser)
  // D65 self-serve (FIX 2): a bounded per-caller rate limit on the merchant-authenticated
  // own-merchant POST /api/v1/merchant/onboarding/agreement/preview (decision doc §4b REQUIRED
  // acceptance criterion). Both keys are ABUSER keys: per-MERCHANT is the primary bound (the
  // resolved own merchant, so one merchant cannot hammer the render) and per-IP is defence in
  // depth against one machine cycling merchant sessions.
  rateLimitMerchantAgreementPreviewMerchantMin: (merchantId: string) => `rl:magrprev:merch:min:${merchantId}`, // per-merchant per-minute (abuser)
  rateLimitMerchantAgreementPreviewIpMin:       (ip: string)         => `rl:magrprev:ip:min:${ip}`,             // per-IP per-minute (abuser)
  // D65 lane-2 (evidence read, decision doc §11/§17; src/api/shared/agreementEvidenceLimiter.ts):
  // a bounded per-caller rate limit on the ADMIN signing-evidence read surface (the ordinary-tier
  // evidence detail GET AND the server-proxied signed-PDF retrieval, which does an R2 round-trip +
  // sha256). Both keys are ABUSER keys (every attempt counts): per-admin is the primary bound on
  // the authenticated caller, per-IP is defence in depth against one machine cycling sessions.
  rateLimitAgreementEvidenceAdminMin: (adminId: string) => `rl:agrev:admin:min:${adminId}`, // per-admin per-minute (abuser)
  rateLimitAgreementEvidenceIpMin:    (ip: string)       => `rl:agrev:ip:min:${ip}`,         // per-IP per-minute (abuser)
} as const
