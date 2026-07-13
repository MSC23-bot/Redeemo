// D65 Slice 2: the agreement-signing backend core.
//
// Two write paths share one evidence model (MerchantAgreementRecord, immutable /
// append-only) and one PDF renderer:
//   - signAgreementInPerson(...)  : the assisted ceremony on a Redeemo rep's device.
//     The owner is the signer; the rep is the WITNESS (actorAdminId), never the
//     signer (admin-never-signs lock). method = IN_PERSON_ASSISTED.
//   - buildAndStoreSelfServeRecord(...) : the helper the merchant portal
//     click-to-agree fallback (onboarding.acceptContract) uses to ALSO gain a PDF +
//     evidence record. method = SELF_SERVE_CLICK, actorAdminId = null.
//
// LEGAL GATE (fail-closed, spec §6): while AGREEMENT_LEGAL_REVIEW_REQUIRED is on
// (default true) a PRODUCTION deploy refuses to write a binding ceremony record or
// flip contractStatus (AGREEMENT_LEGAL_REVIEW_REQUIRED error). Staging/dev run the
// flow fully for QA, DRAFT-watermarked. The production discriminator reuses the
// app-owned REDEEMO_DEPLOY_ENV signal (Railway staging runs NODE_ENV=production, so
// NODE_ENV alone cannot tell staging from prod - see insights/demo.ts).
//
// IMMUTABILITY is an application contract: this module only ever CREATEs
// MerchantAgreementRecord rows (never update/delete); a new version = a new row. A
// guard test asserts no update/delete call sites exist.

import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { isStorageEnabled, putObject } from '../../shared/storage'
import { getAgreementVersion, getCurrentAgreement, type AgreementVersion } from './versions'
import { renderAgreementPdf } from './pdf'

// ── Environment gate ────────────────────────────────────────────────────────

/**
 * True IFF this is a PRODUCTION deploy. Fail-closed toward production: only a
 * positively-identified non-production deploy is treated as non-production.
 *   - REDEEMO_DEPLOY_ENV === 'staging'    -> non-production (Railway staging).
 *   - REDEEMO_DEPLOY_ENV === 'production' -> production.
 *   - unset (a local/dev/test box; Railway always sets it) -> defer to NODE_ENV:
 *     production only when NODE_ENV === 'production'. So a misconfigured real
 *     production box (deploy id unset, NODE_ENV=production) is still treated as
 *     production (fail-closed), while local dev / vitest (NODE_ENV !== production)
 *     run fully.
 * NODE_ENV is intentionally NOT the primary signal (Railway staging runs
 * NODE_ENV=production), mirroring the insights/demo.ts deploy-identity precedent.
 */
export function isProductionDeploy(): boolean {
  const deployEnv = process.env.REDEEMO_DEPLOY_ENV
  if (deployEnv === 'staging') return false
  if (deployEnv === 'production') return true
  return process.env.NODE_ENV === 'production'
}

/**
 * True while the agreement is pending legal review. Default TRUE (fail-closed):
 * only the literal 'false' lifts it (the owner's post-sign-off action). Drives the
 * DRAFT watermark everywhere and the production binding-write block.
 */
export function legalReviewRequired(): boolean {
  return (process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED ?? 'true') !== 'false'
}

/** The DRAFT watermark + pending-review copy show whenever legal review is required. */
export function isAgreementGated(): boolean {
  return legalReviewRequired()
}

/**
 * Fail-closed gate on a BINDING write. Refuses (AGREEMENT_LEGAL_REVIEW_REQUIRED)
 * only when legal review is still required AND this is a production deploy. Staging
 * and dev run fully (records written, DRAFT-watermarked) for QA. Independent of
 * STORAGE_ENABLED.
 */
export function assertBindingWriteAllowed(): void {
  if (legalReviewRequired() && isProductionDeploy()) {
    throw new AppError('AGREEMENT_LEGAL_REVIEW_REQUIRED')
  }
}

