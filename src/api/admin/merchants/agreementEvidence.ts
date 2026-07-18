// D65 lane-2: the ADMIN signing-evidence read surface (decision doc
// 2026-07-15-d65-legal-object §11 tiering + §17 PDF integrity retrieval).
//
// Two reads, both gated on `contract:view-evidence` (OPERATIONS + SUPER_ADMIN only) and both
// bounded by the shared evidence limiter:
//   - getAgreementEvidenceDetail : the ORDINARY-tier evidence detail. Returns the version +
//     hashes + signatory + method + signed-at + witness NAME. The WITHHELD tier (witnessEmail /
//     ipAddress / userAgent) is never SELECTED here, so it cannot appear in the payload by
//     construction; it stays reserved for a future separately-gated legal-export surface (§11).
//     The raw pdfKey is likewise never returned. Every view is audited (AGREEMENT_EVIDENCE_VIEWED).
//   - retrieveAgreementEvidencePdf : the SERVER-PROXIED signed-PDF retrieval (§17). The backend
//     FETCHES the stored bytes, RE-HASHES them, COMPARES to the record's pdfHash, and returns
//     THOSE SAME bytes ONLY on a match. A missing object or a hash mismatch releases NO PDF, fails
//     closed (AGREEMENT_EVIDENCE_INTEGRITY_FAILURE), writes an integrity-failure audit row, and
//     surfaces a high-severity ops/reconciliation alert. Storage dark -> fail closed
//     (STORAGE_NOT_ENABLED) before any read. No presigned URL (that reintroduces the §17 TOCTOU gap).
//
// MERCHANT-SCOPED, NON-LEAKING: every record read is `where merchantId = :id`, so a record can
// never be read across the merchant boundary, and an unknown merchant and a merchant with no
// evidence both return the SAME EVIDENCE_NOT_FOUND (existence for another merchant is never
// revealed). A defensive record.merchantId === merchantId assert restates the boundary.

import crypto from 'node:crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { isStorageEnabled, getObject } from '../../shared/storage'
import { getAgreementVersion } from '../../merchant/agreement/versions'
import { isVersionWatermarked } from '../../merchant/agreement/service'

type EvidenceCtx = { adminId: string; ipAddress: string; userAgent: string }

// The ORDINARY-tier columns ONLY. witnessEmail / ipAddress / userAgent / pdfKey are deliberately
// absent from this select, so the WITHHELD tier can never reach the ordinary-tier payload.
const ORDINARY_TIER_SELECT = {
  id: true,
  merchantId: true,
  agreementVersion: true,
  contentHash: true,
  reviewedContentHash: true,
  signerName: true,
  signerRoleConfirmation: true,
  method: true,
  signedAt: true,
  witnessName: true,
} as const

export interface AgreementEvidenceDetail {
  agreementVersion: string
  /** The version's own draft status (registry lookup; false for an unknown/frozen version). */
  isDraft: boolean
  /** Watermark / pending-legal-review driver (isVersionWatermarked semantics). */
  gated: boolean
  /** The canonical (unsubstituted-template) content hash pinned at signing. */
  contentHash: string
  /** sha256 of the immutable personalised reviewed body (the legally accepted object). */
  reviewedContentHash: string
  /** The signature of record (typed full name). */
  signerName: string
  /** The signatory's authority attestation. */
  signerRoleConfirmation: string
  method: string
  /** ISO over the wire (Prisma DateTime serialises to a string). */
  signedAt: Date
  /** The witnessing rep's NAME (IN_PERSON_ASSISTED); null on self-serve. Email is WITHHELD. */
  witnessName: string | null
}

/**
 * Read the ORDINARY-tier signing evidence for a merchant's LATEST agreement record. Scoped
 * `where merchantId = :id` (a record is never read across the merchant boundary). EVIDENCE_NOT_FOUND
 * (non-leaking 404) when the merchant has no record. Audits AGREEMENT_EVIDENCE_VIEWED (no PII, no
 * pdfKey). The withheld tier is never selected, so it cannot appear in the returned object.
 */
export async function getAgreementEvidenceDetail(
  prisma: PrismaClient,
  merchantId: string,
  ctx: EvidenceCtx,
): Promise<AgreementEvidenceDetail> {
  const record = await prisma.merchantAgreementRecord.findFirst({
    where: { merchantId },
    orderBy: { signedAt: 'desc' },
    select: ORDINARY_TIER_SELECT,
  })
  // Non-leaking: no record scoped to :id -> the same not-found shape whether the merchant is
  // unknown or simply unsigned. The defensive relationship assert restates the scoped boundary.
  if (!record || record.merchantId !== merchantId) throw new AppError('EVIDENCE_NOT_FOUND')

  const version = getAgreementVersion(record.agreementVersion)

  // Audit the view (awaited, actor-attributed). No signer PII / IP / UA / pdfKey in metadata;
  // the audit row's own ipAddress/userAgent columns carry the request context.
  await writeAuditLogTx(prisma, {
    entityId: merchantId,
    entityType: 'merchant',
    event: 'AGREEMENT_EVIDENCE_VIEWED',
    actorId: ctx.adminId,
    actorType: 'ADMIN',
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    metadata: { recordId: record.id, agreementVersion: record.agreementVersion },
  })

  return {
    agreementVersion: record.agreementVersion,
    isDraft: version?.isDraft ?? false,
    gated: version ? isVersionWatermarked(version) : false,
    contentHash: record.contentHash,
    reviewedContentHash: record.reviewedContentHash,
    signerName: record.signerName,
    signerRoleConfirmation: record.signerRoleConfirmation,
    method: record.method,
    signedAt: record.signedAt,
    witnessName: record.witnessName,
  }
}

