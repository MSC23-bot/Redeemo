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
//    double-sign guarded; admin-never-signs invariants; storage fail-closed.
//  - Self-serve retrofit (acceptContract): SELF_SERVE_CLICK record with null
//    actorAdminId; typed name threaded; documented placeholder when absent;
//    storage-dark degrade (no record, contract flow intact).

// Mock the storage module BEFORE importing the services under test. putObject would
// otherwise construct a real S3 client; isStorageEnabled stays env-driven via the
// mock so each test controls it.
vi.mock('../../../src/api/shared/storage', () => ({
  isStorageEnabled: vi.fn(() => process.env.STORAGE_ENABLED === 'true'),
  putObject: vi.fn(async () => ({ key: 'document/m1/deadbeefdeadbeef.pdf' })),
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
  assertBindingWriteAllowed,
  signAgreementInPerson,
  renderAndStoreAgreementPdf,
  SELF_SERVE_SIGNER_NOT_CAPTURED,
} from '../../../src/api/merchant/agreement/service'
import { acceptContract } from '../../../src/api/merchant/onboarding/service'
import { getCurrentAgreement } from '../../../src/api/merchant/agreement/versions'
import { putObject } from '../../../src/api/shared/storage'
import { AppError } from '../../../src/api/shared/errors'

const ctx = { ipAddress: '203.0.113.9', userAgent: 'RedeemoRepTablet/1.0' }
const MERCHANT_ID = 'merch-tandoori-1'
const WITNESS = 'admin-rep-42'
const CURRENT = getCurrentAgreement()

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
    merchant: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
}

function makePrisma(tx: any, merchantRow: Record<string, unknown> | null = MERCHANT_ROW) {
  return {
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
    merchant: { findUnique: vi.fn().mockResolvedValue(merchantRow) },
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

  it('assertBindingWriteAllowed refuses ONLY gated + production', () => {
    // gated (default) + staging => allowed
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(() => assertBindingWriteAllowed()).not.toThrow()
    // gated + production => refused
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    expect(() => assertBindingWriteAllowed()).toThrow(AppError)
    try {
      assertBindingWriteAllowed()
    } catch (e) {
      expect((e as AppError).code).toBe('AGREEMENT_LEGAL_REVIEW_REQUIRED')
    }
    // gate lifted + production => allowed (the owner's post-sign-off state)
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    expect(() => assertBindingWriteAllowed()).not.toThrow()
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

    // Status flip + contractStartDate.
    expect(tx.merchant.update.mock.calls[0][0].data).toMatchObject({ contractStatus: 'SIGNED' })
    expect(tx.merchant.update.mock.calls[0][0].data.contractStartDate).toBeInstanceOf(Date)

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

  it('pins version + hash from the REGISTRY: an unknown/stale version fails closed', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(
      signAgreementInPerson(prisma, { ...INPUT, agreementVersion: '1.0' }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_VERSION_UNKNOWN' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('blocks a double sign (contractStatus already SIGNED)', async () => {
    const tx = makeTx()
    const prisma = makePrisma(tx, { ...MERCHANT_ROW, contractStatus: 'SIGNED' })
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'CONTRACT_ALREADY_SIGNED',
    })
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
  })

  it('404s an unknown merchant', async () => {
    const prisma = makePrisma(makeTx(), null)
    await expect(signAgreementInPerson(prisma, INPUT, ctx)).rejects.toMatchObject({
      code: 'MERCHANT_NOT_FOUND',
    })
  })

  it('admin-never-signs: empty signer name / role and witness-as-signer all refuse', async () => {
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
    // The witness id typed AS the signature of record is refused.
    await expect(
      signAgreementInPerson(prisma, { ...INPUT, signerName: WITNESS }, ctx),
    ).rejects.toMatchObject({ code: 'AGREEMENT_SIGNER_INVALID' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
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
})