// ── Shared PDF render + store ────────────────────────────────────────────────

/** Placeholder signer name for a legacy self-serve click that carried no typed name. */
export const SELF_SERVE_SIGNER_NOT_CAPTURED = '(self-serve click; typed name not captured)'

export interface MerchantSigningIdentity {
  businessLegalName: string
  tradingName?: string | null
  companyNumber?: string | null
  vatNumber?: string | null
}

interface RenderAndStoreInput extends MerchantSigningIdentity {
  merchantId: string
  agreement: AgreementVersion
  signerName: string
  signerRoleConfirmation: string
  method: 'IN_PERSON_ASSISTED' | 'SELF_SERVE_CLICK'
  witnessLabel: string | null
  signedAt: Date
  ipAddress: string
  userAgent: string
  drawnSignature?: Buffer | null
}

/**
 * Render the signed PDF and write it to PRIVATE R2 (`document` kind, ownerId =
 * merchantId). Fails closed with STORAGE_NOT_ENABLED when storage is dark; never
 * constructs the S3 client otherwise. Returns the private key. The PDF is
 * DRAFT-watermarked whenever the legal gate is on.
 */
export async function renderAndStoreAgreementPdf(input: RenderAndStoreInput): Promise<string> {
  if (!isStorageEnabled()) throw new AppError('STORAGE_NOT_ENABLED')

  const pdf = await renderAgreementPdf({
    version: input.agreement.version,
    contentHash: input.agreement.contentHash,
    content: input.agreement.content,
    signerName: input.signerName,
    signerRoleConfirmation: input.signerRoleConfirmation,
    businessLegalName: input.businessLegalName,
    tradingName: input.tradingName,
    companyNumber: input.companyNumber,
    vatNumber: input.vatNumber,
    method: input.method,
    witnessLabel: input.witnessLabel,
    signedAt: input.signedAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    gated: isAgreementGated(),
    drawnSignature: input.drawnSignature ?? null,
  })

  const { key } = await putObject({
    kind: 'document',
    ownerId: input.merchantId,
    contentType: 'application/pdf',
    body: pdf,
  })
  return key
}

// ── The in-person assisted ceremony ──────────────────────────────────────────

export interface SignAgreementInPersonInput {
  merchantId: string
  /** The witnessing rep (req.user.sub). NEVER the signer. */
  actorAdminId: string
  /** Typed full name = the signature of record. */
  signerName: string
  /** Authority attestation role (e.g. "Owner", "Director"). */
  signerRoleConfirmation: string
  /** Optional explicit version; must match the current registry version if given. */
  agreementVersion?: string
  /** Optional human label for the witnessing rep (display only in the PDF). */
  witnessLabel?: string | null
  /** Optional stylus/finger signature PNG bytes (non-gating). */
  drawnSignature?: Buffer | null
}

/**
 * The assisted contract-signing ceremony. Order (plan Slice 2):
 *   1. Fail-closed legal gate (refuse production binding write while gated).
 *   2. Resolve + validate the agreement version against the registry; pin its hash.
 *   3. Admin-never-signs: a witness (actorAdminId) is required and can never be the
 *      signerName; the typed name must be non-empty.
 *   4. Render the PDF and write it to private R2 (fail-closed STORAGE_NOT_ENABLED).
 *   5. ONE transaction: insert the immutable MerchantAgreementRecord; upsert the
 *      MerchantContract pointer (signatureMethod stays CLICK_TO_AGREE); flip
 *      Merchant.contractStatus = SIGNED + contractStartDate; write the in-tx audit.
 */
