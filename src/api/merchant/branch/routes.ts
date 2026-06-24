import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { AppError } from '../../shared/errors'
import { isStorageEnabled } from '../../shared/storage'
import { resolveMerchantContext, assertCanManageBranch } from '../shared'
import { resolveLocationCandidate } from '../location/service'
import type { BranchLocationSuggestion } from './service'
import {
  listBranches,
  getBranch,
  createBranch,
  cancelPendingCreate,
  requestBranchClose,
  withdrawBranchClose,
  updateBranch,
  createBranchEditRequest,
  createBranchPhotoEditRequest,
  uploadBranchPhotoAsset,
  removeBranchPhoto,
  listBranchEditRequests,
  withdrawBranchEditRequest,
  setOpeningHours,
  cancelPendingHours,
  setAmenities,
  setRedemptionAlerts,
  softDeleteBranch,
  getBranchPin,
  setBranchPin,
  sendBranchPin,
} from './service'

const idParam = z.object({ id: z.string() })
const editIdParam = z.object({ id: z.string(), editId: z.string() })
const photoIdParam = z.object({ id: z.string(), photoId: z.string() })

const createBranchBody = z.object({
  name:         z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  city:         z.string(),
  postcode:     z.string(),
  country:      z.string().optional(),
  latitude:     z.number().optional(),
  longitude:    z.number().optional(),
  phone:        z.string().optional(),
  email:        z.string().optional(),
  websiteUrl:   z.string().optional(),
  logoUrl:      z.string().optional(),
  bannerUrl:    z.string().optional(),
  about:        z.string().optional(),
  // Branches PR-6 (§4b): an OPTIONAL Layer 1 candidate token. The client submits
  // ONLY the token (NOT lat/lng, NOT placeId); the route resolves it server-side
  // to admin-review metadata. Absent/expired -> the address still saves, no
  // suggestion staged.
  candidateToken: z.string().optional(),
})

const updateBranchBody = z.object({
  phone:        z.string().optional(),
  email:        z.string().optional(),
  websiteUrl:   z.string().optional(),
  isActive:     z.boolean().optional(),
  isMainBranch: z.boolean().optional(),
  // Branches PR-6 (§4b): an OPTIONAL Layer 1 candidate token on an address edit
  // (declared explicitly though .passthrough() already admits it). Resolved at the
  // route boundary; never reaches a Branch column or proposedChanges as a field.
  candidateToken: z.string().optional(),
}).passthrough() // allow extra keys — service ignores them

const openingHoursBody = z.object({
  hours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime:  z.string().optional(),
    closeTime: z.string().optional(),
    isClosed:  z.boolean(),
  })),
})

const amenitiesBody = z.object({
  amenityIds: z.array(z.string()),
})

// Branches PR-7 (§4 / §6): the per-branch redemption-alerts toggle body.
const redemptionAlertsBody = z.object({
  enabled: z.boolean(),
})

// Branches PR-5 (§4b): a close request carries a merchant-supplied reason (audit-only,
// surfaced to the admin reviewer). Trimmed + non-empty.
const closeRequestBody = z.object({
  reason: z.string().trim().min(1),
})

const photoEditRequestBody = z.object({
  add:    z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
})

