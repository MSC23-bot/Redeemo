import { PrismaClient } from '../../../generated/prisma/client'

export type AuditEvent =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_SSO_LOGIN_SUCCESS'
  | 'AUTH_LOGOUT'
  | 'AUTH_REFRESH_FAILED'
  | 'AUTH_OTP_SENT'
  | 'AUTH_OTP_VERIFIED'
  | 'AUTH_OTP_FAILED'
  | 'AUTH_OTP_LOCKED'
  | 'AUTH_PASSWORD_RESET'
  | 'AUTH_EMAIL_CHANGED'
  | 'AUTH_PHONE_CHANGED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_SESSIONS_REVOKED'
  | 'AUTH_ACCOUNT_DELETED'
  | 'AUTH_ACCOUNT_SUSPENDED'
  | 'BRANCH_USER_CREATED'
  | 'BRANCH_USER_PASSWORD_SET'
  | 'BRANCH_USER_PASSWORD_CHANGED'
  | 'BRANCH_USER_PASSWORD_RESET'
  | 'BRANCH_USER_DEACTIVATED'
  | 'BRANCH_USER_REACTIVATED'
  | 'BRANCH_PIN_CHANGED'
  | 'REDEMPTION_QUICK_VALIDATED'
  | 'MERCHANT_DEACTIVATED'
  | 'MERCHANT_REACTIVATED'
  | 'MERCHANT_PROFILE_UPDATED'
  | 'MERCHANT_EDIT_REQUEST_CREATED'
  | 'MERCHANT_EDIT_REQUEST_WITHDRAWN'
  | 'MERCHANT_CONTRACT_ACCEPTED'
  | 'MERCHANT_SUBMITTED_FOR_APPROVAL'
  | 'BRANCH_CREATED'
  | 'BRANCH_UPDATED'
  | 'BRANCH_DELETED'
  | 'BRANCH_EDIT_REQUEST_CREATED'
  | 'BRANCH_EDIT_REQUEST_WITHDRAWN'
  | 'BRANCH_MAIN_CHANGED'
  | 'VOUCHER_CREATED'
  | 'VOUCHER_UPDATED'
  | 'VOUCHER_DELETED'
  | 'VOUCHER_SUBMITTED'
  | 'RMV_UPDATED'
  | 'RMV_SUBMITTED'
  | 'RMV_PROVISIONED'
  | 'CATEGORY_CHANGED'

export interface AuditContext {
  entityId: string
  entityType: 'customer' | 'merchant' | 'branch' | 'admin'
  event: AuditEvent
  ipAddress: string
  userAgent: string
  deviceId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

export function writeAuditLog(prisma: PrismaClient, ctx: AuditContext): void {
  // Fire-and-forget — does not block the request
  prisma.auditLog.create({
    data: {
      entityId:   ctx.entityId,
      entityType: ctx.entityType,
      event:      ctx.event,
      ipAddress:  ctx.ipAddress,
      userAgent:  ctx.userAgent,
      deviceId:   ctx.deviceId,
      sessionId:  ctx.sessionId,
      metadata:   ctx.metadata as any,
    },
  }).catch((err: unknown) => {
    console.error('[audit] Failed to write audit log:', err)
  })
}
