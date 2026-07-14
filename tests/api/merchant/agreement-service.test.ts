import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// D65 Slice 2 service suite (mocked Prisma + mocked storage; no DB, no R2).
// Load-bearing pins:
//  - LEGAL gate: AGREEMENT_LEGAL_REVIEW_REQUIRED defaults ON (fail-closed) and only
//    the literal 'false' lifts it; production identity comes from REDEEMO_DEPLOY_ENV
//    ('staging' => non-prod, 'production' => prod, unset => NODE_ENV fallback); a
//    gated PRODUCTION binding write is refused BEFORE any read/write, while staging
//    runs fully.
//  - Ceremony: ONE transaction containing the immutable record insert + the
//    MerchantContract upsert + the contractStatus flip + the in-tx audit; evidence
//    fields complete; version/hash pinned from the REGISTRY (never the caller);
//    double-sign guarded; witness-integrity invariants (same-name refusal; separateness not provable); storage fail-closed.
//  - Self-serve retrofit (acceptContract): SELF_SERVE_CLICK record with null
//    actorAdminId; typed name threaded; documented placeholder when absent;
//    storage-dark degrade (no record, contract flow intact).

// Mock the storage module BEFORE importing the services under test. putObject would
// otherwise construct a real S3 client; isStorageEnabled stays env-driven via the
// mock so each test controls it.
vi.mock('../../../src/api/shared/storage', () => ({
  isStorageEnabled: vi.fn(() => process.env.STORAGE_ENABLED === 'true'),
  putObject: vi.fn(async () => ({ key: 'document/m1/deadbeefdeadbeef.pdf' })),
  // FIX 1: compensation deletes the orphaned PDF on a failed/lost transaction.
  deleteObject: vi.fn(async () => {}),
}))

// Mock the PDF renderer: the ceremony service only needs a Buffer back (the real
// renderer has its own suite).
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
  SELF_SERVE_SIGNER_NOT_CAPTURED,
} from '../../../src/api/merchant/agreement/service'
import { acceptContract } from '../../../src/api/merchant/onboarding/service'
import { getAgreementVersion, getCurrentAgreement } from '../../../src/api/merchant/agreement/versions'
import { putObject, deleteObject } from '../../../src/api/shared/storage'
import { renderAgreementPdf } from '../../../src/api/merchant/agreement/pdf'
import { AppError } from '../../../src/api/shared/errors'

const ctx = { ipAddress: '203.0.113.9', userAgent: 'RedeemoRepTablet/1.0' }
const MERCHANT_ID = 'merch-tandoori-1'
const WITNESS = 'admin-rep-42'
// FIX 2: the authenticated rep identity resolved server-side from AdminUser.
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