export async function branchRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/branches'

  // Branches PR-6 (§4b): resolve an OPTIONAL candidateToken to its server-held
  // suggestion at the ROUTE boundary (keeps Redis out of the service core). The
  // token is Redis-keyed by merchantId, so we resolve the caller's scoped merchant
  // context first (cheap; only when a token is present). The resolver is a Redis
  // lookup ONLY — NEVER a fresh billable Google call. A missing / expired /
  // foreign-merchant token resolves to null and is treated as "no suggestion": the
  // address apply still proceeds (the merchant re-searches only if they want the
  // admin to receive a suggested pin). `updateBranch` / `createBranch` still run
  // their OWN authoritative auth (resolveAdminMerchant / resolveMerchantContext +
  // assertCanManageBranch); this lookup is purely to scope the Redis key.
  async function resolveTokenSuggestion(
    req: FastifyRequest,
    candidateToken: string | undefined,
  ): Promise<BranchLocationSuggestion | undefined> {
    if (!candidateToken) return undefined
    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    const resolved = await resolveLocationCandidate(app.redis, ctx.merchantId, candidateToken)
    return resolved ?? undefined
  }

  // GET /api/v1/merchant/branches — list branches
  app.get(prefix, async (req: FastifyRequest, reply) => {
    const branches = await listBranches(app.prisma, req.user.sub)
    return reply.send(branches)
  })

  // POST /api/v1/merchant/branches — create branch
  // Branches PR-5 (D5): OWNER-only. The FIRST branch (onboarding main) is created
  // INSTANT-LIVE; every SUBSEQUENT merchant-created branch stages PENDING_CREATE +
  // a BRANCH_CREATE approval (customer-invisible until an admin approves).
  app.post(prefix, async (req: FastifyRequest, reply) => {
    const { candidateToken, ...body } = createBranchBody.parse(req.body)
    // Branches PR-6 (§4b): resolve the token (if any) to admin-review metadata. The
    // address fields in `body` apply as today; the suggestion is staged in the
    // BRANCH_CREATED audit only. NO confidence write.
    const locationSuggestion = await resolveTokenSuggestion(req, candidateToken)
    const branch = await createBranch(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }, locationSuggestion)
    return reply.status(201).send(branch)
  })

  // DELETE /api/v1/merchant/branches/:id/pending-create — cancel a pending-create
  // branch (Branches PR-5 §4a). OWNER-only. Hard-deletes the never-live branch row +
  // its BRANCH_CREATE approval. BRANCH_NOT_PENDING_CREATE (409) when the branch is not
  // awaiting create approval.
  app.delete(`${prefix}/:id/pending-create`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await cancelPendingCreate(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/close-request — request to close a branch
  // (Branches PR-5 §4b). OWNER-only. Enforces BRANCH_IS_MAIN + BRANCH_LAST_ACTIVE at
  // request time; sets lifecycleStatus PENDING_CLOSE + closeReason + a BRANCH_CLOSE
  // approval. The branch STAYS live + customer-visible until an admin approves.
  app.post(`${prefix}/:id/close-request`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { reason } = closeRequestBody.parse(req.body)
    const result = await requestBranchClose(app.prisma, req.user.sub, id, reason, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(result)
  })

  // DELETE /api/v1/merchant/branches/:id/close-request — withdraw a pending close
  // request (Branches PR-5 §4b). OWNER-only. Reverts lifecycleStatus -> LIVE + clears
  // closeReason + removes the BRANCH_CLOSE approval. BRANCH_CLOSE_REQUEST_NOT_FOUND
  // (404) when there is no open close request.
  app.delete(`${prefix}/:id/close-request`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await withdrawBranchClose(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // GET /api/v1/merchant/branches/:id — get single branch
  app.get(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const branch = await getBranch(app.prisma, req.user.sub, id)
    return reply.send(branch)
  })

  // PATCH /api/v1/merchant/branches/:id — update non-sensitive fields (and, in the
  // draft window / via the governed edit lane, sensitive address fields).
  app.patch(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    // Branches PR-6 (§4b): pop candidateToken OUT of the body so it never reaches
    // the service's data (and thus never the BranchPendingEdit.proposedChanges via
    // the passthrough). The resolved suggestion is threaded separately.
    const { candidateToken, ...body } = updateBranchBody.parse(req.body)
    const locationSuggestion = await resolveTokenSuggestion(req, candidateToken)
    const branch = await updateBranch(app.prisma, req.user.sub, id, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }, locationSuggestion)
    return reply.send(branch)
  })

  // POST /api/v1/merchant/branches/:id/edit-request — create sensitive edit request
  app.post(`${prefix}/:id/edit-request`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const parsed = z.record(z.string(), z.unknown()).parse(req.body)
    // Branches PR-6 (§4b): pop candidateToken OUT of the proposedChanges record so
    // it is never persisted as a field; the resolved suggestion is threaded as a
    // metadata sub-key by createBranchEditRequest.
    const candidateToken = typeof parsed.candidateToken === 'string' ? parsed.candidateToken : undefined
    const { candidateToken: _drop, ...body } = parsed
    void _drop
    const locationSuggestion = await resolveTokenSuggestion(req, candidateToken)
    const pendingEdit = await createBranchEditRequest(
      app.prisma, req.user.sub, id, body, false, {
        ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
      }, locationSuggestion
    )
    return reply.status(201).send(pendingEdit)
  })

  // GET /api/v1/merchant/branches/:id/edit-requests — list edit requests
  app.get(`${prefix}/:id/edit-requests`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const list = await listBranchEditRequests(app.prisma, req.user.sub, id)
    return reply.send(list)
  })

  // DELETE /api/v1/merchant/branches/:id/edit-requests/:editId — withdraw edit request
  app.delete(`${prefix}/:id/edit-requests/:editId`, async (req: FastifyRequest, reply) => {
    const { id, editId } = editIdParam.parse(req.params)
    const result = await withdrawBranchEditRequest(app.prisma, req.user.sub, id, editId, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/hours — STAGE an opening-hours change
  // (Branches PR-4 §4a). The edit does NOT go live immediately; it writes a durable
  // BranchOpeningHoursPending row with effectiveAt = now + 2h and a worker promotes
  // it after the cool-off. Returns the staged pending record.
  app.post(`${prefix}/:id/hours`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { hours } = openingHoursBody.parse(req.body)
    const result = await setOpeningHours(app.prisma, req.user.sub, id, hours)
    return reply.send(result)
  })

  // DELETE /api/v1/merchant/branches/:id/hours/pending — cancel/withdraw a staged
  // opening-hours change before it promotes (Branches PR-4 §4b). Same
  // branch-management WRITE boundary as the stage write. PENDING_HOURS_NOT_FOUND
  // (404) when there is no PENDING row. Live hours are unchanged by a cancel.
  app.delete(`${prefix}/:id/hours/pending`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await cancelPendingHours(app.prisma, req.user.sub, id)
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/amenities — set amenities (full replace)
  app.post(`${prefix}/:id/amenities`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { amenityIds } = amenitiesBody.parse(req.body)
    const result = await setAmenities(app.prisma, req.user.sub, id, amenityIds)
    return reply.send(result)
  })

  // PATCH /api/v1/merchant/branches/:id/redemption-alerts — set the per-branch
  // redemption-alerts opt-in (Branches PR-7 §6). Same branch-management WRITE
  // boundary as the hours / amenities writes (resolveMerchantContext +
  // assertCanManageBranch — OWNER any || assigned BRANCH_MANAGER; STAFF denied;
  // suspended -> MERCHANT_SUSPENDED). When ON, an in-store validation fans out an
  // IN_APP VOUCHER_REDEEMED bell to the active owner(s) + scope-covering BMs.
  app.patch(`${prefix}/:id/redemption-alerts`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { enabled } = redemptionAlertsBody.parse(req.body)
    const result = await setRedemptionAlerts(app.prisma, req.user.sub, id, enabled)
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/photos/edit-request — create photo edit request
  app.post(`${prefix}/:id/photos/edit-request`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const body = photoEditRequestBody.parse(req.body)
    const pendingEdit = await createBranchPhotoEditRequest(
      app.prisma, req.user.sub, id, body, {
        ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
      }
    )
    return reply.status(201).send(pendingEdit)
  })

  // POST /api/v1/merchant/branches/:id/photos/upload — branch-scoped photo-asset
  // upload (Branches PR-3 §6c). Server-proxied multipart, mirroring the merchant
  // /uploads/:kind handler, but gated by BRANCH MANAGEMENT (resolveMerchantContext
  // + assertCanManageBranch inside uploadBranchPhotoAsset) instead of the voucher
  // assertCanManageVouchers gate. The voucher /uploads/photo path is left UNCHANGED.
  // Returns { url }; the URL then feeds the photo edit-request lane (admin-reviewed).
  app.post(`${prefix}/:id/photos/upload`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)

    // Fail closed BEFORE reading any bytes when storage is dark.
    if (!isStorageEnabled()) throw new AppError('STORAGE_NOT_ENABLED')
    if (!req.isMultipart()) throw new AppError('FILE_REQUIRED')

    // Fail FAST: resolve the caller's merchant + assert branch-management WRITE
    // permission BEFORE consuming any multipart bytes (mirrors the voucher
    // /uploads/:kind handler, which resolves + guards before its parts() loop).
    // Without this, an authenticated-but-unauthorised member would force the server
    // to buffer up to the 5MB photo cap before getting the 403 from the service's
    // own assert. resolveMerchantContext keeps the SEC-M2 suspended guard;
    // assertCanManageBranch is the same branch-management WRITE gate (OWNER any
    // branch || BRANCH_MANAGER assigned branch; STAFF DENIED even when assigned; NO
    // canManageVouchers) that uploadBranchPhotoAsset asserts internally — that
    // service assert is intentionally KEPT as defence-in-depth so a direct call
    // stays safe.
    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    assertCanManageBranch(ctx, id)

    let fileBuffer: Buffer | undefined
    let mimetype: string | undefined
    try {
      for await (const part of (req as any).parts()) {
        if (part.type === 'file') {
          mimetype = part.mimetype
          fileBuffer = await part.toBuffer() // throws if the part exceeds limits.fileSize
        }
        // Any non-file fields are ignored: the branch id is in the path.
      }
    } catch (err: any) {
      const code = typeof err?.code === 'string' ? err.code : ''
      if (code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError('IMAGE_TOO_LARGE')
      // Any OTHER @fastify/multipart parser error (too many files / fields / parts,
      // malformed body) is a client error, not a 500. Scoped to multipart codes
      // (FST_* but NOT the Fastify-core FST_ERR_* namespace).
      if (code.startsWith('FST_') && !code.startsWith('FST_ERR_')) throw new AppError('INVALID_UPLOAD')
      throw err
    }

    if (!fileBuffer || fileBuffer.length === 0 || !mimetype) throw new AppError('FILE_REQUIRED')

    const result = await uploadBranchPhotoAsset(app.prisma, req.user.sub, id, {
      contentType: mimetype, body: fileBuffer,
    })
    return reply.send(result)
  })

  // DELETE /api/v1/merchant/branches/:id/photos/:photoId — instant removal of a
  // LIVE (APPROVED) branch photo (Branches PR-3 §6b). OWNER-ONLY in v1 (the service
  // resolves via resolveAdminMerchant). Remove-by-ID, branch-scoped, APPROVED-only.
  app.delete(`${prefix}/:id/photos/:photoId`, async (req: FastifyRequest, reply) => {
    const { id, photoId } = photoIdParam.parse(req.params)
    const result = await removeBranchPhoto(app.prisma, req.user.sub, id, photoId, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // DELETE /api/v1/merchant/branches/:id — soft delete branch
  app.delete(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await softDeleteBranch(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // GET /api/v1/merchant/branches/:id/pin — get branch redemption PIN (decrypted)
  app.get(`${prefix}/:id/pin`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await getBranchPin(app.prisma, req.user.sub, id)
    return reply.send(result)
  })

  // PUT /api/v1/merchant/branches/:id/pin — set / update branch redemption PIN
  app.put(`${prefix}/:id/pin`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 numeric digits') }).parse(req.body)
    const result = await setBranchPin(app.prisma, req.user.sub, id, pin, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // POST /api/v1/merchant/branches/:id/pin/send — send PIN to branch staff via SMS / email
  app.post(`${prefix}/:id/pin/send`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await sendBranchPin(app.prisma, app.redis, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
