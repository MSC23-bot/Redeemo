import { z } from 'zod'

export const emailSchema = z
  .string()
  .email('Must be a valid email address')
  .toLowerCase()
  .trim()

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/\\`~]/, 'Password must contain at least one special character')

export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +447700900000)')

export const deviceSchema = z.object({
  deviceId:   z.string().uuid('deviceId must be a UUID'),
  deviceType: z.enum(['ios', 'android', 'web']),
  deviceName: z.string().max(100).optional(),
})

export const otpCodeSchema = z
  .string()
  .length(6, 'Code must be 6 digits')
  .regex(/^\d{6}$/, 'Code must be numeric')

export const pinSchema = z
  .string()
  .length(4, 'PIN must be 4 digits')
  .regex(/^\d{4}$/, 'PIN must be numeric')