function makeTx() {
  return {
    merchantAgreementRecord: {
      create: vi.fn().mockResolvedValue({ id: 'rec-1', signedAt: new Date('2026-07-14T10:00:00Z') }),
    },
    merchantContract: {
      upsert: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    // N1: the ceremony status flip is now an atomic conditional updateMany (guard).
    // Default: it matches one row (count 1). A double-sign test overrides to count 0.
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
    // FIX 2: witness identity lookup (the authenticated rep) resolves to a real admin.
    adminUser: { findUnique: vi.fn().mockResolvedValue(WITNESS_ADMIN) },
    // Self-serve path resolution (resolveAdminMerchant).
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
  // Deterministic baseline: staging identity + storage live + gate at default (unset).
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

  // REBASELINE (review-round S1): assertBindingWriteAllowed now takes the version being
  // written, and effective gating = version.isDraft OR legalReviewRequired(). The prior
  // no-arg pins are replaced by the version-aware matrix below.
  it('assertBindingWriteAllowed refuses ONLY gated + production (env-flag half, non-draft version)', () => {
    // Use a NON-draft version so this isolates the env-flag half of the OR.
    // gated (default flag on) + staging => allowed
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(() => assertBindingWriteAllowed(LEGACY)).not.toThrow()
    // gated (flag on) + production => refused
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    expect(() => assertBindingWriteAllowed(LEGACY)).toThrow(AppError)
    try {
      assertBindingWriteAllowed(LEGACY)
    } catch (e) {
      expect((e as AppError).code).toBe('AGREEMENT_LEGAL_REVIEW_REQUIRED')
    }
    // flag lifted + production + NON-draft => allowed (the owner's post-sign-off state)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    expect(() => assertBindingWriteAllowed(LEGACY)).not.toThrow()
  })

  it('S1: a DRAFT version is refused in PRODUCTION even with the env flag lifted (isDraft half)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    // Non-draft binds fine; the draft is still refused purely on isDraft.
    expect(() => assertBindingWriteAllowed(LEGACY)).not.toThrow()
    expect(() => assertBindingWriteAllowed(CURRENT)).toThrow(AppError)
    try {
      assertBindingWriteAllowed(CURRENT)
    } catch (e) {
      expect((e as AppError).code).toBe('AGREEMENT_LEGAL_REVIEW_REQUIRED')
    }
    // On staging the draft still runs fully (QA), gated:true (watermarked).
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(() => assertBindingWriteAllowed(CURRENT)).not.toThrow()
  })

  it('S1: isVersionGated = isDraft OR legalReviewRequired', () => {
    // Draft: gated regardless of the flag.
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    expect(CURRENT.isDraft).toBe(true)
    expect(isVersionGated(CURRENT)).toBe(true)
    // Non-draft: gated ONLY while the flag is on.
    expect(LEGACY.isDraft).toBe(false)
    expect(isVersionGated(LEGACY)).toBe(false)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'true'
    expect(isVersionGated(LEGACY)).toBe(true)
  })

  it('S2: getServedAgreement serves current in non-production, the legacy non-draft in production+draft', () => {
    // Non-production (staging): serve the current draft for QA.
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(getServedAgreement().version).toBe(CURRENT.version)
    expect(getServedAgreement().isDraft).toBe(true)
    // Production while current is a draft: serve the latest non-draft (legacy 1.0).
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    const served = getServedAgreement()
    expect(served.version).toBe('1.0')
    expect(served.isDraft).toBe(false)
    expect(served.content).toContain('Redeemo Merchant Agreement v1.0')
  })
})

