import twilio from 'twilio'
import type Redis from 'ioredis'
import { RedisKey } from './redis-keys'

const OTP_SEND_LIMIT = 3
const OTP_SEND_WINDOW_SECONDS = 3600 // 1 hour
const OTP_USER_SEND_LIMIT = 5
const OTP_USER_SEND_WINDOW_SECONDS = 3600 // 1 hour — counts sends regardless of destination so number-swapping can't bypass
const OTP_MAX_ATTEMPTS = 3
const OTP_LOCK_SECONDS = 300 // 5 minutes

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
}

export async function checkOtpRateLimit(redis: Redis, phone: string): Promise<boolean> {
  const key = RedisKey.rateLimitOtpSend(phone)
  const count = await redis.get(key)
  return count === null || parseInt(count, 10) < OTP_SEND_LIMIT
}

export async function recordOtpSend(redis: Redis, phone: string): Promise<void> {
  const key = RedisKey.rateLimitOtpSend(phone)
  await redis.incr(key)
  await redis.expire(key, OTP_SEND_WINDOW_SECONDS)
}

export async function checkOtpUserRateLimit(redis: Redis, userId: string): Promise<boolean> {
  const key = RedisKey.rateLimitOtpSendUser(userId)
  const count = await redis.get(key)
  return count === null || parseInt(count, 10) < OTP_USER_SEND_LIMIT
}

export async function recordOtpUserSend(redis: Redis, userId: string): Promise<void> {
  const key = RedisKey.rateLimitOtpSendUser(userId)
  await redis.incr(key)
  await redis.expire(key, OTP_USER_SEND_WINDOW_SECONDS)
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
