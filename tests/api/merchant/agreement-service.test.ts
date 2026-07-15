import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// D65 Slice 2 + personalised-agreement service suite (mocked Prisma + mocked storage; no
// DB, no R2). Load-bearing pins:
//  - LEGAL gate: AGREEMENT_LEGAL_REVIEW_REQUIRED defaults ON (fail-closed); production
//    identity from REDEEMO_DEPLOY_ENV; a gated PRODUCTION binding write refused BEFORE any
//    read/write; staging runs fully.
//  - Ceremony: server RE-DERIVES the personalised reviewed body + reviewedContentHash and
//    409s AGREEMENT_REVIEW_HASH_MISMATCH on a tampered echo BEFORE any PDF/DB/status/audit;
//    ONE transaction with the immutable record (reviewedBody + reviewedContentHash + pdfHash +
//    signer + witness) + the MerchantContract upsert + the atomic flip + the in-tx audit;
//    version/hash pinned from the REGISTRY; double-sign guarded; storage fail-closed +
//    upload-then-tx compensation.
//  - Self-serve (acceptContract): TWO lanes by SERVED version. Legacy v1 -> MerchantContract
//    only (no PDF, no record, no signer requirement). D65 v2+ -> real signer name + role
//    required, fail-closed storage, full reviewedBody/hash/pdfHash evidence record.
//  - Both lanes share the reviewedBody module (parity).

vi.mock('../../../src/api/shared/storage', () => ({
  isStorageEnabled: vi.fn(() => process.env.STORAGE_ENABLED === 'true'),
  putObject: vi.fn(async () => ({ key: 'document/m1/deadbeefdeadbeef.pdf' })),
  deleteObject: vi.fn(async () => {}),
}))

// Mock the PDF renderer: the services only need a Buffer back (the real renderer has its own
// suite). renderAndStoreAgreementPdf still runs for real, so it computes pdfHash over THESE
// bytes and calls the mocked putObject.
vi.mock('../../../src/api/merchant/agreement/pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/merchant/agreement/pdf')>()
  return {
    ...actual,
    renderAgreementPdf: vi.fn(async () => Buffer.from('%PDF-mock')),
  }
})

import {
  isProductionDeploy,
  legalReviewRequired,
  isVersionGated,
  getServedAgreement,
  assertBindingWriteAllowed,
  signAgreementInPerson,
  renderAndStoreAgreementPdf,
  previewAgreement,
} from '../../../src/api/merchant/agreement/service'
import { acceptContract, previewOwnContract } from '../../../src/api/merchant/onboarding/service'
import { getAgreementVersion, getCurrentAgreement, computeContentHash } from '../../../src/api/merchant/agreement/versions'
import { renderReviewedBody } from '../../../src/api/merchant/agreement/reviewedBody'
import { putObject, deleteObject } from '../../../src/api/shared/storage'
import { renderAgreementPdf } from '../../../src/api/merchant/agreement/pdf'
import { AppError } from '../../../src/api/shared/errors'

const ctx = { ipAddress: '203.0.113.9', userAgent: 'RedeemoRepTablet/1.0' }
const MERCHANT_ID = 'merch-tandoori-1'
const WITNESS = 'admin-rep-42'
const WITNESS_ADMIN = { firstName: 'Sam', lastName: 'Rep', email: 'sam.rep@redeemo.com' }
const WITNESS_FULL_NAME = 'Sam Rep'
const CURRENT = getCurrentAgreement()
const LEGACY = getAgreementVersion('1.0')!

const MERCHANT_ROW = {
  contractStatus: 'NOT_SIGNED',
  businessName: 'Kovalam Tandoori Ltd',
  tradingName: 'Kovalam Tandoori',
  companyNumber: '01234567',
  vatNumber: 'GB999999973',
}

// The server-derived reviewedContentHash for the standard ceremony inputs (Priya Nair / Owner
// / MERCHANT_ROW identity / current version / IN_PERSON_ASSISTED). Used as the honest echo.
function expectedCeremonyHash() {
  return renderReviewedBody({
    version: CURRENT.version,
    canonicalContentHash: CURRENT.contentHash,
    content: CURRENT.content,
    method: 'IN_PERSON_ASSISTED',
    businessLegalName: MERCHANT_ROW.businessName,
    tradingName: MERCHANT_ROW.tradingName,
    companyNumber: MERCHANT_ROW.companyNumber,
    vatNumber: MERCHANT_ROW.vatNumber,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
  }).reviewedContentHash
}

// The server-derived self-serve echo (same inputs, SELF_SERVE_CLICK method). Used as the honest
// reviewedContentHash echo the v2+ self-serve accept path now REQUIRES (FIX 2).
function expectedSelfServeHash() {
  return renderReviewedBody({
    version: CURRENT.version,
    canonicalContentHash: CURRENT.contentHash,
    content: CURRENT.content,
    method: 'SELF_SERVE_CLICK',
    businessLegalName: MERCHANT_ROW.businessName,
    tradingName: MERCHANT_ROW.tradingName,
    companyNumber: MERCHANT_ROW.companyNumber,
    vatNumber: MERCHANT_ROW.vatNumber,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
  }).reviewedContentHash
}