/**
 * D65 lane-2 §17 integrity-failure alert. A missing signed-PDF object or a hash mismatch means the
 * stored artifact no longer matches the record (tamper / loss) - a HIGH-SEVERITY ops signal that
 * needs manual reconciliation, not a routine warning. Mirrors reportOrphanedAgreementPdf's
 * mechanism (the project metrics boundary's structured high-severity console tier): a stable,
 * greppable event tag + a redacted structured payload. REDACTED: merchantId + recordId + pdfKey +
 * a coarse reason class only - never signer PII, never raw provider text. PURE LOGGING: never throws.
 */
export function reportAgreementEvidenceIntegrityFailure(input: {
  merchantId: string
  recordId: string
  pdfKey: string
  reason: 'missing' | 'hash_mismatch'
}): void {
  try {
    console.error('[agreement][RECONCILE] signed-agreement PDF integrity check FAILED; no PDF released', {
      event: 'AGREEMENT_EVIDENCE_INTEGRITY_FAILURE',
      severity: 'high',
      needsReconciliation: true,
      merchantId: input.merchantId,
      recordId: input.recordId,
      pdfKey: input.pdfKey,
      reason: input.reason,
    })
  } catch {
    // The reconciliation logger itself must never throw into the fail-closed path.
  }
}

// Fail closed on an integrity fault: best-effort audit (never masks the fail-closed throw), the
// high-severity alert, then throw AGREEMENT_EVIDENCE_INTEGRITY_FAILURE. Releases NO bytes.
async function failEvidenceIntegrity(
  prisma: PrismaClient,
  ctx: EvidenceCtx,
  merchantId: string,
  record: { id: string; pdfKey: string },
  reason: 'missing' | 'hash_mismatch',
): Promise<never> {
  try {
    await writeAuditLogTx(prisma, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'AGREEMENT_EVIDENCE_INTEGRITY_FAILURE',
      actorId: ctx.adminId,
      actorType: 'ADMIN',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      // recordId + reason only; the raw pdfKey stays OUT of the audit trail (lives in the alert).
      metadata: { recordId: record.id, reason },
    })
  } catch (auditErr) {
    // An audit-write failure must not mask the fail-closed integrity throw.
    console.error('[agreement][evidence] integrity-failure audit write failed', {
      merchantId,
      recordId: record.id,
      causeClass: auditErr instanceof Error ? auditErr.name : typeof auditErr,
    })
  }
  reportAgreementEvidenceIntegrityFailure({ merchantId, recordId: record.id, pdfKey: record.pdfKey, reason })
  throw new AppError('AGREEMENT_EVIDENCE_INTEGRITY_FAILURE')
}

export interface AgreementEvidencePdf {
  /** The verified PDF bytes (bytes fetched == bytes hashed == bytes returned). */
  bytes: Buffer
  /** The record id (for the download filename + logging; NOT the storage key). */
  recordId: string
}

/**
 * Server-proxied signed-PDF retrieval with integrity verification (decision doc §17). Fails closed
 * with STORAGE_NOT_ENABLED when storage is dark (before any read). Resolves the merchant's LATEST
 * record (scoped, non-leaking EVIDENCE_NOT_FOUND when none). FETCHES the stored bytes, RE-HASHES
 * them, COMPARES to the record's pdfHash, and returns THOSE SAME bytes ONLY on a match. A missing
 * object or a mismatch releases NO PDF, fails closed (AGREEMENT_EVIDENCE_INTEGRITY_FAILURE), audits
 * the failure, and surfaces the high-severity alert. The raw storage key is never returned.
 */
export async function retrieveAgreementEvidencePdf(
  prisma: PrismaClient,
  merchantId: string,
  ctx: EvidenceCtx,
): Promise<AgreementEvidencePdf> {
  // Fail closed BEFORE any read when storage is dark (never construct the S3 client).
  if (!isStorageEnabled()) throw new AppError('STORAGE_NOT_ENABLED')

  const record = await prisma.merchantAgreementRecord.findFirst({
    where: { merchantId },
    orderBy: { signedAt: 'desc' },
    select: { id: true, merchantId: true, pdfKey: true, pdfHash: true },
  })
  if (!record || record.merchantId !== merchantId) throw new AppError('EVIDENCE_NOT_FOUND')

  // RETRIEVE the stored bytes. A missing/unreadable object is a fail-closed integrity fault (§17):
  // release nothing, audit + alert, throw. getObject already asserted storage-enabled + key-shape.
  let bytes: Buffer
  try {
    bytes = await getObject(record.pdfKey)
  } catch {
    return failEvidenceIntegrity(prisma, ctx, merchantId, record, 'missing')
  }

  // RE-HASH the exact bytes fetched and COMPARE to the pinned pdfHash. A mismatch means the stored
  // artifact no longer matches the record (tamper / corruption) -> fail closed, release NO bytes.
  const actualHash = crypto.createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== record.pdfHash) {
    return failEvidenceIntegrity(prisma, ctx, merchantId, record, 'hash_mismatch')
  }

  // Verified: bytes fetched == bytes hashed == bytes returned.
  return { bytes, recordId: record.id }
}
