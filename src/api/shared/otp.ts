import twilio from 'twilio'
import type Redis from 'ioredis'
import { RedisKey } from './redis-keys'

// Send-side rate limiting moved to src/api/shared/smsLimiter.ts (SEC-H3, Gate-PR-7).
// This module keeps the Twilio send + the verify-attempt lock only.
const OTP_MAX_ATTEMPTS = 3
const OTP_LOCK_SECONDS = 300 // 5 minutes

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

export async function sendOtp(phone: string): Promise<void> {
  const client = getTwilioClient()
  await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
    .verifications.create({ to: phone, channel: 'sms' })
}

export interface OtpVerifyResult {
  success: boolean
  locked: boolean
  attemptsRemaining: number
}

export async function verifyOtp(
  redis: Redis,
  phone: string,
  code: string,
  entityId: string,
  role: string
): Promise<OtpVerifyResult> {
  const lockKey = RedisKey.otpLock(role, entityId)
  const isLocked = await redis.get(lockKey)
  if (isLocked) {
    return { success: false, locked: true, attemptsRemaining: 0 }
  }

  const client = getTwilioClient()
  let approved = false
  try {
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID!)
      .verificationChecks.create({ to: phone, code })
    approved = check.status === 'approved'
  } catch {
    approved = false
  }

  if (approved) {
    return { success: true, locked: false, attemptsRemaining: OTP_MAX_ATTEMPTS }
  }

  // Track failed attempts
  const attemptKey = RedisKey.otp(role, entityId)
  const attempts = await redis.incr(attemptKey)
  await redis.expire(attemptKey, 600) // 10-minute window
  const remaining = OTP_MAX_ATTEMPTS - attempts

  if (remaining <= 0) {
    await redis.set(lockKey, '1', 'EX', OTP_LOCK_SECONDS)
    await redis.del(attemptKey)
    return { success: false, locked: true, attemptsRemaining: 0 }
  }

  return { success: false, locked: false, attemptsRemaining: remaining }
}

export async function clearOtpAttempts(redis: Redis, entityId: string, role: string): Promise<void> {
  await redis.del(RedisKey.otp(role, entityId))
}