function makeTx() {
  return {
    merchantAgreementRecord: {
      create: vi.fn().mockResolvedValue({ id: 'rec-1', signedAt: new Date('2026-07-14T10:00:00Z') }),
    },
    merchantContract: {
      upsert: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    merchant: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
}

function makePrisma(tx: any, merchantRow: Record<string, unknown> | null = MERCHANT_ROW) {
  return {
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
    merchant: { findUnique: vi.fn().mockResolvedValue(merchantRow) },
    adminUser: { findUnique: vi.fn().mockResolvedValue(WITNESS_ADMIN) },
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: MERCHANT_ID }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: 'ma1', role: 'OWNER' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any
}

const ORIGINAL_ENV = { ...process.env }
beforeEach(() => {
  vi.clearAllMocks()
  process.env.REDEEMO_DEPLOY_ENV = 'staging'
  process.env.STORAGE_ENABLED = 'true'
  delete process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED
})
afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('environment + legal gate mechanics', () => {
  it('legalReviewRequired defaults TRUE and only the literal "false" lifts it', () => {
    delete process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED
    expect(legalReviewRequired()).toBe(true)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'true'
    expect(legalReviewRequired()).toBe(true)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = '0'
    expect(legalReviewRequired()).toBe(true)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'FALSE'
    expect(legalReviewRequired()).toBe(true)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    expect(legalReviewRequired()).toBe(false)
  })

  it('isProductionDeploy: REDEEMO_DEPLOY_ENV is the primary signal', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(isProductionDeploy()).toBe(false)
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    expect(isProductionDeploy()).toBe(true)
  })

  it('isProductionDeploy: unset deploy id falls back to NODE_ENV, fail-closed toward production', () => {
    delete process.env.REDEEMO_DEPLOY_ENV
    const nodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    expect(isProductionDeploy()).toBe(true)
    process.env.NODE_ENV = 'test'
    expect(isProductionDeploy()).toBe(false)
    process.env.NODE_ENV = nodeEnv
  })

  it('assertBindingWriteAllowed refuses ONLY gated + production (env-flag half, non-draft version)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(() => assertBindingWriteAllowed(LEGACY)).not.toThrow()
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    expect(() => assertBindingWriteAllowed(LEGACY)).toThrow(AppError)
    try {
      assertBindingWriteAllowed(LEGACY)
    } catch (e) {
      expect((e as AppError).code).toBe('AGREEMENT_LEGAL_REVIEW_REQUIRED')
    }
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    expect(() => assertBindingWriteAllowed(LEGACY)).not.toThrow()
  })

  it('S1: a DRAFT version is refused in PRODUCTION even with the env flag lifted (isDraft half)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    expect(() => assertBindingWriteAllowed(LEGACY)).not.toThrow()
    expect(() => assertBindingWriteAllowed(CURRENT)).toThrow(AppError)
    try {
      assertBindingWriteAllowed(CURRENT)
    } catch (e) {
      expect((e as AppError).code).toBe('AGREEMENT_LEGAL_REVIEW_REQUIRED')
    }
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(() => assertBindingWriteAllowed(CURRENT)).not.toThrow()
  })

  it('S1: isVersionGated = isDraft OR legalReviewRequired', () => {
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    expect(CURRENT.isDraft).toBe(true)
    expect(isVersionGated(CURRENT)).toBe(true)
    expect(LEGACY.isDraft).toBe(false)
    expect(isVersionGated(LEGACY)).toBe(false)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'true'
    expect(isVersionGated(LEGACY)).toBe(true)
  })

  it('S2: getServedAgreement serves current in non-production, the legacy non-draft in production+draft', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(getServedAgreement().version).toBe(CURRENT.version)
    expect(getServedAgreement().isDraft).toBe(true)
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    const served = getServedAgreement()
    expect(served.version).toBe('1.0')
    expect(served.isDraft).toBe(false)
    expect(served.content).toContain('Redeemo Merchant Agreement v1.0')
  })
})

