import { describe, it, expect, vi } from 'vitest'
import {
  adminHasCapability,
  requireAdminCapability,
  type AdminCapability,
} from '../../../src/api/admin/capability'

const ALL: AdminCapability[] = [
  'merchant:create-draft',
  'merchant:read',
  'approval:read',
  'approval:action',
  'merchant:suspend',
  'branch:confirm-location',
]

describe('M2 — admin capability map', () => {
  describe('adminHasCapability', () => {
    it('SUPER_ADMIN holds every capability (superuser)', () => {
      for (const c of ALL) expect(adminHasCapability('SUPER_ADMIN', c)).toBe(true)
    })

    it('OPERATIONS holds all Slice-1 capabilities', () => {
      for (const c of ALL) expect(adminHasCapability('OPERATIONS', c)).toBe(true)
    })

    it('FINANCE / CONTENT / SUPPORT hold no Slice-1 capabilities', () => {
      for (const role of ['FINANCE', 'CONTENT', 'SUPPORT']) {
        for (const c of ALL) expect(adminHasCapability(role, c)).toBe(false)
      }
    })

    it('unknown / undefined role holds nothing', () => {
      expect(adminHasCapability(undefined, 'merchant:create-draft')).toBe(false)
      expect(adminHasCapability('NOT_A_ROLE', 'merchant:create-draft')).toBe(false)
    })

    it('WP2 — merchant:read held by OPERATIONS + SUPER_ADMIN, not FINANCE/CONTENT/SUPPORT', () => {
      expect(adminHasCapability('OPERATIONS', 'merchant:read')).toBe(true)
      expect(adminHasCapability('SUPER_ADMIN', 'merchant:read')).toBe(true)
      for (const role of ['FINANCE', 'CONTENT', 'SUPPORT']) {
        expect(adminHasCapability(role, 'merchant:read')).toBe(false)
      }
    })
  })

  describe('requireAdminCapability (preHandler)', () => {
    const makeCtx = (adminRole?: string) => {
      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() }
      const req: any = { user: adminRole ? { adminRole } : undefined }
      return { req, reply }
    }

    it('passes through (no reply) when the role has the capability', async () => {
      const { req, reply } = makeCtx('OPERATIONS')
      await requireAdminCapability('merchant:create-draft')(req, reply)
      expect(reply.status).not.toHaveBeenCalled()
    })

    it('403s ADMIN_CAPABILITY_DENIED when the role lacks the capability', async () => {
      const { req, reply } = makeCtx('SUPPORT')
      await requireAdminCapability('merchant:create-draft')(req, reply)
      expect(reply.status).toHaveBeenCalledWith(403)
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'ADMIN_CAPABILITY_DENIED' }) })
      )
    })

    it('403s when there is no authenticated admin role', async () => {
      const { req, reply } = makeCtx(undefined)
      await requireAdminCapability('merchant:create-draft')(req, reply)
      expect(reply.status).toHaveBeenCalledWith(403)
    })
  })
})