describe('signAgreementInPerson (the assisted ceremony)', () => {
  const INPUT = {
    merchantId: MERCHANT_ID,
    actorAdminId: WITNESS,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
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
    // The draft is still watermarked (gated) even though the env flag is off.
    expect(result.gated).toBe(true)
    expect(result.contractStatus).toBe('SIGNED')
  })

  it('writes the complete evidence record + pointer + status flip + audit in ONE transaction', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(prisma, INPUT, ctx)

    // All four writes went through the SAME tx client, inside one $transaction.
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
    expect(record.signedAt).toBeInstanceOf(Date)

    // Pointer upsert keeps signatureMethod CLICK_TO_AGREE (spec §4.2).
    const upsert = tx.merchantContract.upsert.mock.calls[0][0]
    expect(upsert.where).toEqual({ merchantId: MERCHANT_ID })
    expect(upsert.create.signatureMethod).toBe('CLICK_TO_AGREE')
    expect(upsert.create.tcVersion).toBe(CURRENT.version)

    // Status flip is the atomic conditional guard (N1): updateMany scoped to a merchant
    // NOT already SIGNED, flipping to SIGNED + contractStartDate.
    const flip = tx.merchant.updateMany.mock.calls[0][0]
    expect(flip.where).toMatchObject({ id: MERCHANT_ID, contractStatus: { not: 'SIGNED' } })
    expect(flip.data).toMatchObject({ contractStatus: 'SIGNED' })
    expect(flip.data.contractStartDate).toBeInstanceOf(Date)
    // The plain update is no longer used for the ceremony status flip.
    expect(tx.merchant.update).not.toHaveBeenCalled()

    // In-tx audit: witnessing rep is the actor; metadata carries version+hash, no PII.
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

  it('pins version + hash from the REGISTRY server-side: a stale/mismatched client echo is refused (409) before any read or write', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // '1.0' is a known-but-stale version (not the current); a bogus id would behave
    // identically. The client echo is an integrity check, so either is a MISMATCH.
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
    // The merchant reads NOT_SIGNED (pre-check passes), but a concurrent ceremony has
    // already flipped it by the time this tx runs: the conditional updateMany matches 0
    // rows, so the loser throws CONTRACT_ALREADY_SIGNED and never inserts an evidence row.
    const tx = makeTx()
    tx.merchant.updateMany.mockResolvedValue({ count: 0 })
    const prisma = makePrisma(tx) // findUnique still returns NOT_SIGNED
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    // The guard runs BEFORE the record insert, so nothing was written.
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
    // The rep identity also reaches the PDF renderer as the witness display label.
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

  it('FIX 1: a failed transaction best-effort deletes the orphaned PDF with the exact key, then rethrows', async () => {
    const tx = makeTx()
    const boom = new Error('db-down')
    tx.merchantAgreementRecord.create.mockRejectedValue(boom)
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toBe(boom)
    expect(deleteObject).toHaveBeenCalledWith('document/m1/deadbeefdeadbeef.pdf')
  })

  it('FIX 1: the losing concurrent ceremony (N1 guard) compensates the orphaned PDF', async () => {
    const tx = makeTx()
    tx.merchant.updateMany.mockResolvedValue({ count: 0 })
    const prisma = makePrisma(tx)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(deleteObject).toHaveBeenCalledWith('document/m1/deadbeefdeadbeef.pdf')
  })

  it('FIX 1: a cleanup failure never masks the original transaction error', async () => {
    const tx = makeTx()
    const boom = new Error('db-down')
    tx.merchantAgreementRecord.create.mockRejectedValue(boom)
    ;(deleteObject as any).mockRejectedValueOnce(new Error('r2-cleanup-down'))
    const prisma = makePrisma(tx)
    // The ORIGINAL db error surfaces, not the cleanup error.
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toBe(boom)
  })

  it('FIX 1: the success path never deletes the stored PDF', async () => {
    const prisma = makePrisma(makeTx())
    await signAgreementInPerson(prisma, INPUT, ctx)
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

describe('renderAndStoreAgreementPdf storage fail-closed', () => {
  it('throws STORAGE_NOT_ENABLED before rendering when storage is off', async () => {
    process.env.STORAGE_ENABLED = 'false'
    await expect(
      renderAndStoreAgreementPdf({
        merchantId: MERCHANT_ID,
        agreement: CURRENT,
        signerName: 'Priya Nair',
        signerRoleConfirmation: 'Owner',
        businessLegalName: MERCHANT_ROW.businessName,
        method: 'IN_PERSON_ASSISTED',
        witnessLabel: null,
        signedAt: new Date(),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_NOT_ENABLED' })
    expect(putObject).not.toHaveBeenCalled()
  })
})

describe('acceptContract self-serve retrofit', () => {
  it('writes a SELF_SERVE_CLICK evidence record with NULL actorAdminId + threads the typed name', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await acceptContract(prisma, 'ma1', '2.0-draft', ctx, { signerName: 'Priya Nair' })
    expect(result.accepted).toBe(true)

    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record).toMatchObject({
      merchantId: MERCHANT_ID,
      method: 'SELF_SERVE_CLICK',
      actorAdminId: null,
      signerName: 'Priya Nair',
      agreementVersion: CURRENT.version,
      contentHash: CURRENT.contentHash,
      pdfKey: 'document/m1/deadbeefdeadbeef.pdf',
    })

    // Both audits written in-tx: the legacy contract-accepted + the D65 evidence one.
    const events = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.event)
    expect(events).toContain('MERCHANT_CONTRACT_ACCEPTED')
    expect(events).toContain('MERCHANT_AGREEMENT_SIGNED_SELF_SERVE')
    const selfServeAudit = tx.auditLog.create.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.event === 'MERCHANT_AGREEMENT_SIGNED_SELF_SERVE')
    expect(selfServeAudit.metadata.signerNameCaptured).toBe(true)
    // Contract row + status flip preserved (backward compat).
    expect(tx.merchantContract.create).toHaveBeenCalledOnce()
    expect(tx.merchant.update.mock.calls[0][0].data).toMatchObject({ contractStatus: 'SIGNED' })
  })

  it('absent typed name: records the documented placeholder + flags signerNameCaptured: false', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await acceptContract(prisma, 'ma1', '2.0-draft', ctx)
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.signerName).toBe(SELF_SERVE_SIGNER_NOT_CAPTURED)
    const selfServeAudit = tx.auditLog.create.mock.calls
      .map((c: any) => c[0].data)
      .find((d: any) => d.event === 'MERCHANT_AGREEMENT_SIGNED_SELF_SERVE')
    expect(selfServeAudit.metadata.signerNameCaptured).toBe(false)
  })

  it('storage dark: degrades to the pre-D65 flow (contract + flip + audit, NO evidence record)', async () => {
    process.env.STORAGE_ENABLED = 'false'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await acceptContract(prisma, 'ma1', '2.0-draft', ctx, { signerName: 'Priya Nair' })
    expect(result.accepted).toBe(true)
    expect(putObject).not.toHaveBeenCalled()
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
    // The legacy flow is intact.
    expect(tx.merchantContract.create).toHaveBeenCalledOnce()
    expect(tx.merchant.update.mock.calls[0][0].data).toMatchObject({ contractStatus: 'SIGNED' })
    const events = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.event)
    expect(events).toContain('MERCHANT_CONTRACT_ACCEPTED')
    expect(events).not.toContain('MERCHANT_AGREEMENT_SIGNED_SELF_SERVE')
  })

  it('double sign still refused (CONTRACT_ALREADY_SIGNED) before any write', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx, { ...MERCHANT_ROW, contractStatus: 'SIGNED' })
    await expect(acceptContract(prisma, 'ma1', '2.0-draft', ctx)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('S2: non-production binds the current 2.0-draft (QA)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await acceptContract(prisma, 'ma1', '2.0-draft', ctx, { signerName: 'Priya Nair' })
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.agreementVersion).toBe('2.0-draft')
    expect(record.contentHash).toBe(CURRENT.contentHash)
  })

  it('S2: PRODUCTION while current is a draft binds the LEGACY 1.0 with its own hash', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // acceptContract is NOT production-gated (self-serve keeps flipping in prod today);
    // it binds the SERVED agreement, which in production+draft is the legacy 1.0. An honest
    // production client fetched '1.0' from GET /contract, so it echoes '1.0' here.
    const result = await acceptContract(prisma, 'ma1', '1.0', ctx, { signerName: 'Priya Nair' })
    expect(result.accepted).toBe(true)
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.agreementVersion).toBe('1.0')
    expect(record.contentHash).toBe(LEGACY.contentHash)
    // Truthful evidence: the hash is over the legacy 1.0 text, not the draft.
    expect(record.contentHash).not.toBe(CURRENT.contentHash)
  })

  it('FIX 1: a failed self-serve transaction best-effort deletes the orphaned PDF then rethrows', async () => {
    const tx = makeTx()
    const boom = new Error('db-down')
    tx.merchantContract.create.mockRejectedValue(boom)
    const prisma = makePrisma(tx)
    await expect(
      acceptContract(prisma, 'ma1', '2.0-draft', ctx, { signerName: 'Priya Nair' }),
    ).rejects.toBe(boom)
    expect(deleteObject).toHaveBeenCalledWith('document/m1/deadbeefdeadbeef.pdf')
  })

  it('FIX 1: storage-dark self-serve has NO PDF to compensate on a tx failure', async () => {
    process.env.STORAGE_ENABLED = 'false'
    const tx = makeTx()
    tx.merchantContract.create.mockRejectedValue(new Error('db-down'))
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', '2.0-draft', ctx)).rejects.toThrow()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('FIX 1: the self-serve success path never deletes the stored PDF', async () => {
    const prisma = makePrisma(makeTx())
    await acceptContract(prisma, 'ma1', '2.0-draft', ctx, { signerName: 'Priya Nair' })
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

// Version-integrity contract (this correction round): the PDF, the immutable evidence
// record, and the MerchantContract.tcVersion pointer are all derived from ONE
// server-resolved served-agreement object, so they can never disagree. The client-echoed
// version is an integrity check only: a mismatch is refused (409) BEFORE any PDF
// render/upload, so no compensation is ever needed on that path.
describe('version-integrity: PDF + evidence record + tcVersion never disagree', () => {
  const CEREMONY_INPUT = {
    merchantId: MERCHANT_ID,
    actorAdminId: WITNESS,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
  }

  it('self-serve (non-production): all three sinks carry the SERVED current version', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging' // served = current draft
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await acceptContract(prisma, 'ma1', CURRENT.version, ctx, { signerName: 'Priya Nair' })
    const pdfArg = (renderAgreementPdf as any).mock.calls[0][0]
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    const contract = tx.merchantContract.create.mock.calls[0][0].data
    expect(pdfArg.version).toBe(CURRENT.version)
    expect(record.agreementVersion).toBe(CURRENT.version)
    expect(contract.tcVersion).toBe(CURRENT.version)
  })

  it('self-serve (production): all three sinks carry the SERVED legacy 1.0, not the draft', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production' // served = legacy 1.0
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await acceptContract(prisma, 'ma1', '1.0', ctx, { signerName: 'Priya Nair' })
    const pdfArg = (renderAgreementPdf as any).mock.calls[0][0]
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    const contract = tx.merchantContract.create.mock.calls[0][0].data
    expect(pdfArg.version).toBe('1.0')
    expect(record.agreementVersion).toBe('1.0')
    expect(contract.tcVersion).toBe('1.0')
    // Truthful evidence: the hash is over the legacy 1.0 text, not the draft.
    expect(record.contentHash).toBe(LEGACY.contentHash)
    expect(record.contentHash).not.toBe(CURRENT.contentHash)
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

  it('self-serve stale echo (non-production, client sends 1.0 while the draft is served): 409, NO PDF/record/pointer/upload, no compensation', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging' // served = current draft
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      acceptContract(prisma, 'ma1', '1.0', ctx, { signerName: 'Priya Nair' }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_VERSION_MISMATCH' })
    // The mismatch check runs BEFORE the render/upload, so nothing was written or stored,
    // and there is no orphan to compensate.
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('self-serve stale echo (production, client sends the draft while 1.0 is served): 409, nothing written', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production' // served = legacy 1.0
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      acceptContract(prisma, 'ma1', '2.0-draft', ctx, { signerName: 'Priya Nair' }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_VERSION_MISMATCH' })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

// FIX 3: the DRAFT watermark reflects the VERSION's legal status ONLY, decoupled from the
// AGREEMENT_LEGAL_REVIEW_REQUIRED env flag. The env flag is the ceremony ENABLEMENT gate.
// Net matrix pinned here (watermark column = renderAgreementPdf `gated` arg + result.gated):
//   prod + flag ON  : self-serve binds 1.0 CLEAN (no watermark); ceremony refused.
//   prod + flag OFF : self-serve binds 1.0 CLEAN (no watermark); draft ceremony still refused.
//   non-prod        : draft signs for QA, watermarked.
describe('FIX 3: watermark = version.isDraft, env flag = ceremony gate', () => {
  const CEREMONY_INPUT = {
    merchantId: MERCHANT_ID,
    actorAdminId: WITNESS,
    signerName: 'Priya Nair',
    signerRoleConfirmation: 'Owner',
  }

  it('prod + flag ON: self-serve binds the non-draft 1.0 with a CLEAN (unwatermarked) PDF', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    delete process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED // flag ON (default)
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // Production serves the legacy 1.0; the honest client echoes the served '1.0'.
    const result = await acceptContract(prisma, 'ma1', '1.0', ctx, { signerName: 'Priya Nair' })
    // Non-draft => not watermarked, even though legal review is still required (flag on).
    expect(result.gated).toBe(false)
    expect((renderAgreementPdf as any).mock.calls[0][0].gated).toBe(false)
    expect(tx.merchantAgreementRecord.create.mock.calls[0][0].data.agreementVersion).toBe('1.0')
  })

  it('prod + flag OFF: self-serve binds 1.0 CLEAN; the draft ceremony stays refused', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // Production serves the legacy 1.0; the honest client echoes the served '1.0'.
    const result = await acceptContract(prisma, 'ma1', '1.0', ctx, { signerName: 'Priya Nair' })
    expect(result.gated).toBe(false)
    expect((renderAgreementPdf as any).mock.calls[0][0].gated).toBe(false)
    // The ceremony (current draft) is still refused in production even with the flag off.
    await expect(
      signAgreementInPerson(makePrisma(makeTx()), CEREMONY_INPUT, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_LEGAL_REVIEW_REQUIRED' })
  })

  it('non-prod: the draft signs for QA and IS watermarked', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    const result = await signAgreementInPerson(prisma, CEREMONY_INPUT, ctx)
    expect(result.gated).toBe(true) // draft => watermarked
    expect((renderAgreementPdf as any).mock.calls[0][0].gated).toBe(true)
  })
})
