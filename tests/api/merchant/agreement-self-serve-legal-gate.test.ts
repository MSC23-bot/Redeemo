import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Codex legal-gate parity regression: the self-serve acceptContract v2+ path must call
// assertBindingWriteAllowed exactly like the assisted signAgreementInPerson ceremony, so a
// gated PRODUCTION binding write is refused with AGREEMENT_LEGAL_REVIEW_REQUIRED BEFORE any
// write. Production is safe TODAY only because getServedAgreement() serves the legacy non-draft
// v1 (which takes the separate legacy lane) while v2 is a draft. This suite models the future
// state the bug would expose: a NON-DRAFT, non-legacy v2 becomes the SERVED version while
// AGREEMENT_LEGAL_REVIEW_REQUIRED is still on. To reach the v2+ path in production we must serve
// a non-draft, non-legacy version (a draft served in prod falls back to legacy v1), so we
// partial-mock ONLY getServedAgreement to return a synthetic frozen v2; the REAL
// assertBindingWriteAllowed (the function under test) is preserved from the actual module.

vi.mock('../../../src/api/shared/storage', () => ({
  isStorageEnabled: vi.fn(() => process.env.STORAGE_ENABLED === 'true'),
  putObject: vi.fn(async () => ({ key: 'document/m1/deadbeefdeadbeef.pdf' })),
  deleteObject: vi.fn(async () => {}),
}))

// Mock the PDF renderer (the real renderer has its own suite): renderAndStoreAgreementPdf still
// runs for real over these bytes, so a non-refused path exercises the full render/store/hash.
vi.mock('../../../src/api/merchant/agreement/pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/merchant/agreement/pdf')>()
  return { ...actual, renderAgreementPdf: vi.fn(async () => Buffer.from('%PDF-mock')) }
})

// Partial-mock the agreement service: override ONLY getServedAgreement (so we can inject a
// non-draft served version) and keep every other export real, crucially assertBindingWriteAllowed
// (the gate under test), renderAndStoreAgreementPdf, isVersionWatermarked, reportOrphanedAgreementPdf.
// getServedAgreement is left as a bare vi.fn here (no return value baked into the hoisted factory,
// avoiding the vi.mock hoisting trap); each test's served version is set in beforeEach / per test.
vi.mock('../../../src/api/merchant/agreement/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/merchant/agreement/service')>()
  return { ...actual, getServedAgreement: vi.fn() }
})

import { getServedAgreement } from '../../../src/api/merchant/agreement/service'
import { acceptContract } from '../../../src/api/merchant/onboarding/service'
import {
  getCurrentAgreement,
  getAgreementVersion,
  computeContentHash,
  type AgreementVersion,
} from '../../../src/api/merchant/agreement/versions'
import { renderReviewedBody } from '../../../src/api/merchant/agreement/reviewedBody'
import { putObject, deleteObject } from '../../../src/api/shared/storage'
import { renderAgreementPdf } from '../../../src/api/merchant/agreement/pdf'

const ctx = { ipAddress: '203.0.113.9', userAgent: 'RedeemoMerchantWeb/1.0' }
const MERCHANT_ID = 'merch-tandoori-1'
const LEGACY = getAgreementVersion('1.0')!

// The synthetic FROZEN, NON-DRAFT v2 the future state serves in production. Same body as the
// current draft but a non-draft, non-legacy id: this is the exact case the gate must refuse
// while legal review is still required (draft-served-in-prod falls back to legacy v1 instead).
const CURRENT = getCurrentAgreement()
const FROZEN_V2: AgreementVersion = {
  version: '2.0',
  content: CURRENT.content,
  contentHash: computeContentHash(CURRENT.content),
  isDraft: false,
}

const MERCHANT_ROW = {
  contractStatus: 'NOT_SIGNED',
  businessName: 'Kovalam Tandoori Ltd',
  tradingName: 'Kovalam Tandoori',
  companyNumber: '01234567',
  vatNumber: 'GB999999973',
}