describe('signAgreementInPerson (the assisted ceremony)', () => {
  // FIX 1: agreementVersion + reviewedContentHash are now REQUIRED (the ceremony always echoes
  // the preview's version + hash). The base INPUT carries the honest values; the negative tests
  // below override or omit them.
  const INPUT = {
    merchantId: MERCHANT_ID,
    actorAdminId: WITNESS,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
    agreementVersion: CURRENT.version,
    reviewedContentHash: expectedCeremonyHash(),
  }

  it('refuses a gated PRODUCTION binding write BEFORE any read or write', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'AGREEMENT_LEGAL_REVIEW_REQUIRED',
    })
    expect(prisma.merchant.findUnique).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
  })

  it('runs fully on staging while gated (QA semantics) and reports gated: true', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(prisma, INPUT, ctx)
    expect(result.gated).toBe(true)
    expect(result.contractStatus).toBe('SIGNED')
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })

  it('S1: staging draft with the env flag LIFTED still reports gated: true (isDraft watermark)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(prisma, INPUT, ctx)
    expect(result.gated).toBe(true)
    expect(result.contractStatus).toBe('SIGNED')
  })

  it('writes the complete evidence record (incl. reviewedBody/hash/pdfHash) + pointer + status flip + audit in ONE transaction', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(prisma, INPUT, ctx)

    expect(prisma.$transaction).toHaveBeenCalledOnce()
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record).toMatchObject({
      merchantId: MERCHANT_ID,
      agreementVersion: CURRENT.version,
      contentHash: CURRENT.contentHash,
      signerName: 'Priya Nair',
      signerRoleConfirmation: 'Owner',
      actorAdminId: WITNESS,
      method: 'IN_PERSON_ASSISTED',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      pdfKey: 'document/m1/deadbeefdeadbeef.pdf',
    })
    // D65 personalised-agreement columns.
    expect(record.reviewedBody).toContain('Priya Nair')
    expect(record.reviewedBody).toContain('Kovalam Tandoori Ltd')
    expect(record.reviewedContentHash).toBe(computeContentHash(record.reviewedBody))
    expect(record.reviewedContentHash).toBe(expectedCeremonyHash())
    expect(record.pdfHash).toMatch(/^[0-9a-f]{64}$/)
    expect(record.signedAt).toBeInstanceOf(Date)

    const upsert = tx.merchantContract.upsert.mock.calls[0][0]
    expect(upsert.where).toEqual({ merchantId: MERCHANT_ID })
    expect(upsert.create.signatureMethod).toBe('CLICK_TO_AGREE')
    expect(upsert.create.tcVersion).toBe(CURRENT.version)

    const flip = tx.merchant.updateMany.mock.calls[0][0]
    expect(flip.where).toMatchObject({ id: MERCHANT_ID, contractStatus: { not: 'SIGNED' } })
    expect(flip.data).toMatchObject({ contractStatus: 'SIGNED' })
    expect(flip.data.contractStartDate).toBeInstanceOf(Date)
    expect(tx.merchant.update).not.toHaveBeenCalled()

    const audit = tx.auditLog.create.mock.calls[0][0].data
    expect(audit.event).toBe('MERCHANT_AGREEMENT_SIGNED_IN_PERSON')
    expect(audit.actorId).toBe(WITNESS)
    expect(audit.actorType).toBe('ADMIN')
    expect(audit.metadata).toMatchObject({
      agreementVersion: CURRENT.version,
      contentHash: CURRENT.contentHash,
      method: 'IN_PERSON_ASSISTED',
      recordId: 'rec-1',
    })
    expect(JSON.stringify(audit.metadata)).not.toContain('Priya Nair')

    expect(result.recordId).toBe('rec-1')
    expect(result.agreementVersion).toBe(CURRENT.version)
    expect(result.contentHash).toBe(CURRENT.contentHash)
  })

  it('the PDF body is the exact reviewedBody (not the raw template); the renderer is passed reviewedBody', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await signAgreementInPerson(prisma, INPUT, ctx)
    const pdfArg = (renderAgreementPdf as any).mock.calls[0][0]
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(pdfArg.reviewedBody).toBe(record.reviewedBody)
    // The renderer no longer receives the raw canonical source or the identity fields to
    // substitute (they are already resolved in reviewedBody).
    expect(pdfArg.content).toBeUndefined()
    expect(pdfArg.businessLegalName).toBeUndefined()
  })

  // reviewedContentHash echo integrity (decision doc §4/§10).
  it('AGREEMENT_REVIEW_HASH_MISMATCH: a tampered echo is refused BEFORE any PDF/DB/status/audit', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      signAgreementInPerson(prisma, { ...INPUT, reviewedContentHash: 'deadbeef-not-the-hash' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_REVIEW_HASH_MISMATCH' })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('a correct client-echoed reviewedContentHash passes the integrity check and signs', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(
      prisma,
      { ...INPUT, reviewedContentHash: expectedCeremonyHash() },
      ctx,
    )
    expect(result.contractStatus).toBe('SIGNED')
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.reviewedContentHash).toBe(expectedCeremonyHash())
  })

  // FIX 1 bypass reproductions: BEFORE this fix the service checks were
  // `if (input.agreementVersion && ...)` / `if (input.reviewedContentHash && ...)`, so an
  // OMITTED echo NO-OP'd and the ceremony signed anyway. Now a missing/empty echo is treated as a
  // mismatch and NOTHING binds (no PDF, no upload, no transaction, no status flip, no audit).
  it('FIX 1 (bypass repro): OMITTING agreementVersion is refused (AGREEMENT_VERSION_MISMATCH), nothing written', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const { agreementVersion: _omit, ...noVersion } = INPUT
    await expect(signAgreementInPerson(prisma, noVersion as any, ctx)).rejects.toMatchObject({
      code: 'AGREEMENT_VERSION_MISMATCH',
    })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('FIX 1 (bypass repro): OMITTING reviewedContentHash is refused (AGREEMENT_REVIEW_HASH_MISMATCH), nothing written', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const { reviewedContentHash: _omit, ...noHash } = INPUT
    await expect(signAgreementInPerson(prisma, noHash as any, ctx)).rejects.toMatchObject({
      code: 'AGREEMENT_REVIEW_HASH_MISMATCH',
    })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('FIX 1: an EMPTY agreementVersion is refused (AGREEMENT_VERSION_MISMATCH)', async () => {
    const prisma = makePrisma(makeTx())
    await expect(signAgreementInPerson(prisma, { ...INPUT, agreementVersion: '' }, ctx)).rejects.toMatchObject({
      code: 'AGREEMENT_VERSION_MISMATCH',
    })
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('FIX 1: a whitespace-only reviewedContentHash is refused (AGREEMENT_REVIEW_HASH_MISMATCH)', async () => {
    const prisma = makePrisma(makeTx())
    await expect(signAgreementInPerson(prisma, { ...INPUT, reviewedContentHash: '   ' }, ctx)).rejects.toMatchObject({
      code: 'AGREEMENT_REVIEW_HASH_MISMATCH',
    })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('pins version + hash from the REGISTRY server-side: a stale/mismatched client echo is refused (409) before any read or write', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      signAgreementInPerson(prisma, { ...INPUT, agreementVersion: '1.0' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_VERSION_MISMATCH' })
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('an explicit client version equal to the current version passes the integrity echo and signs', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(prisma, { ...INPUT, agreementVersion: CURRENT.version }, ctx)
    expect(result.agreementVersion).toBe(CURRENT.version)
    expect(result.contractStatus).toBe('SIGNED')
  })

  it('blocks a double sign via the fast pre-check (contractStatus already SIGNED)', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx, { ...MERCHANT_ROW, contractStatus: 'SIGNED' })
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
  })

  it('N1 (TOCTOU): the in-tx conditional guard loses the race and writes NO evidence row', async () => {
    const tx = makeTx()
    tx.merchant.updateMany.mockResolvedValue({ count: 0 })
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
    expect(tx.merchantContract.upsert).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('404s an unknown merchant', async () => {
    const prisma = makePrisma(makeTx(), null)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'MERCHANT_NOT_FOUND',
    })
  })

  it('witness-integrity: empty signer name / role / witness all refuse', async () => {
    const prisma = makePrisma(makeTx())
    await expect(
      signAgreementInPerson(prisma, { ...INPUT, signerName: '   ' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
    await expect(
      signAgreementInPerson(prisma, { ...INPUT, signerRoleConfirmation: '' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
    await expect(
      signAgreementInPerson(prisma, { ...INPUT, actorAdminId: '' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('FIX 2: refuses when the authenticated rep does not resolve to a real admin', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    prisma.adminUser.findUnique.mockResolvedValue(null)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'AGREEMENT_SIGNER_INVALID',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('FIX 2: witness identity is looked up server-side (AdminUser) and persisted, never from the request', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await signAgreementInPerson(prisma, INPUT, ctx)
    expect(prisma.adminUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: WITNESS } }),
    )
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.witnessName).toBe(WITNESS_FULL_NAME)
    expect(record.witnessEmail).toBe(WITNESS_ADMIN.email)
    expect(record.actorAdminId).toBe(WITNESS)
    const rendered = (renderAgreementPdf as any).mock.calls[0][0]
    expect(rendered.witnessLabel).toContain(WITNESS_FULL_NAME)
    expect(rendered.witnessLabel).toContain(WITNESS_ADMIN.email)
  })

  it('FIX 2: a signer name equal to the rep own full name is refused (case-insensitive, trimmed)', async () => {
    await expect(
      signAgreementInPerson(makePrisma(makeTx()), { ...INPUT, signerName: 'sam rep' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
    await expect(
      signAgreementInPerson(makePrisma(makeTx()), { ...INPUT, signerName: '  Sam Rep  ' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
  })

  it('fails closed with STORAGE_NOT_ENABLED when storage is dark (no tx, no record)', async () => {
    process.env.STORAGE_ENABLED = 'false'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'STORAGE_NOT_ENABLED',
    })
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('stores the PDF as a private document object owned by the merchant', async () => {
    const prisma = makePrisma(makeTx())
    await signAgreementInPerson(prisma, INPUT, ctx)
    expect(putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'document',
        ownerId: MERCHANT_ID,
        contentType: 'application/pdf',
      }),
    )
  })

  it('upload-then-tx: a failed transaction best-effort deletes the orphaned PDF with the exact key, then rethrows', async () => {
    const tx = makeTx()
    const boom = new Error('db-down')
    tx.merchantAgreementRecord.create.mockRejectedValue(boom)
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toBe(boom)
    expect(deleteObject).toHaveBeenCalledWith('document/m1/deadbeefdeadbeef.pdf')
  })

  it('the losing concurrent ceremony (N1 guard) compensates the orphaned PDF', async () => {
    const tx = makeTx()
    tx.merchant.updateMany.mockResolvedValue({ count: 0 })
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(deleteObject).toHaveBeenCalledWith('document/m1/deadbeefdeadbeef.pdf')
  })

  it('a cleanup failure never masks the original transaction error', async () => {
    const tx = makeTx()
    const boom = new Error('db-down')
    tx.merchantAgreementRecord.create.mockRejectedValue(boom)
    ;(deleteObject as any).mockRejectedValueOnce(new Error('r2-cleanup-down'))
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toBe(boom)
  })

  it('FIX 4: an orphaned-PDF cleanup failure emits a HIGH-SEVERITY structured reconciliation alert', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tx = makeTx()
      const boom = new Error('db-down')
      tx.merchantAgreementRecord.create.mockRejectedValue(boom)
      ;(deleteObject as any).mockRejectedValueOnce(new Error('r2-cleanup-down'))
      const prisma = makePrisma(tx)
      await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toBe(boom)
      // Structured, greppable, high-severity, reconciliation-flagged, redacted (no signer PII).
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('[agreement][RECONCILE]'),
        expect.objectContaining({
          event: 'AGREEMENT_PDF_ORPHAN',
          severity: 'high',
          needsReconciliation: true,
          lane: 'assisted',
          merchantId: MERCHANT_ID,
          pdfKey: 'document/m1/deadbeefdeadbeef.pdf',
        }),
      )
      const payload = JSON.stringify(errSpy.mock.calls)
      expect(payload).not.toContain('Priya Nair')
      expect(payload).not.toContain('r2-cleanup-down') // raw provider text redacted (class only)
    } finally {
      errSpy.mockRestore()
    }
  })

  it('the success path never deletes the stored PDF', async () => {
    const prisma = makePrisma(makeTx())
    await signAgreementInPerson(prisma, INPUT, ctx)
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

describe('previewAgreement (personalised preview)', () => {
  it('returns the personalised body + a hash that == sha256(body) + matches what the ceremony signs', async () => {
    const prisma = makePrisma(makeTx())
    const preview = await previewAgreement(prisma, MERCHANT_ID, {
      signerName: '  Priya   Nair ',
      signerRoleConfirmation: 'Owner',
    })
    expect(preview.version).toBe(CURRENT.version)
    expect(preview.canonicalContentHash).toBe(CURRENT.contentHash)
    expect(preview.isDraft).toBe(true)
    expect(preview.gated).toBe(true)
    expect(preview.personalisedText).toContain('Priya Nair')
    expect(preview.personalisedText).toContain('Kovalam Tandoori Ltd')
    expect(preview.reviewedContentHash).toBe(computeContentHash(preview.personalisedText))
    // Preview == what the ceremony will re-derive + sign (normalization collapses the messy input).
    expect(preview.reviewedContentHash).toBe(expectedCeremonyHash())
  })

  it('404s an unknown merchant', async () => {
    const prisma = makePrisma(makeTx(), null)
    await expect(
      previewAgreement(prisma, MERCHANT_ID, { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner' }),
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND' })
  })

  it('FIX 3: a whitespace-only signer name is rejected (AGREEMENT_SIGNER_INVALID) in the assisted preview', async () => {
    const prisma = makePrisma(makeTx())
    await expect(
      previewAgreement(prisma, MERCHANT_ID, { signerName: '   ', signerRoleConfirmation: 'Owner' }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
  })
})

describe('previewOwnContract (FIX 2: self-serve personalised preview)', () => {
  it('previews the SERVED version and returns the exact echo the v2+ self-serve accept re-derives', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging' // served = current draft (the D65 v2+ path)
    const prisma = makePrisma(makeTx())
    const preview = await previewOwnContract(prisma, MERCHANT_ID, {
      signerName: '  Priya   Nair ',
      signerRoleConfirmation: 'Owner',
    })
    expect(preview.version).toBe(CURRENT.version)
    expect(preview.canonicalContentHash).toBe(CURRENT.contentHash)
    expect(preview.isDraft).toBe(true)
    expect(preview.gated).toBe(true)
    expect(preview.personalisedText).toContain('Priya Nair')
    expect(preview.personalisedText).toContain('Kovalam Tandoori Ltd')
    expect(preview.reviewedContentHash).toBe(computeContentHash(preview.personalisedText))
    // The preview hash IS the mandatory echo the v2+ self-serve accept requires.
    expect(preview.reviewedContentHash).toBe(expectedSelfServeHash())
  })

  it('FIX 3: a non-breaking-space-only signer name is rejected (AGREEMENT_SIGNER_INVALID)', async () => {
    const prisma = makePrisma(makeTx())
    await expect(
      previewOwnContract(prisma, MERCHANT_ID, { signerName: ' ', signerRoleConfirmation: 'Owner' }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
  })

  it('404s an unknown merchant', async () => {
    const prisma = makePrisma(makeTx(), null)
    await expect(
      previewOwnContract(prisma, MERCHANT_ID, { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner' }),
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND' })
  })
})

describe('renderAndStoreAgreementPdf storage fail-closed + pdfHash', () => {
  const RENDER_INPUT = {
    merchantId: MERCHANT_ID,
    agreement: CURRENT,
    reviewedBody: 'personalised body bytes',
    signerName: 'Priya Nair',
    method: 'IN_PERSON_ASSISTED' as const,
    witnessLabel: null,
    signedAt: new Date(),
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  }

  it('throws STORAGE_NOT_ENABLED before rendering when storage is off', async () => {
    process.env.STORAGE_ENABLED = 'false'
    await expect(renderAndStoreAgreementPdf(RENDER_INPUT)).rejects.toMatchObject({ code: 'STORAGE_NOT_ENABLED' })
    expect(putObject).not.toHaveBeenCalled()
  })

  it('returns { key, pdfHash } with pdfHash == sha256 of the exact rendered bytes', async () => {
    const { key, pdfHash } = await renderAndStoreAgreementPdf(RENDER_INPUT)
    expect(key).toBe('document/m1/deadbeefdeadbeef.pdf')
    expect(pdfHash).toBe(computeContentHash('%PDF-mock')) // the mocked renderer's bytes
  })
})

describe('acceptContract self-serve: D65 v2+ path', () => {
  // FIX 2: the v2+ self-serve path now REQUIRES a valid reviewedContentHash echo (parity with the
  // assisted ceremony). SIGNER carries the honest self-serve echo; the signer-invalid /
  // double-sign / stale-version tests throw BEFORE the echo check, so they omit/override it.
  const SIGNER = { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner', reviewedContentHash: expectedSelfServeHash() }

  it('writes a SELF_SERVE_CLICK record (null actorAdminId) with reviewedBody/hash/pdfHash + real signer name + role', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)
    expect(result.accepted).toBe(true)

    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record).toMatchObject({
      merchantId: MERCHANT_ID,
      method: 'SELF_SERVE_CLICK',
      actorAdminId: null,
      signerName: 'Priya Nair',
      signerRoleConfirmation: 'Owner',
      agreementVersion: CURRENT.version,
      contentHash: CURRENT.contentHash,
      pdfKey: 'document/m1/deadbeefdeadbeef.pdf',
    })
    expect(record.reviewedBody).toContain('Priya Nair')
    expect(record.reviewedContentHash).toBe(computeContentHash(record.reviewedBody))
    expect(record.pdfHash).toMatch(/^[0-9a-f]{64}$/)

    const events = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.event)
    expect(events).toContain('MERCHANT_CONTRACT_ACCEPTED')
    expect(events).toContain('MERCHANT_AGREEMENT_SIGNED_SELF_SERVE')
    expect(tx.merchantContract.create).toHaveBeenCalledOnce()
    expect(tx.merchant.update.mock.calls[0][0].data).toMatchObject({ contractStatus: 'SIGNED' })
  })

  it('requires a real signer name AND role (AGREEMENT_SIGNER_INVALID otherwise), before any write', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', CURRENT.version, ctx)).rejects.toMatchObject({
      code: 'AGREEMENT_SIGNER_INVALID',
    })
    await expect(
      acceptContract(prisma, 'ma1', CURRENT.version, ctx, { signerName: 'Priya Nair' }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('fails closed with STORAGE_NOT_ENABLED when storage is dark (no PDF, no record, no flip)', async () => {
    process.env.STORAGE_ENABLED = 'false'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // SIGNER carries a valid echo, so the review-binding check passes and the storage fail-closed
    // gate is what refuses (proving the echo check sits BEFORE storage, both pre-write).
    await expect(acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)).rejects.toMatchObject({
      code: 'STORAGE_NOT_ENABLED',
    })
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  // FIX 2 bypass reproduction: BEFORE this fix the self-serve accept took NO reviewedContentHash,
  // so a merchant-web click bound a v2+ signature without proving the EXACT personalised body was
  // reviewed. Now a missing/tampered echo fails closed (409) before any PDF/upload/write.
  it('FIX 2 (bypass repro): v2+ self-serve with a MISSING echo is refused (AGREEMENT_REVIEW_HASH_MISMATCH) before any write', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      acceptContract(prisma, 'ma1', CURRENT.version, ctx, { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner' }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_REVIEW_HASH_MISMATCH' })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('FIX 2: v2+ self-serve with a TAMPERED echo is refused (AGREEMENT_REVIEW_HASH_MISMATCH) before any write', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      acceptContract(prisma, 'ma1', CURRENT.version, ctx, { ...SIGNER, reviewedContentHash: 'deadbeef-not-the-hash' }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_REVIEW_HASH_MISMATCH' })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('FIX 2: v2+ self-serve with a VALID echo signs the full evidence record', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)
    expect(result.accepted).toBe(true)
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.method).toBe('SELF_SERVE_CLICK')
    expect(record.reviewedContentHash).toBe(expectedSelfServeHash())
  })

  it('FIX 4: a self-serve orphaned-PDF cleanup failure emits the HIGH-SEVERITY structured reconciliation alert (lane self-serve)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tx = makeTx()
      const boom = new Error('db-down')
      tx.merchantContract.create.mockRejectedValue(boom)
      ;(deleteObject as any).mockRejectedValueOnce(new Error('r2-cleanup-down'))
      const prisma = makePrisma(tx)
      await expect(acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)).rejects.toBe(boom)
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('[agreement][RECONCILE]'),
        expect.objectContaining({
          event: 'AGREEMENT_PDF_ORPHAN',
          severity: 'high',
          needsReconciliation: true,
          lane: 'self-serve',
          pdfKey: 'document/m1/deadbeefdeadbeef.pdf',
        }),
      )
    } finally {
      errSpy.mockRestore()
    }
  })

  it('double sign still refused (CONTRACT_ALREADY_SIGNED) before any write', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx, { ...MERCHANT_ROW, contractStatus: 'SIGNED' })
    await expect(acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('upload-then-tx: a failed transaction best-effort deletes the orphaned PDF then rethrows', async () => {
    const tx = makeTx()
    const boom = new Error('db-down')
    tx.merchantContract.create.mockRejectedValue(boom)
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)).rejects.toBe(boom)
    expect(deleteObject).toHaveBeenCalledWith('document/m1/deadbeefdeadbeef.pdf')
  })

  // NOTE 2 (self-serve double-sign RACE): the fast contractStatus pre-check is not atomic
  // against a concurrent accept, so the race loser's merchantContract.create can hit the
  // MerchantContract.merchantId @unique inside the transaction. A simulated P2002 there must
  // map to the same clean CONTRACT_ALREADY_SIGNED (409) the pre-check returns, not surface as
  // an unhandled 500, AND the orphaned-PDF compensation must still run first.
  it('NOTE 2: a simulated P2002 on the contract-unique maps to CONTRACT_ALREADY_SIGNED, with orphan PDF cleanup still invoked', async () => {
    const tx = makeTx()
    const raceLoss = Object.assign(new Error('Unique constraint failed on the fields: (`merchantId`)'), {
      code: 'P2002',
      meta: { target: ['merchantId'] },
    })
    tx.merchantContract.create.mockRejectedValue(raceLoss)
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(deleteObject).toHaveBeenCalledWith('document/m1/deadbeefdeadbeef.pdf')
  })

  it('NOTE 2: a P2002-mapped race loss still emits the orphan-PDF reconciliation alert on a cleanup failure', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const tx = makeTx()
      const raceLoss = Object.assign(new Error('Unique constraint failed on the fields: (`merchantId`)'), {
        code: 'P2002',
        meta: { target: ['merchantId'] },
      })
      tx.merchantContract.create.mockRejectedValue(raceLoss)
      ;(deleteObject as any).mockRejectedValueOnce(new Error('r2-cleanup-down'))
      const prisma = makePrisma(tx)
      await expect(acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)).rejects.toMatchObject({
        code: 'CONTRACT_ALREADY_SIGNED',
      })
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('[agreement][RECONCILE]'),
        expect.objectContaining({
          event: 'AGREEMENT_PDF_ORPHAN',
          severity: 'high',
          needsReconciliation: true,
          lane: 'self-serve',
          pdfKey: 'document/m1/deadbeefdeadbeef.pdf',
        }),
      )
    } finally {
      errSpy.mockRestore()
    }
  })

  it('S2: non-production binds the current draft with its own hash', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await acceptContract(prisma, 'ma1', CURRENT.version, ctx, SIGNER)
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.agreementVersion).toBe(CURRENT.version)
    expect(record.contentHash).toBe(CURRENT.contentHash)
  })

  it('stale echo (non-production, client sends 1.0 while the draft is served): 409, nothing written/stored', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', '1.0', ctx, SIGNER)).rejects.toMatchObject({
      code: 'AGREEMENT_VERSION_MISMATCH',
    })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

describe('acceptContract self-serve: LEGACY v1 path (outside D65)', () => {
  it('PRODUCTION binds the legacy 1.0 as MerchantContract-only: NO record, NO PDF, NO signer required', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // An honest production client echoes the served '1.0'; no signer name/role sent.
    const result = await acceptContract(prisma, 'ma1', '1.0', ctx)
    expect(result.accepted).toBe(true)
    expect(result.gated).toBe(false) // non-draft never watermarked
    // Legacy lane: contract row + flip + the one legacy audit; NO D65 evidence record, NO PDF.
    expect(tx.merchantContract.create.mock.calls[0][0].data.tcVersion).toBe('1.0')
    expect(tx.merchant.update.mock.calls[0][0].data).toMatchObject({ contractStatus: 'SIGNED' })
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    const events = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.event)
    expect(events).toContain('MERCHANT_CONTRACT_ACCEPTED')
    expect(events).not.toContain('MERCHANT_AGREEMENT_SIGNED_SELF_SERVE')
  })

  it('legacy path is NOT storage-gated: it binds even when storage is dark (v1 needs no PDF)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.STORAGE_ENABLED = 'false'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await acceptContract(prisma, 'ma1', '1.0', ctx)
    expect(result.accepted).toBe(true)
    expect(tx.merchant.update.mock.calls[0][0].data).toMatchObject({ contractStatus: 'SIGNED' })
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
  })

  it('legacy path tx failure has NO PDF to compensate', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    const tx = makeTx()
    tx.merchantContract.create.mockRejectedValue(new Error('db-down'))
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', '1.0', ctx)).rejects.toThrow()
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

// Version-integrity contract: the PDF, the immutable evidence record, and the
// MerchantContract.tcVersion pointer are all derived from ONE server-resolved served-agreement
// object, so they can never disagree. The client-echoed version is an integrity check only.
describe('version-integrity + parity: PDF + record + tcVersion never disagree', () => {
  const CEREMONY_INPUT = {
    merchantId: MERCHANT_ID,
    actorAdminId: WITNESS,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
    agreementVersion: CURRENT.version,
    reviewedContentHash: expectedCeremonyHash(),
  }

  it('self-serve (non-production, D65): PDF + record + tcVersion all carry the served current version', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await acceptContract(prisma, 'ma1', CURRENT.version, ctx, { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner', reviewedContentHash: expectedSelfServeHash() })
    const pdfArg = (renderAgreementPdf as any).mock.calls[0][0]
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    const contract = tx.merchantContract.create.mock.calls[0][0].data
    expect(pdfArg.version).toBe(CURRENT.version)
    expect(record.agreementVersion).toBe(CURRENT.version)
    expect(contract.tcVersion).toBe(CURRENT.version)
    // Both lanes share the reviewedBody module: the self-serve reviewed body embeds the SAME
    // personalisation the PDF renders.
    expect(pdfArg.reviewedBody).toBe(record.reviewedBody)
  })

  it('ceremony: PDF + evidence record + tcVersion pointer all carry the current version', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await signAgreementInPerson(prisma, CEREMONY_INPUT, ctx)
    const pdfArg = (renderAgreementPdf as any).mock.calls[0][0]
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    const upsert = tx.merchantContract.upsert.mock.calls[0][0]
    expect(pdfArg.version).toBe(CURRENT.version)
    expect(record.agreementVersion).toBe(CURRENT.version)
    expect(upsert.create.tcVersion).toBe(CURRENT.version)
    expect(upsert.update.tcVersion).toBe(CURRENT.version)
  })

  it('BOTH-LANES PARITY: the same signer + merchant yields the SAME reviewedContentHash in ceremony and self-serve, differing only by method label', async () => {
    // Ceremony record.
    const txC = makeTx()
    await signAgreementInPerson(makePrisma(txC), CEREMONY_INPUT, ctx)
    const ceremonyRecord = txC.merchantAgreementRecord.create.mock.calls[0][0].data
    // Self-serve record (non-production so the D65 path binds the same current version).
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    const txS = makeTx()
    await acceptContract(makePrisma(txS), 'ma1', CURRENT.version, ctx, { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner', reviewedContentHash: expectedSelfServeHash() })
    const selfServeRecord = txS.merchantAgreementRecord.create.mock.calls[0][0].data
    // The only difference is the method label inside the reviewed body.
    expect(ceremonyRecord.reviewedBody).not.toBe(selfServeRecord.reviewedBody)
    const norm = (b: string) => b.replace(/In-person assisted \(Redeemo representative device\)|Self-serve \(merchant portal click-to-agree\)/g, 'M')
    expect(norm(ceremonyRecord.reviewedBody)).toBe(norm(selfServeRecord.reviewedBody))
  })
})

// FIX 3: the DRAFT watermark reflects the VERSION's legal status ONLY, decoupled from the env flag.
describe('FIX 3: watermark = version.isDraft, env flag = ceremony gate', () => {
  const CEREMONY_INPUT = {
    merchantId: MERCHANT_ID,
    actorAdminId: WITNESS,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
    agreementVersion: CURRENT.version,
    reviewedContentHash: expectedCeremonyHash(),
  }

  it('prod + flag ON: self-serve binds the non-draft 1.0 (legacy lane, no PDF/record, result.gated false)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    delete process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await acceptContract(prisma, 'ma1', '1.0', ctx)
    expect(result.gated).toBe(false)
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
    expect(tx.merchantContract.create.mock.calls[0][0].data.tcVersion).toBe('1.0')
  })

  it('prod + flag OFF: the draft ceremony stays refused (isDraft binding block)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    await expect(
      signAgreementInPerson(makePrisma(makeTx()), CEREMONY_INPUT, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_LEGAL_REVIEW_REQUIRED' })
  })

  it('non-prod: the draft ceremony signs for QA and IS watermarked', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(prisma, CEREMONY_INPUT, ctx)
    expect(result.gated).toBe(true)
    expect((renderAgreementPdf as any).mock.calls[0][0].gated).toBe(true)
  })
})
