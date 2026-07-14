// D65 Slice 2: the agreement-signing backend core.
//
// Two write paths share one evidence model (MerchantAgreementRecord, immutable /
// append-only) and one PDF renderer:
//   - signAgreementInPerson(...)  : the assisted ceremony on a Redeemo rep's device.
//     The owner types their own name as the signature of record; the authenticated rep
//     is recorded as the WITNESS (actorAdminId + witnessName/witnessEmail), not in the
//     signer field. An obvious same-name signing is refused, but the system cannot
//     independently prove two distinct humans were present. method = IN_PERSON_ASSISTED.
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
import { isStorageEnabled, putObject, deleteObject } from '../../shared/storage'
import {
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
 * BINDING-write gating for a SPECIFIC version (review-round S1). A version is gated for a
 * binding write when it is a DRAFT artifact OR while legal review is still required. Wiring
 * `isDraft` in means a draft is gated for the binding block even if the env flag is lifted:
 * defence in depth (lifting AGREEMENT_LEGAL_REVIEW_REQUIRED can never let a draft bind in
 * production). A non-draft (the legacy 1.0, or a future frozen 2.0) is gated only while the
 * env flag is on, so lifting the flag binds it in production.
 *
 * SCOPE (Codex correction FIX 3): this drives the BINDING block ONLY (assertBindingWriteAllowed).
 * It does NOT drive the PDF watermark or the confirmation labelling: those follow the version's
 * own draft status (isVersionWatermarked), decoupled from the env flag. See that helper.
 */
export function isVersionGated(version: AgreementVersion): boolean {
  return version.isDraft || legalReviewRequired()
}

/**
 * DRAFT-watermark / pending-review labelling driver (Codex correction FIX 3). The watermark
 * and any "pending legal review" labelling on the PDF and the sign confirmation reflect the
 * VERSION's own legal status ONLY: a draft version is ALWAYS watermarked; a non-draft version
 * (the legacy 1.0, or a future frozen 2.0) is NEVER watermarked, regardless of
 * AGREEMENT_LEGAL_REVIEW_REQUIRED. The env flag is the CEREMONY ENABLEMENT gate (see
 * assertBindingWriteAllowed), NOT a watermark driver: binding a clean non-draft in production
 * must never stamp it "DRAFT - PENDING LEGAL REVIEW". Stated plainly for the solicitor packet:
 * watermark = the VERSION's legal status; env flag = ceremony enablement gate.
 */
export function isVersionWatermarked(version: AgreementVersion): boolean {
  return version.isDraft
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
 * DRAFT-watermarked when (and only when) the agreement version is a draft
 * (isVersionWatermarked), independent of the env flag (Codex correction FIX 3).
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
    // FIX 3: the watermark reflects the version's OWN legal status (draft), not the env flag.
    gated: isVersionWatermarked(input.agreement),
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
  /** The authenticated witnessing rep (req.user.sub). Recorded as the witness, not in the
   * signer field; the typed signerName below is the owner's own. */
  actorAdminId: string
  /** Typed full name = the signature of record. */
  signerName: string
  /** Authority attestation role (e.g. "Owner", "Director"). */
  signerRoleConfirmation: string
  /** Optional client-echoed version (integrity check). Absent = server current; if given
   * it must equal the served/current version, else AGREEMENT_VERSION_MISMATCH (409). */
  agreementVersion?: string
  /** Optional stylus/finger signature PNG bytes (non-gating). */
  drawnSignature?: Buffer | null
  // FIX 2: there is NO client-supplied witness label. The witness IDENTITY is looked up
  // server-side from AdminUser by actorAdminId (authenticated evidence, never request text).
}

/**
 * The assisted contract-signing ceremony. Order (plan Slice 2 + review-round S1/N1):
 *   1. Resolve the CURRENT version SERVER-SIDE + pin its hash; the PDF, the immutable
 *      evidence record, and the MerchantContract pointer all derive from THIS one object.
 *      Any client-echoed version is an integrity check (a stale/mismatched id is refused,
 *      409 AGREEMENT_VERSION_MISMATCH, before any read or write).
 *   2. Fail-closed legal gate for THAT version (refuse production binding write while the
 *      version is gated; a draft is refused in production even with the env flag off).
 *   3. Signature-of-record + witness invariants (FIX 2): the typed signer name + role must
 *      be non-empty; an authenticated witnessing rep (actorAdminId) is required and its
 *      IDENTITY is looked up server-side from AdminUser (authenticated evidence, never
 *      request text). A best-effort separate-person safeguard refuses when the typed signer
 *      name case-insensitively equals the rep's own full name. This records that the
 *      authenticated rep witnessed and the signer typed their own name + attested authority;
 *      it cannot, on its own, technically prove two distinct humans were physically present.
 *   4. Merchant read + fast double-sign pre-check (UX).
 *   5. Render the PDF and write it to private R2 (fail-closed STORAGE_NOT_ENABLED).
 *   6. ONE transaction: an atomic conditional flip (contractStatus NOT already SIGNED)
 *      is the double-sign guard (N1: the loser of two concurrent ceremonies throws
 *      CONTRACT_ALREADY_SIGNED and writes nothing); then insert the immutable
 *      MerchantAgreementRecord; upsert the MerchantContract pointer (signatureMethod
 *      stays CLICK_TO_AGREE); write the in-tx audit. On a failed or lost transaction the
 *      PDF written in step 5 would orphan in R2, so a compensating best-effort delete runs
 *      (FIX 1) before the original error is rethrown.
 */
export async function signAgreementInPerson(
  prisma: PrismaClient,
  input: SignAgreementInPersonInput,
  ctx: { ipAddress: string; userAgent: string },
) {
  // (1) Resolve + pin the version SERVER-SIDE from the registry (never trust a caller
  // hash). The ceremony always signs the CURRENT version; the PDF, the immutable evidence
  // record, and the MerchantContract pointer all derive from THIS one object.
  const agreement = getCurrentAgreement()
  // The optional client-echoed agreementVersion is an INTEGRITY CHECK ONLY: absent means
  // "use the server current"; present must equal the served/current version, else the
  // client reviewed a stale page and we refuse (409) before any read or write.
  if (input.agreementVersion && input.agreementVersion !== agreement.version) {
    throw new AppError('AGREEMENT_VERSION_MISMATCH')
  }

  // (2) Fail-closed legal gate for the resolved version BEFORE any read or write.
  assertBindingWriteAllowed(agreement)

  // (3) Signature-of-record + witness invariants (FIX 2).
  const signerName = input.signerName?.trim() ?? ''
  const signerRoleConfirmation = input.signerRoleConfirmation?.trim() ?? ''
  if (signerName.length === 0 || signerRoleConfirmation.length === 0) {
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }
  const actorAdminId = input.actorAdminId?.trim() ?? ''
  if (actorAdminId.length === 0) {
    // A ceremony always has a witnessing rep (the authed admin); defence in depth.
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }

  // Witness IDENTITY is AUTHENTICATED evidence: look it up server-side from AdminUser by
  // the authenticated actorAdminId. The witness name/email persisted below come from THIS
  // lookup, never from client-supplied text (there is no client witness field anymore).
  const witness = await prisma.adminUser.findUnique({
    where: { id: actorAdminId },
    select: { firstName: true, lastName: true, email: true },
  })
  if (!witness) {
    // The authenticated rep must resolve to a real admin; fail closed otherwise.
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }
  const witnessName = `${witness.firstName} ${witness.lastName}`.trim()
  const witnessEmail = witness.email

  // Best-effort separate-person safeguard: refuse when the typed signer name
  // case-insensitively equals the authenticated rep's OWN full name. This is an honest
  // heuristic, not proof: it blocks the rep from typing their own name as the signature of
  // record, but cannot technically guarantee two distinct humans were physically present.
  if (witnessName.length > 0 && signerName.toLowerCase() === witnessName.toLowerCase()) {
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }
  // The witness identity for the PDF display + evidence row (server-derived, not client text).
  const witnessDisplay = witnessEmail ? `${witnessName} (${witnessEmail})` : witnessName

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
    // FIX 2: the witness display is the server-looked-up rep identity, not client text.
    witnessLabel: witnessDisplay,
    signedAt,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    drawnSignature: input.drawnSignature ?? null,
  })

  // (6) One transaction: atomic double-sign guard + evidence + pointer + status + audit.
  // FIX 1: the PDF at step 5 is already in R2. If this transaction fails or loses the N1
  // race, that object would orphan, so a compensating best-effort delete runs in the catch
  // before the original error is rethrown; a cleanup failure is logged and never masks it.
  let record
  try {
    record = await prisma.$transaction(async (tx) => {
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
        actorAdminId,
        // FIX 2: authenticated witness identity (server-side AdminUser lookup) as evidence.
        witnessName,
        witnessEmail,
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
      actorId: actorAdminId,
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
  } catch (err) {
    // FIX 1 (orphan compensation): the PDF was written to private R2 before this
    // transaction. Best-effort delete it so a failed/lost tx does not leave an orphan,
    // then rethrow the ORIGINAL error. A cleanup failure is logged and swallowed so it
    // can never mask the original error that triggered the rollback.
    try {
      await deleteObject(pdfKey)
    } catch (cleanupErr) {
      console.warn(`[agreement] orphan PDF cleanup for "${pdfKey}" failed (ignored):`, cleanupErr)
    }
    throw err
  }

  return {
    recordId: record.id,
    agreementVersion: agreement.version,
    contentHash: agreement.contentHash,
    signedAt: record.signedAt,
    contractStatus: 'SIGNED' as const,
    // FIX 3: the confirmation "gated" flag reflects the version's draft status (watermark),
    // decoupled from the env flag. For the ceremony this is always the current draft.
    gated: isVersionWatermarked(agreement),
  }
}
