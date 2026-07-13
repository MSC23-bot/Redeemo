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
import {
  getAgreementVersion,
  getCurrentAgreement,
  getLatestNonDraftAgreement,
  type AgreementVersion,
} from './versions'
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

/**
 * Effective gating for a SPECIFIC version (review-round S1). A version is gated when it
 * is a DRAFT artifact OR while legal review is still required. Wiring `isDraft` in means
 * a draft is gated (watermark + binding block) even if the env flag is lifted - defence
 * in depth: lifting AGREEMENT_LEGAL_REVIEW_REQUIRED can never un-gate a draft. A
 * non-draft (the legacy 1.0, or a future frozen 2.0) is gated only while the env flag is
 * on, so lifting the flag serves it cleanly (no watermark) in production.
 */
export function isVersionGated(version: AgreementVersion): boolean {
  return version.isDraft || legalReviewRequired()
}

/**
 * Production version SELECTION (review-round S2). Serve the current version UNLESS this
 * is a production deploy and the current version is a draft, in which case fall back to
 * the latest non-draft (the legacy 1.0 today; a frozen 2.0 after Slice 6). Non-production
 * always serves the current version (draft) for QA. Generic, not hardcoded to 1.0: once a
 * non-draft becomes current, production serves it with no further change.
 */
export function getServedAgreement(): AgreementVersion {
  const current = getCurrentAgreement()
  if (isProductionDeploy() && current.isDraft) {
    return getLatestNonDraftAgreement() ?? current
  }
  return current
}

/**
 * Fail-closed gate on a BINDING write for a SPECIFIC version. Refuses
 * (AGREEMENT_LEGAL_REVIEW_REQUIRED) only when the version is gated (draft OR legal review
 * required) AND this is a production deploy. Staging and dev run fully (records written,
 * DRAFT-watermarked) for QA. A DRAFT is refused in production even with the env flag off
 * (S1). Independent of STORAGE_ENABLED.
 */
export function assertBindingWriteAllowed(version: AgreementVersion): void {
  if (isVersionGated(version) && isProductionDeploy()) {
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
    gated: isVersionGated(input.agreement),
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
 * The assisted contract-signing ceremony. Order (plan Slice 2 + review-round S1/N1):
 *   1. Resolve + validate the agreement version against the registry; pin its hash.
 *      The ceremony always signs the CURRENT version (an unknown/stale id fails closed).
 *   2. Fail-closed legal gate for THAT version (refuse production binding write while the
 *      version is gated; a draft is refused in production even with the env flag off).
 *   3. Admin-never-signs: a witness (actorAdminId) is required and can never be the
 *      signerName; the typed name must be non-empty.
 *   4. Merchant read + fast double-sign pre-check (UX).
 *   5. Render the PDF and write it to private R2 (fail-closed STORAGE_NOT_ENABLED).
 *   6. ONE transaction: an atomic conditional flip (contractStatus NOT already SIGNED)
 *      is the double-sign guard (N1: the loser of two concurrent ceremonies throws
 *      CONTRACT_ALREADY_SIGNED and writes nothing); then insert the immutable
 *      MerchantAgreementRecord; upsert the MerchantContract pointer (signatureMethod
 *      stays CLICK_TO_AGREE); write the in-tx audit.
 */
export async function signAgreementInPerson(
  prisma: PrismaClient,
  input: SignAgreementInPersonInput,
  ctx: { ipAddress: string; userAgent: string },
) {
  // (1) Resolve + pin the version from the registry (never trust a caller hash). No DB.
  const agreement = input.agreementVersion
    ? getAgreementVersion(input.agreementVersion)
    : getCurrentAgreement()
  if (!agreement || agreement.version !== getCurrentAgreement().version) {
    // Only the CURRENT version is signable; an unknown or stale id fails closed.
    throw new AppError('AGREEMENT_VERSION_UNKNOWN')
  }

  // (2) Fail-closed legal gate for the resolved version BEFORE any read or write.
  assertBindingWriteAllowed(agreement)

  // (3) Signature-of-record + admin-never-signs invariants.
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

  // (4) Merchant read + fast double-sign pre-check (the authoritative guard is the
  // in-tx conditional flip at step 6; this is a cheap early exit for good UX).
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
  if (merchant.contractStatus === 'SIGNED') throw new AppError('CONTRACT_ALREADY_SIGNED')

  const signedAt = new Date()

  // (5) Render + store the PDF (fail-closed STORAGE_NOT_ENABLED).
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

  // (6) One transaction: atomic double-sign guard + evidence + pointer + status + audit.
  const record = await prisma.$transaction(async (tx) => {
    // N1 (TOCTOU): the FIRST write is a conditional flip that only matches a merchant
    // NOT already SIGNED. Postgres row-locks the matched row, so of two concurrent
    // ceremonies exactly one flips (count 1) and the other sees count 0 after the first
    // commits - it throws and writes NO evidence row (this runs before the record insert).
    const flip = await tx.merchant.updateMany({
      where: { id: input.merchantId, contractStatus: { not: 'SIGNED' } },
      data: { contractStatus: 'SIGNED', contractStartDate: signedAt },
    })
    if (flip.count === 0) throw new AppError('CONTRACT_ALREADY_SIGNED')

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

    // (status flip already applied atomically by the conditional guard above.)

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
    gated: isVersionGated(agreement),
  }
}