// The honest self-serve echo for FROZEN_V2 + the standard identity (the valid reviewedContentHash
// the v2+ path requires once past the gate).
function frozenSelfServeHash() {
  return renderReviewedBody({
    version: FROZEN_V2.version,
    canonicalContentHash: FROZEN_V2.contentHash,
    content: FROZEN_V2.content,
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
    merchantAgreementRecord: { create: vi.fn().mockResolvedValue({ id: 'rec-1' }) },
    merchantContract: { create: vi.fn().mockResolvedValue({}) },
    merchant: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
}

function makePrisma(tx: any, merchantRow: Record<string, unknown> | null = MERCHANT_ROW) {
  return {
    $transaction: vi.fn().mockImplementation(async (cb: any) => cb(tx)),
    merchant: { findUnique: vi.fn().mockResolvedValue(merchantRow) },
    merchantAdmin: { findUnique: vi.fn().mockResolvedValue({ id: 'ma1', merchantId: MERCHANT_ID }) },
    merchantMembership: {
      findFirst: vi.fn().mockResolvedValue({ id: 'mm1', merchantId: MERCHANT_ID, merchantAdminId: 'ma1', role: 'OWNER' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any
}

const SIGNER = { signerName: 'Priya Nair', signerRoleConfirmation: 'Owner', reviewedContentHash: frozenSelfServeHash() }

const ORIGINAL_ENV = { ...process.env }
beforeEach(() => {
  vi.clearAllMocks()
  process.env.REDEEMO_DEPLOY_ENV = 'production'
  process.env.STORAGE_ENABLED = 'true'
  delete process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED
  // Default: a frozen NON-DRAFT v2 is the served version (the future state).
  vi.mocked(getServedAgreement).mockReturnValue(FROZEN_V2)
})
afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('acceptContract self-serve v2+ legal-release gate (Codex parity fix)', () => {
  it('1. PRODUCTION + non-draft v2 served + gate ON: throws AGREEMENT_LEGAL_REVIEW_REQUIRED and performs ZERO writes/uploads', async () => {
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'true'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', FROZEN_V2.version, ctx, SIGNER)).rejects.toMatchObject({
      code: 'AGREEMENT_LEGAL_REVIEW_REQUIRED',
    })
    // Non-vacuous: NOTHING renders, uploads, transacts, or writes on the gated path.
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.merchantContract.create).not.toHaveBeenCalled()
    expect(tx.merchant.update).not.toHaveBeenCalled()
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('1b. gate ON default (env var unset, fail-closed): still throws AGREEMENT_LEGAL_REVIEW_REQUIRED, ZERO writes', async () => {
    delete process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED // defaults to required
    const tx = makeTx()
    const prisma = makePrisma(tx)
    await expect(acceptContract(prisma, 'ma1', FROZEN_V2.version, ctx, SIGNER)).rejects.toMatchObject({
      code: 'AGREEMENT_LEGAL_REVIEW_REQUIRED',
    })
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
  })

  it('2. PRODUCTION + non-draft v2 served + gate OFF: proceeds PAST the gate and binds the full evidence record', async () => {
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'false'
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // A valid echo, so once past the gate the path runs to completion. If the gate had fired,
    // this would reject AGREEMENT_LEGAL_REVIEW_REQUIRED instead.
    const result = await acceptContract(prisma, 'ma1', FROZEN_V2.version, ctx, SIGNER)
    expect(result.accepted).toBe(true)
    expect(result.gated).toBe(false) // non-draft is never watermarked
    expect(renderAgreementPdf).toHaveBeenCalledOnce()
    const record = tx.merchantAgreementRecord.create.mock.calls[0][0].data
    expect(record.method).toBe('SELF_SERVE_CLICK')
    expect(record.agreementVersion).toBe(FROZEN_V2.version)
    expect(record.reviewedContentHash).toBe(frozenSelfServeHash())
  })

  it('3. LEGACY v1 (production served): UNCHANGED by the new guard: binds MerchantContract-only, no record, not refused by the gate', async () => {
    // Even with gate ON in production, the legacy lane returns BEFORE the new guard.
    process.env.AGREEMENT_LEGAL_REVIEW_REQUIRED = 'true'
    vi.mocked(getServedAgreement).mockReturnValue(LEGACY)
    const tx = makeTx()
    const prisma = makePrisma(tx)
    // No signer name/role needed for v1 (it makes no D65 evidence claim); an honest client echoes '1.0'.
    const result = await acceptContract(prisma, 'ma1', '1.0', ctx)
    expect(result.accepted).toBe(true)
    expect(result.gated).toBe(false)
    // Legacy lane: MerchantContract + flip + legacy audit only. NO D65 record, NO PDF, NOT gated.
    expect(tx.merchantContract.create.mock.calls[0][0].data.tcVersion).toBe('1.0')
    expect(tx.merchant.update.mock.calls[0][0].data).toMatchObject({ contractStatus: 'SIGNED' })
    expect(tx.merchantAgreementRecord.create).not.toHaveBeenCalled()
    expect(renderAgreementPdf).not.toHaveBeenCalled()
    expect(putObject).not.toHaveBeenCalled()
    const events = tx.auditLog.create.mock.calls.map((c: any) => c[0].data.event)
    expect(events).toContain('MERCHANT_CONTRACT_ACCEPTED')
    expect(events).not.toContain('MERCHANT_AGREEMENT_SIGNED_SELF_SERVE')
  })
})