export async function signAgreementInPerson(
  prisma: PrismaClient,
  input: SignAgreementInPersonInput,
  ctx: { ipAddress: string; userAgent: string },
) {
  // (1) Fail-closed legal gate BEFORE any work.
  assertBindingWriteAllowed()

  // (3a) Signature-of-record + admin-never-signs invariants.
  const signerName = input.signerName?.trim() ?? ''
  const signerRoleConfirmation = input.signerRoleConfirmation?.trim() ?? ''
  if (signerName.length === 0 || signerRoleConfirmation.length === 0) {
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }
  if (!input.actorAdminId || input.actorAdminId.trim().length === 0) {
    // A ceremony always has a witnessing rep (the authed admin); defence in depth.
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }
  // The witness (an admin id) can never BE the typed signature-of-record.
  if (input.actorAdminId.trim() === signerName) {
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }

  const merchant = await prisma.merchant.findUnique({
    where: { id: input.merchantId },
    select: {
      contractStatus: true,
      businessName: true,
      tradingName: true,
      companyNumber: true,
      vatNumber: true,
    },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  // Double-sign guard (mirrors the self-serve CONTRACT_ALREADY_SIGNED block). Re-sign
  // of a NEW version is a future concern (renewal); this slice blocks a second sign.
  if (merchant.contractStatus === 'SIGNED') throw new AppError('CONTRACT_ALREADY_SIGNED')

  // (2) Resolve + pin the version from the registry (never trust a caller hash).
  const agreement = input.agreementVersion
    ? getAgreementVersion(input.agreementVersion)
    : getCurrentAgreement()
  if (!agreement || agreement.version !== getCurrentAgreement().version) {
    // Only the CURRENT version is signable; an unknown or stale id fails closed.
    throw new AppError('AGREEMENT_VERSION_UNKNOWN')
  }

  const signedAt = new Date()

  // (4) Render + store the PDF (fail-closed STORAGE_NOT_ENABLED).
  const pdfKey = await renderAndStoreAgreementPdf({
    merchantId: input.merchantId,
    agreement,
    signerName,
    signerRoleConfirmation,
    businessLegalName: merchant.businessName,
    tradingName: merchant.tradingName,
    companyNumber: merchant.companyNumber,
    vatNumber: merchant.vatNumber,
    method: 'IN_PERSON_ASSISTED',
    witnessLabel: input.witnessLabel ?? null,
    signedAt,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    drawnSignature: input.drawnSignature ?? null,
  })

  // (5) One transaction: evidence + pointer + status + audit.
  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.merchantAgreementRecord.create({
      data: {
        merchantId: input.merchantId,
        agreementVersion: agreement.version,
        contentHash: agreement.contentHash,
        signerName,
        signerRoleConfirmation,
        actorAdminId: input.actorAdminId,
        method: 'IN_PERSON_ASSISTED',
        signedAt,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        pdfKey,
        drawnSignatureKey: null,
      },
      select: { id: true, signedAt: true },
    })

    await tx.merchantContract.upsert({
      where: { merchantId: input.merchantId },
      create: {
        merchantId: input.merchantId,
        signedAt,
        ipAddress: ctx.ipAddress,
        tcVersion: agreement.version,
        signatureMethod: 'CLICK_TO_AGREE',
      },
      update: {
        signedAt,
        ipAddress: ctx.ipAddress,
        tcVersion: agreement.version,
        signatureMethod: 'CLICK_TO_AGREE',
      },
    })

    await tx.merchant.update({
      where: { id: input.merchantId },
      data: { contractStatus: 'SIGNED', contractStartDate: signedAt },
    })

    // In-tx audit. No signer PII in the audit payload (name/IP/UA live on the
    // record + the audit row's own request-context columns).
    await writeAuditLogTx(tx, {
      entityId: input.merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_AGREEMENT_SIGNED_IN_PERSON',
      actorId: input.actorAdminId,
      actorType: 'ADMIN',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: {
        recordId: created.id,
        agreementVersion: agreement.version,
        contentHash: agreement.contentHash,
        method: 'IN_PERSON_ASSISTED',
      },
    })

    return created
  })

  return {
    recordId: record.id,
    agreementVersion: agreement.version,
    contentHash: agreement.contentHash,
    signedAt: record.signedAt,
    contractStatus: 'SIGNED' as const,
    gated: isAgreementGated(),
  }
}
